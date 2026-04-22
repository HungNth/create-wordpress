# `--config` Site Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--config` argument that lets users manage existing WordPress sites: change admin credentials, install a theme, or install plugins.

**Architecture:** Create a new `src/manage.js` module with the 3 sub-commands. Each operates on an existing site selected from the websites path. WP-CLI is the primary mechanism; direct MySQL is the fallback for credential changes. Entry point routes `--config` to the new module.

**Tech Stack:** Node.js ESM, inquirer, WP-CLI (via `spawnResolved`), mysql2 (fallback)

---

## File Structure

| File                      | Action | Responsibility                                            |
| ------------------------- | ------ | --------------------------------------------------------- |
| `src/manage.js`           | Create | Site picker + 3 sub-commands: admin creds, theme, plugins |
| `src/wpcli.js`            | Modify | Export `runWpCommand()` for arbitrary wp-cli calls        |
| `bin/create-wordpress.js` | Modify | Add `--config` arg parsing                                |

---

### Task 1: Export a generic WP-CLI runner from `wpcli.js`

Currently `runWp()` is a private function. We need to expose it so `manage.js` can run arbitrary wp-cli commands like `wp user update`.

**Files:**

- Modify: `src/wpcli.js`

- [ ] **Step 1: Export `runWpCommand` from `wpcli.js`**

Add this export at the bottom of `src/wpcli.js`:

```javascript
/**
 * Public wrapper for runWp — allows other modules to run arbitrary WP-CLI commands.
 * @param {string[]} args  WP-CLI args array, e.g. ['user', 'update', '1', '--user_pass=xxx']
 * @param {string} cwd     Site directory path
 * @returns {string} stdout
 */
export function runWpCommand(args, cwd) {
    return runWp(args, cwd);
}
```

- [ ] **Step 2: Verify**

Run: `node --check src/wpcli.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/wpcli.js
git commit -m "refactor: export runWpCommand for use by manage module"
```

---

### Task 2: Create `src/manage.js` — the `--config` flow

**Files:**

- Create: `src/manage.js`

- [ ] **Step 1: Create `src/manage.js`**

```javascript
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from './config.js';
import { createDbConnection } from './db.js';
import { resolvePackage } from './packages.js';
import { runWpCommand, installTheme, installPlugin } from './wpcli.js';
import { resolvePath } from './utils/path.js';

// ─── Site picker ─────────────────────────────────────────────────────────────

/**
 * Lists sites in websitesPath and lets user pick one.
 * @returns {Promise<{siteName: string, siteDir: string, config: object}>}
 */
async function pickSite() {
    const config = await loadConfig();
    const websitesPath = resolvePath(config.websites_path);

    if (!fs.existsSync(websitesPath)) {
        console.log(
            chalk.red(`✖  Websites directory not found: ${websitesPath}`),
        );
        process.exit(1);
    }

    const dirs = fs
        .readdirSync(websitesPath, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();

    if (dirs.length === 0) {
        console.log(chalk.yellow(`⚠  No websites found in ${websitesPath}\n`));
        process.exit(0);
    }

    const { siteName } = await inquirer.prompt([
        {
            type: 'list',
            name: 'siteName',
            message: 'Select a website to configure:',
            choices: dirs,
            pageSize: 15,
        },
    ]);

    return { siteName, siteDir: path.join(websitesPath, siteName), config };
}

// ─── Sub-command 1: Change Admin Credentials ─────────────────────────────────

async function changeAdminCredentials(siteName, siteDir, config) {
    console.log(
        chalk.bold.cyan(`\n🔐  Change admin credentials for "${siteName}"\n`),
    );

    const { username, password, email } = await inquirer.prompt([
        {
            type: 'input',
            name: 'username',
            message: 'New admin username:',
            default: config.default_admin_username || 'admin',
        },
        {
            type: 'password',
            name: 'password',
            message: 'New admin password:',
            default: config.default_admin_password || 'admin',
            mask: '*',
        },
        {
            type: 'input',
            name: 'email',
            message: 'New admin email:',
            default: config.default_admin_email || 'admin@admin.com',
        },
    ]);

    // Try WP-CLI first
    const spinner = ora('Updating admin via WP-CLI...').start();
    try {
        // Update user login (user ID 1 = first admin)
        runWpCommand(
            [
                'user',
                'update',
                '1',
                `--user_login=${username}`,
                `--user_pass=${password}`,
                `--user_email=${email}`,
            ],
            siteDir,
        );

        // Also update admin_email in wp_options
        runWpCommand(['option', 'update', 'admin_email', email], siteDir);

        spinner.succeed('Admin credentials updated via WP-CLI.');
        return;
    } catch (err) {
        spinner.warn(
            'WP-CLI failed. Falling back to direct database update...',
        );
    }

    // Fallback: direct MySQL update
    const dbSpinner = ora('Updating admin via MySQL...').start();
    let connection;
    try {
        connection = await createDbConnection(config);
        await connection.execute(`USE \`${siteName}\``);

        // Determine table prefix by reading wp-config.php
        const prefix = readTablePrefix(siteDir);

        // Update user record (ID = 1)
        await connection.execute(
            `UPDATE \`${prefix}users\` SET user_login = ?, user_email = ?, user_pass = MD5(?) WHERE ID = 1`,
            [username, email, password],
        );

        // Update admin_email option
        await connection.execute(
            `UPDATE \`${prefix}options\` SET option_value = ? WHERE option_name = 'admin_email'`,
            [email],
        );

        dbSpinner.succeed('Admin credentials updated via MySQL.');
    } catch (dbErr) {
        dbSpinner.fail(`MySQL update failed: ${dbErr.message}`);
    } finally {
        if (connection) await connection.end();
    }
}

