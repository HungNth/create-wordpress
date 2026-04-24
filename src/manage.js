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
		console.log(chalk.red(`✖  Websites directory not found: ${websitesPath}`));
		process.exit(1);
	}

	const dirs = fs.readdirSync(websitesPath, { withFileTypes: true })
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
	console.log(chalk.bold.cyan(`\n🔐  Change admin credentials for "${siteName}"\n`));

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

	const prefix = readTablePrefix(siteDir);
	const dbName = readDbName(siteDir, siteName); // real DB name from wp-config.php
	let wpcliOk = false;

	// ── Step 0: Resolve admin user ID (not always 1) ──────────────────────────
	let adminId = null;

	// Try WP-CLI first
	try {
		const raw = runWpCommand(
			['user', 'list', '--field=ID', '--number=1'],
			siteDir
		);
		adminId = parseInt(raw.trim(), 10);
	} catch {
		// WP-CLI unavailable — will resolve via MySQL below
	}

	// Fallback: query MySQL for the first user ID
	if (!adminId) {
		let conn;
		try {
			conn = await createDbConnection(config);
			await conn.execute(`USE \`${dbName}\``);
			const [rows] = await conn.execute(
				`SELECT ID FROM \`${prefix}users\` ORDER BY ID ASC LIMIT 1`
			);
			if (rows.length) adminId = rows[0].ID;
		} catch {
			// ignore
		} finally {
			if (conn) await conn.end();
		}
	}

	if (!adminId) {
		console.log(chalk.red('✖  Could not determine admin user ID. Aborting.\n'));
		return;
	}

	console.log(chalk.gray(`   Admin user ID: ${adminId}`));


	// NOTE: --user_login is intentionally excluded — WordPress core does NOT
	// allow username changes via wp_update_user(). It must be done via direct SQL.
	const spinner = ora('Updating password and email via WP-CLI...').start();
	try {
		runWpCommand(['user', 'update', String(adminId),
			`--user_pass=${password}`,
			`--user_email=${email}`,
		], siteDir);

		// Update admin_email in wp_options as well
		runWpCommand(['option', 'update', 'admin_email', email], siteDir);

		spinner.succeed('Password and email updated via WP-CLI.');
		wpcliOk = true;
	} catch (err) {
		spinner.warn(`WP-CLI failed: ${err.message}. Will use MySQL for password/email too.`);
	}

	// ── Step 2: Update user_login via MySQL (only supported path for username) ──
	const dbSpinner = ora('Updating username via MySQL...').start();
	let connection;
	try {
		connection = await createDbConnection(config);
		await connection.execute(`USE \`${dbName}\``);

		if (!wpcliOk) {
			// Full fallback: update everything via MySQL.
			// MD5 is accepted as a legacy password format; WordPress upgrades it on next login.
			await connection.execute(
				`UPDATE \`${prefix}users\` SET user_login = ?, user_email = ?, user_pass = MD5(?) WHERE ID = ?`,
				[username, email, password, adminId]
			);
			await connection.execute(
				`UPDATE \`${prefix}options\` SET option_value = ? WHERE option_name = 'admin_email'`,
				[email]
			);
			dbSpinner.succeed('All credentials updated via MySQL.');
		} else {
			// WP-CLI handled pass/email — just update user_login here.
			await connection.execute(
				`UPDATE \`${prefix}users\` SET user_login = ? WHERE ID = ?`,
				[username, adminId]
			);
			dbSpinner.succeed(`Username updated: ${username}`);
		}
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

/**
 * Reads DB_NAME from wp-config.php.
 * Falls back to siteName (directory name) if not found.
 * @param {string} siteDir
 * @param {string} [fallback]
 */
function readDbName(siteDir, fallback = '') {
	const wpConfigPath = path.join(siteDir, 'wp-config.php');
	if (!fs.existsSync(wpConfigPath)) return fallback;
	const content = fs.readFileSync(wpConfigPath, 'utf-8');
	const match = content.match(/define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"]([^'"]+)['"]/);
	return match ? match[1] : fallback;
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
		console.log(chalk.yellow('⚠  server_url / package_api_key not set — cannot install themes.\n'));
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
		const zipPath = await resolvePackage(config.server_url, theme.slug, config.package_api_key);
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
		console.log(chalk.yellow('⚠  server_url / package_api_key not set — cannot install plugins.\n'));
		return;
	}

	const { selectedSlugs } = await inquirer.prompt([
		{
			type: 'checkbox',
			name: 'selectedSlugs',
			message: 'Select plugins to install (Space = toggle, Enter = confirm):',
			choices: plugins.map((p) => ({ name: p.name, value: p.slug })),
			pageSize: 15,
		},
	]);

	if (!selectedSlugs.length) {
		console.log(chalk.gray('\n  No plugins selected.\n'));
		return;
	}

	console.log(chalk.bold(`\n🔌  Installing ${selectedSlugs.length} plugin(s)...\n`));

	for (const slug of selectedSlugs) {
		const plugin = plugins.find((p) => p.slug === slug);
		try {
			const zipPath = await resolvePackage(config.server_url, plugin.slug, config.package_api_key);
			await installPlugin(siteDir, zipPath, plugin.name);
		} catch (err) {
			console.log(chalk.yellow(`   ⚠  Skipped ${plugin.name}: ${err.message}`));
		}
	}
}

