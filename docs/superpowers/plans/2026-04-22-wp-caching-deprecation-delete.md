# create-wp Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache WordPress core downloads, fix DEP0190 deprecation warning, and add `--delete` CLI argument.

**Architecture:** Extend the existing `data.json` caching mechanism (already used for themes/plugins) to also cache WordPress core zip files. Replace `shell: true` in all `spawnSync` calls with resolved absolute paths to avoid the deprecation warning. Add argument parsing to the entry point to support `--delete <site-name>` for site removal.

**Tech Stack:** Node.js ESM, mysql2, child_process (spawnSync), fs, path, process.argv

---

## File Structure

| File                      | Action | Responsibility                                          |
| ------------------------- | ------ | ------------------------------------------------------- |
| `src/wordpress.js`        | Modify | Add version caching using `data.json` + `cache/` dirs  |
| `src/wpcli.js`            | Modify | Replace `shell: true` with resolved `wp` path           |
| `src/herd.js`             | Modify | Replace `shell: true` with resolved `herd` path         |
| `src/utils/which.js`      | Create | Cross-platform binary resolver (replaces `shell: true`) |
| `src/delete.js`           | Create | Delete site directory + database                        |
| `bin/create-wp.js` | Modify | Parse `--delete` arg, route to delete flow              |

---

### Task 1: Fix DEP0190 — Replace `shell: true` with resolved binary paths

The warning occurs because Node.js v22+ deprecates passing args to `spawnSync` with `shell: true`. The fix is to resolve the absolute path of `wp`/`herd` binaries and call `spawnSync` without `shell`.

**Files:**

- Create: `src/utils/which.js`
- Modify: `src/wpcli.js`
- Modify: `src/herd.js`

- [ ] **Step 1: Create `src/utils/which.js`**

```javascript
// src/utils/which.js
import { spawnSync } from 'child_process';
import fs from 'fs';

/**
 * Resolves the absolute path to a binary on the system.
 * On Windows, uses `where`; on macOS/Linux, uses `which`.
 * Returns null if the binary is not found.
 *
 * @param {string} name - Binary name (e.g. 'wp', 'herd')
 * @returns {string|null} Absolute path or null
 */
export function resolveCommand(name) {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(cmd, [name], {
        stdio: 'pipe',
        encoding: 'utf-8',
    });

    if (result.status !== 0 || result.error) return null;

    // `where` on Windows can return multiple lines; take the first
    const resolved = result.stdout.trim().split(/\r?\n/)[0]?.trim();
    if (!resolved || !fs.existsSync(resolved)) return null;

    return resolved;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `node --check src/utils/which.js`
Expected: No output (success)

- [ ] **Step 3: Update `src/wpcli.js` — remove `shell: true`, use `resolveCommand`**

Replace the full content of `src/wpcli.js`:

```javascript
// src/wpcli.js
import { spawnSync } from 'child_process';
import ora from 'ora';
import { resolveCommand } from './utils/which.js';

/** Cached resolved path to wp binary */
let wpPath = null;

/**
 * Returns the resolved absolute path to the wp binary.
 * Caches the result for subsequent calls.
 * @returns {string|null}
 */
function getWpPath() {
    if (wpPath === null) {
        wpPath = resolveCommand('wp') || false;
    }
    return wpPath || null;
}

/**
 * Checks whether WP-CLI is available in PATH.
 * @returns {boolean}
 */
function isWpCliAvailable() {
    return getWpPath() !== null;
}

/**
 * Runs a WP-CLI command in the given directory.
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string} stdout
 */
function runWp(args, cwd) {
    const resolved = getWpPath();
    if (!resolved) throw new Error('WP-CLI (wp) not found in PATH.');

    const result = spawnSync(resolved, args, {
        cwd,
        stdio: 'pipe',
        encoding: 'utf-8',
    });

    if (result.error || result.status !== 0) {
        const msg =
            result.stderr?.trim() ||
            result.stdout?.trim() ||
            `wp ${args[0]} failed`;
        throw new Error(msg);
    }

    return result.stdout?.trim() ?? '';
}

/**
 * Creates wp-config.php and installs WordPress core via WP-CLI.
 */