/**
 * Reads $table_prefix from wp-config.php. Defaults to 'wp_'.
 */
function readTablePrefix(siteDir) {
    const wpConfigPath = path.join(siteDir, 'wp-config.php');
    if (!fs.existsSync(wpConfigPath)) return 'wp_';
    const content = fs.readFileSync(wpConfigPath, 'utf-8');
    const match = content.match(/\$table_prefix\s*=\s*['"]([^'"]+)['"]/);
    return match ? match[1] : 'wp_';
}

// ─── Sub-command 2: Install Theme ────────────────────────────────────────────

async function installThemeFlow(siteName, siteDir, config) {
    const themes = config.themes || [];
    if (!themes.length) {
        console.log(chalk.yellow('⚠  No themes defined in config.json.\n'));
        return;
    }

    const hasServer = config.server_url && config.package_api_key;
    if (!hasServer) {
        console.log(
            chalk.yellow(
                '⚠  server_url / package_api_key not set — cannot install themes.\n',
            ),
        );
        return;
    }

    const { selectedSlug } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedSlug',
            message: 'Select a theme to install:',
            choices: themes.map((t) => ({ name: t.name, value: t.slug })),
            pageSize: 12,
        },
    ]);

    const theme = themes.find((t) => t.slug === selectedSlug);

    try {
        const zipPath = await resolvePackage(
            config.server_url,
            theme.slug,
            config.package_api_key,
        );
        await installTheme(siteDir, zipPath, theme.name);
    } catch (err) {
        console.error(chalk.red(`✖  Theme install failed: ${err.message}\n`));
    }
}

// ─── Sub-command 3: Install Plugins ──────────────────────────────────────────

async function installPluginsFlow(siteName, siteDir, config) {
    const plugins = config.plugins || [];
    if (!plugins.length) {
        console.log(chalk.yellow('⚠  No plugins defined in config.json.\n'));
        return;
    }

    const hasServer = config.server_url && config.package_api_key;
    if (!hasServer) {
        console.log(
            chalk.yellow(
                '⚠  server_url / package_api_key not set — cannot install plugins.\n',
            ),
        );
        return;
    }

    const { selectedSlugs } = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'selectedSlugs',
            message:
                'Select plugins to install (Space = toggle, Enter = confirm):',
            choices: plugins.map((p) => ({ name: p.name, value: p.slug })),
            pageSize: 15,
        },
    ]);

    if (!selectedSlugs.length) {
        console.log(chalk.gray('\n  No plugins selected.\n'));
        return;
    }

    console.log(
        chalk.bold(`\n🔌  Installing ${selectedSlugs.length} plugin(s)...\n`),
    );

    for (const slug of selectedSlugs) {
        const plugin = plugins.find((p) => p.slug === slug);
        try {
            const zipPath = await resolvePackage(
                config.server_url,
                plugin.slug,
                config.package_api_key,
            );
            await installPlugin(siteDir, zipPath, plugin.name);
        } catch (err) {
            console.log(
                chalk.yellow(`   ⚠  Skipped ${plugin.name}: ${err.message}`),
            );
        }
    }
}

// ─── Main entry ──────────────────────────────────────────────────────────────

const ACTIONS = [
    { name: '🔐  Change admin credentials', value: 'admin' },
    { name: '🎨  Install theme', value: 'theme' },
    { name: '🔌  Install plugins', value: 'plugins' },
];

/**
 * Interactive site configuration flow.
 * Called when user runs `create-wordpress --config`
 */
export async function manageSite() {
    console.log(chalk.bold.cyan('\n⚙️   Site Configuration\n'));

    const { siteName, siteDir, config } = await pickSite();

    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: `What do you want to do with "${siteName}"?`,
            choices: ACTIONS,
        },
    ]);

    switch (action) {
        case 'admin':
            await changeAdminCredentials(siteName, siteDir, config);
            break;
        case 'theme':
            await installThemeFlow(siteName, siteDir, config);
            break;
        case 'plugins':
            await installPluginsFlow(siteName, siteDir, config);
            break;
    }
}
```

- [ ] **Step 2: Verify**

Run: `node --check src/manage.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/manage.js
git commit -m "feat: add --config site management module"
```

---

### Task 3: Wire `--config` into entry point

**Files:**

- Modify: `bin/create-wordpress.js`

- [ ] **Step 1: Add import**

Add after the existing imports:

```javascript
import { manageSite } from '../src/manage.js';
```

- [ ] **Step 2: Add `--config` arg parsing**

Add this block right after the existing `--delete` block (before `// ── Step 1: Load config`):

```javascript
const configIndex = args.indexOf('--config');
if (configIndex !== -1) {
    await manageSite();
    return;
}
```

- [ ] **Step 3: Verify**

Run: `node --check bin/create-wordpress.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Manual test**

Run: `node bin/create-wordpress.js --config`
Expected: Shows site picker → action menu → executes chosen action

- [ ] **Step 5: Commit**

```bash
git add bin/create-wordpress.js
git commit -m "feat: wire --config arg to site management flow"
```