// ─── Sub-command 4: Apply WordPress Configuration Tweaks ─────────────────────

/**
 * Builds the WP-CLI args for a single tweak entry.
 * Returns null if the entry type is unrecognised.
 */
function tweakToArgs(tweak) {
	switch (tweak.type) {
		case 'config_set': {
			const args = ['config', 'set', tweak.key, tweak.value];
			if (tweak.raw) args.push('--raw');
			return args;
		}
		case 'rewrite_structure':
			return ['rewrite', 'structure', tweak.value, '--hard'];
		case 'option_update':
			return ['option', 'update', tweak.key, tweak.value];
		case 'language_core':
			return ['language', 'core', tweak.key, tweak.value];
		case 'site':
			return ['site', tweak.key, tweak.value];
		default:
			return null;
	}
}

/** Describes a tweak in a compact, human-readable form. */
function describeTweak(tweak) {
	switch (tweak.type) {
		case 'config_set': return `config set ${tweak.key} = ${tweak.value}${tweak.raw ? ' (raw)' : ''}`;
		case 'rewrite_structure': return `rewrite structure ${tweak.value}`;
		case 'option_update': return `option update ${tweak.key} = ${tweak.value}`;
		case 'language_core': return `language core ${tweak.key} ${tweak.value}`;
		case 'site': return `site ${tweak.key} ${tweak.value}`;
		default: return JSON.stringify(tweak);
	}
}

async function applyWpTweaks(siteName, siteDir, config) {
	const tweaks = config.wp_tweaks || [];
	if (!tweaks.length) {
		console.log(chalk.yellow('⚠  No wp_tweaks defined in config.json.\n'));
		return;
	}

	console.log(chalk.bold.cyan(`\n⚙️   Applying ${tweaks.length} WordPress tweaks to "${siteName}"\n`));

	let ok = 0;
	let fail = 0;

	for (const tweak of tweaks) {
		const args = tweakToArgs(tweak);
		if (!args) {
			console.log(chalk.gray(`  ⊘  Unknown type "${tweak.type}" — skipped`));
			continue;
		}

		const label = describeTweak(tweak);
		try {
			runWpCommand(args, siteDir);
			console.log(`  ${chalk.green('✔')}  ${chalk.gray(label)}`);
			ok++;
		} catch (err) {
			console.log(`  ${chalk.red('✖')}  ${chalk.gray(label)}`);
			console.log(chalk.red(`       ${err.message}`));
			fail++;
		}
	}

	console.log();
	if (fail === 0) {
		console.log(chalk.green(`✔  All ${ok} tweaks applied successfully.\n`));
	} else {
		console.log(chalk.yellow(`⚠  ${ok} succeeded, ${fail} failed.\n`));
	}
}

// ─── Sub-command 5: Install package(s) by slug ────────────────────────────

/**
 * Attempts to install a zip as a plugin, then as a theme.
 * Returns 'plugin' | 'theme' on success, throws on total failure.
 */