export async function setupWordPress({ sitePath, siteName, config }) {
    if (!isWpCliAvailable()) {
        throw new Error(
            'WP-CLI (wp) is not installed or not found in PATH.\n' +
                'Install it from: https://wp-cli.org/',
        );
    }

    const spinner = ora('Creating wp-config.php...').start();

    try {
        runWp(
            [
                'config',
                'create',
                `--dbname=${siteName}`,
                `--dbuser=${config.db_username}`,
                `--dbpass=${config.db_password}`,
                `--dbhost=127.0.0.1:${config.database_port}`,
                '--skip-check',
                '--force',
            ],
            sitePath,
        );

        spinner.text = 'Installing WordPress core...';
        runWp(
            [
                'core',
                'install',
                `--url=https://${siteName}.test`,
                `--title=${siteName}`,
                `--admin_user=${config.default_admin_username}`,
                `--admin_password=${config.default_admin_password}`,
                `--admin_email=${config.default_admin_email}`,
                '--skip-email',
            ],
            sitePath,
        );

        spinner.succeed('WordPress core installed successfully.');
    } catch (err) {
        spinner.fail('WP-CLI setup failed.');
        throw err;
    }
}

/**
 * Installs and activates a theme from a local zip file.
 */
export async function installTheme(sitePath, zipPath, name = 'theme') {
    const spinner = ora(`Installing theme: ${name}...`).start();
    try {
        runWp(['theme', 'install', zipPath, '--activate', '--force'], sitePath);
        spinner.succeed(`Theme installed: ${name}`);
    } catch (err) {
        spinner.fail(`Theme installation failed: ${name}`);
        throw err;
    }
}

/**
 * Installs and activates a plugin from a local zip file.
 * Non-fatal: logs a warning on failure and continues.
 */
export async function installPlugin(sitePath, zipPath, name = 'plugin') {
    const spinner = ora(`Installing plugin: ${name}...`).start();
    try {
        runWp(
            ['plugin', 'install', zipPath, '--activate', '--force'],
            sitePath,
        );
        spinner.succeed(`Plugin installed: ${name}`);
    } catch (err) {
        spinner.warn(`Plugin install failed (skipping): ${name}`);
    }
}
```

- [ ] **Step 4: Update `src/herd.js` — remove `shell: true`, use `resolveCommand`**

Replace the full content of `src/herd.js`:

```javascript
// src/herd.js
import { spawnSync } from 'child_process';
import ora from 'ora';
import { resolveCommand } from './utils/which.js';

/**
 * Checks whether the Herd CLI is available in PATH.
 * @returns {boolean}
 */
function isHerdAvailable() {
    return resolveCommand('herd') !== null;
}

/**
 * Runs `herd secure <siteName>` to provision a local SSL certificate.
 * @param {string} siteName
 */
export async function secureWithHerd(siteName) {
    const herdPath = resolveCommand('herd');
    if (!herdPath) {
        throw new Error(
            'Herd CLI is not available in PATH.\n' +
                'Make sure Laravel Herd is installed: https://herd.laravel.com/',
        );
    }

    const spinner = ora(`Running: herd secure ${siteName}...`).start();

    const result = spawnSync(herdPath, ['secure', siteName], {
        stdio: 'pipe',
        encoding: 'utf-8',
    });

    if (result.error || result.status !== 0) {
        spinner.fail('herd secure failed.');
        const msg =
            result.stderr?.trim() || result.stdout?.trim() || 'Unknown error';
        throw new Error(`herd secure ${siteName}: ${msg}`);
    }

    spinner.succeed(`SSL certificate created → https://${siteName}.test`);
}
```

- [ ] **Step 5: Verify all files compile**

Run: `node --check src/utils/which.js && node --check src/wpcli.js && node --check src/herd.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add src/utils/which.js src/wpcli.js src/herd.js
git commit -m "fix: replace shell:true with resolved binary paths (DEP0190)"
```

---

### Task 2: Cache WordPress Core Downloads

Reuse the same caching pattern as themes/plugins: store the zip in `~/.config/create-wordpress/cache/wordpress-core/` and track version in `data.json`.

**Files:**

- Modify: `src/wordpress.js`

- [ ] **Step 1: Rewrite `src/wordpress.js` with caching**

Replace the full content of `src/wordpress.js`:

```javascript
// src/wordpress.js
import axios from 'axios';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { getConfigDir } from './utils/path.js';

const WP_VERSION_API = 'https://api.wordpress.org/core/version-check/1.7/';
const WP_CACHE_SLUG = 'wordpress-core';

// ─── Cache helpers ───────────────────────────────────────────────────────────

function getDataJsonPath() {
    return path.join(getConfigDir(), 'data.json');
}

function getPackagesDir() {
    return path.join(getConfigDir(), 'packages');
}

function loadDataJson() {
    const p = getDataJsonPath();
    if (!fs.existsSync(p)) return [];
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
        return [];
    }
}

function saveDataJson(entries) {
    fs.writeFileSync(
        getDataJsonPath(),
        JSON.stringify(entries, null, 2),
        'utf-8',
    );
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Fetches latest WP version info from the official API.
 * @returns {Promise<{version: string, downloadUrl: string}>}
 */
async function getLatestVersionInfo() {
    const response = await axios.get(WP_VERSION_API, { timeout: 15000 });
    const offers = response.data?.offers;
    if (!offers || offers.length === 0) {
        throw new Error('WordPress API returned no version offers.');
    }
    const latest = offers[0];
    const downloadUrl = latest.packages?.no_content;
    if (!downloadUrl) {
        throw new Error(
            'Could not find no_content download URL from WordPress API.',
        );
    }
    return { version: latest.version, downloadUrl };
}

// ─── Core logic ──────────────────────────────────────────────────────────────

/**
 * Ensures the WordPress core zip is available locally (downloading only if
 * the cached version is outdated or missing). Returns the path to the zip.
 *
 * @returns {Promise<{zipPath: string, version: string}>}
 */
async function resolveWordPressZip() {
    const spinner = ora('Checking WordPress version...').start();

    let versionInfo;
    try {
        versionInfo = await getLatestVersionInfo();
    } catch (err) {
        spinner.fail('Failed to fetch WordPress version info.');
        throw err;
    }

    const { version, downloadUrl } = versionInfo;

    // Check cache
    const entries = loadDataJson();
    const cached = entries.find((e) => e.slug === WP_CACHE_SLUG);
    if (
        cached &&
        cached.version === version &&
        fs.existsSync(cached.package_path)
    ) {
        spinner.succeed(`WordPress v${version} — cached ✓`);
        return { zipPath: cached.package_path, version };
    }

    // Download
    spinner.text = `Downloading WordPress v${version}...`;
    const slugDir = path.join(getPackagesDir(), WP_CACHE_SLUG);
    fs.mkdirSync(slugDir, { recursive: true });
    const zipPath = path.join(slugDir, `wordpress-${version}-no-content.zip`);

    try {
        const response = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'arraybuffer',
            timeout: 120000,
            onDownloadProgress: (progress) => {
                if (progress.total) {
                    const pct = Math.round(
                        (progress.loaded / progress.total) * 100,
                    );
                    spinner.text = `Downloading WordPress v${version}... ${pct}%`;
                }
            },
        });
        fs.writeFileSync(zipPath, Buffer.from(response.data));
    } catch (err) {
        spinner.fail('Failed to download WordPress.');
        throw err;
    }

    // Update data.json
    const idx = entries.findIndex((e) => e.slug === WP_CACHE_SLUG);
    const newEntry = { slug: WP_CACHE_SLUG, version, package_path: zipPath };

    if (idx >= 0) {
        const old = entries[idx];
        if (old.package_path !== zipPath && fs.existsSync(old.package_path)) {
            try {
                fs.unlinkSync(old.package_path);
            } catch {
                /* ignore */
            }
        }
        entries[idx] = newEntry;
    } else {
        entries.push(newEntry);
    }
    saveDataJson(entries);

    spinner.succeed(`WordPress v${version} — downloaded`);
    return { zipPath, version };
}

/**
 * Resolves the cached WP zip (downloading if needed) and extracts it into
 * the given destination directory, stripping the inner "wordpress/" folder.
 *
 * @param {string} destinationDir  Absolute path to the site directory.
 */