function installZip(zipPath, siteDir) {
  try {
    runWpCommand(['plugin', 'install', zipPath, '--activate', '--force'], siteDir);
    return 'plugin';
  } catch {}
  // Fallback: try as theme
  runWpCommand(['theme', 'install', zipPath, '--activate', '--force'], siteDir);
  return 'theme';
}

async function installBySlugFlow(siteName, siteDir, config) {
  if (!config.server_url || !config.package_api_key) {
    console.log(chalk.yellow('⚠  server_url / package_api_key not set — cannot install packages.\n'));
    return;
  }

  const { rawSlugs } = await inquirer.prompt([{
    type: 'input',
    name: 'rawSlugs',
    message: 'Enter the slug(s) to find and install (comma-separated):',
    validate: (v) => (v.trim() ? true : 'Please enter at least one slug.'),
  }]);

  const slugs = rawSlugs
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!slugs.length) return;

  console.log(chalk.bold(`\n📦  Processing ${slugs.length} slug(s) for "${siteName}"\n`));

  // status: 'ok' | 'not_found' | 'failed'
  const results = [];

  for (const slug of slugs) {
    // 1. Resolve package (fetch metadata + download/cache)
    let zipPath;
    try {
      zipPath = await resolvePackage(config.server_url, slug, config.package_api_key);
    } catch (err) {
      console.log(chalk.yellow(`  ≈  Not found: ${chalk.bold(slug)} — ${err.message}`));
      results.push({ slug, status: 'not_found', detail: err.message });
      continue;
    }

    // 2. Install (plugin then theme fallback)
    const installSpinner = ora(`Installing: ${slug}`).start();
    try {
      const kind = installZip(zipPath, siteDir);
      installSpinner.succeed(`Installed as ${kind}: ${slug}`);
      results.push({ slug, status: 'ok', detail: kind });
    } catch (err) {
      installSpinner.fail(`Install failed: ${slug}`);
      results.push({ slug, status: 'failed', detail: err.message });
    }
  }

  // 3. Summary table
  const colW = Math.max(...results.map((r) => r.slug.length), 4);
  console.log(chalk.bold('\n📋  Result summary\n'));
  console.log(
    chalk.gray('  ' + 'Slug'.padEnd(colW + 2) + 'Status      ' + 'Detail')
  );
  console.log(chalk.gray('  ' + '─'.repeat(colW + 30)));
  for (const r of results) {
    const icon        = r.status === 'ok' ? chalk.green('✔') : r.status === 'not_found' ? chalk.yellow('≈') : chalk.red('✖');
    const statusLabel = r.status === 'ok' ? chalk.green('Installed ') : r.status === 'not_found' ? chalk.yellow('Not found ') : chalk.red('Failed    ');
    const detail      = r.status === 'ok' ? chalk.gray(`(${r.detail})`) : chalk.gray(r.detail?.slice(0, 60) || '');
    console.log(`  ${icon}  ${r.slug.padEnd(colW + 2)}${statusLabel} ${detail}`);
  }
  const ok = results.filter((r) => r.status === 'ok').length;
  console.log();
  if (ok === results.length) {
    console.log(chalk.green(`✔  All ${ok} package(s) installed.\n`));
  } else {
    console.log(chalk.yellow(`⚠  ${ok} / ${results.length} installed successfully.\n`));
  }
}

// ─── Main entry ──────────────────────────────────────────────────────────────

const ACTIONS = [
	{ name: '🔐  Change admin credentials',          value: 'admin'   },
	{ name: '⚙️  Apply WordPress configuration',     value: 'tweaks'  },
	{ name: '🔍  Find and install package(s) by slug', value: 'slug'    },
	{ name: '🎨  Install theme',                     value: 'theme'   },
	{ name: '🔌  Install plugins',                   value: 'plugins' },
];

/**
 * Interactive site configuration flow.
 * Called when user runs `create-wp --config`
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
		case 'tweaks':
			await applyWpTweaks(siteName, siteDir, config);
			break;
		case 'slug':
			await installBySlugFlow(siteName, siteDir, config);
			break;
	}
}