export async function downloadAndExtractWordPress(destinationDir) {
    const { zipPath } = await resolveWordPressZip();

    const spinner = ora('Extracting WordPress files...').start();
    try {
        const zip = new AdmZip(zipPath);
        const entries = zip.getEntries();

        for (const entry of entries) {
            const relativePath = entry.entryName.replace(/^wordpress\//, '');
            if (!relativePath) continue;

            const targetPath = path.join(destinationDir, relativePath);

            if (entry.isDirectory) {
                fs.mkdirSync(targetPath, { recursive: true });
            } else {
                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                fs.writeFileSync(targetPath, entry.getData());
            }
        }

        spinner.succeed('WordPress extracted.');
    } catch (err) {
        spinner.fail('Failed to extract WordPress.');
        throw err;
    }
}
```

- [ ] **Step 2: Verify file compiles**

Run: `node --check src/wordpress.js`
Expected: No output (success)

- [ ] **Step 3: Manual test — first run downloads, second run uses cache**

Run: `node bin/create-wp.js` twice with different site names.
Expected: First run says `WordPress v6.x.x — downloaded`, second run says `WordPress v6.x.x — cached ✓`

- [ ] **Step 4: Commit**

```bash
git add src/wordpress.js
git commit -m "feat: cache WordPress core zip to avoid re-downloading"
```

---

### Task 3: Add `--delete` Argument to Remove Websites

Parse `process.argv` for `--delete <site-name>`. If present, skip the creation flow and instead delete the site directory + database.

**Files:**

- Create: `src/delete.js`
- Modify: `bin/create-wp.js`

- [ ] **Step 1: Create `src/delete.js`**

```javascript
// src/delete.js
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from './config.js';
import { createDbConnection, databaseExists } from './db.js';
import { resolvePath } from './utils/path.js';

/**
 * Deletes a WordPress site: removes directory + drops database.
 * Prompts for confirmation before destructive action.
 *
 * @param {string} siteName - Kebab-case site name to delete.
 */
export async function deleteSite(siteName) {
    const config = await loadConfig();
    const websitesPath = resolvePath(config.websites_path);
    const siteDir = path.join(websitesPath, siteName);

    // Check DB existence
    let connection;
    let dbExists = false;
    try {
        connection = await createDbConnection(config);
        dbExists = await databaseExists(connection, siteName);
    } catch (err) {
        console.error(
            chalk.yellow(`⚠  Cannot connect to MySQL: ${err.message}`),
        );
        console.log(chalk.yellow('   Will only delete the directory.\n'));
    }

    const dirExists = fs.existsSync(siteDir);

    if (!dirExists && !dbExists) {
        console.log(chalk.red(`✖  Nothing found for "${siteName}":`));
        console.log(chalk.red(`   Directory: ${siteDir} — not found`));
        console.log(chalk.red(`   Database:  ${siteName} — not found`));
        if (connection) await connection.end();
        process.exit(1);
    }

    // Show what will be deleted
    console.log(chalk.bold.yellow(`\n⚠  About to delete "${siteName}":\n`));
    if (dirExists) console.log(`  📁  Directory: ${chalk.cyan(siteDir)}`);
    if (dbExists) console.log(`  🗄️   Database:  ${chalk.cyan(siteName)}`);
    console.log();

    // Confirm
    const { confirmed } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmed',
            message: `Are you sure you want to permanently delete "${siteName}"?`,
            default: false,
        },
    ]);

    if (!confirmed) {
        console.log(chalk.gray('  Cancelled.\n'));
        if (connection) await connection.end();
        return;
    }

    // Delete directory
    if (dirExists) {
        const spinner = ora(`Deleting directory: ${siteDir}...`).start();
        try {
            fs.rmSync(siteDir, { recursive: true, force: true });
            spinner.succeed(`Directory deleted: ${siteDir}`);
        } catch (err) {
            spinner.fail(`Failed to delete directory: ${err.message}`);
        }
    }

    // Drop database
    if (dbExists && connection) {
        const spinner = ora(`Dropping database: ${siteName}...`).start();
        try {
            await connection.execute(`DROP DATABASE \`${siteName}\``);
            spinner.succeed(`Database dropped: ${siteName}`);
        } catch (err) {
            spinner.fail(`Failed to drop database: ${err.message}`);
        }
    }

    if (connection) await connection.end();
    console.log(chalk.green(`\n✔  "${siteName}" has been deleted.\n`));
}
```

- [ ] **Step 2: Verify file compiles**

Run: `node --check src/delete.js`
Expected: No output (success)

- [ ] **Step 3: Update `bin/create-wp.js` — add arg parsing at the top of `main()`**

Add the import at the top of the file (after existing imports):

```javascript
import { deleteSite } from '../src/delete.js';
```

Then add this block at the very beginning of `main()`, before the banner:

```javascript
// ── Arg parsing ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const deleteIndex = args.indexOf('--delete');
if (deleteIndex !== -1) {
    const siteName = args[deleteIndex + 1];
    if (!siteName) {
        console.error(
            chalk.red('✖  Usage: create-wp --delete <site-name>'),
        );
        process.exit(1);
    }
    await deleteSite(siteName);
    return;
}
```

- [ ] **Step 4: Verify file compiles**

Run: `node --check bin/create-wp.js`
Expected: No output (success)

- [ ] **Step 5: Manual test — delete an existing test site**

Run: `node bin/create-wp.js --delete npx-01`
Expected: Shows directory + database info, asks confirmation, deletes both on 'Y'

Run: `node bin/create-wp.js --delete nonexistent-site`
Expected: Shows "Nothing found" error message

- [ ] **Step 6: Commit**

```bash
git add src/delete.js bin/create-wp.js
git commit -m "feat: add --delete argument to remove sites and databases"
```
