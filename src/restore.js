import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from './config.js';
import { resolvePath } from './utils/path.js';
import { runWpCommand, runWpCommandWithInput, setupWordPress, installPlugin } from './wpcli.js';
import { createDbConnection, databaseExists, createDatabase } from './db.js';
import { downloadAndExtractWordPress } from './wordpress.js';
import { secureWithHerd } from './herd.js';
import { resolvePackage } from './packages.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

const AI1WM_SLUG = 'all-in-one-wp-migration-unlimited-extension';

/**
 * Installs the AI1WM plugin using the private package server (same path as --config).
 * Throws if the plugin is not in config.plugins or the server is not configured.
 */
async function installAi1wmPlugin(siteDir, config) {
	const plugin = (config.plugins || []).find((p) => p.slug === AI1WM_SLUG);

	if (!plugin) {
		throw new Error(
			`Plugin "${AI1WM_SLUG}" not found in config.plugins.\n` +
			`Add it via create-wp --settings \u2192 Plugins.`
		);
	}

	if (!config.server_url || !config.package_api_key) {
		throw new Error(
			'server_url and package_api_key must be set in config.json to install private plugins.'
		);
	}

	const zipPath = await resolvePackage(config.server_url, plugin.slug, config.package_api_key);
	// installPlugin already handles spinner + activate + --force
	await installPlugin(siteDir, zipPath, plugin.name);
}

/**
 * Provisions an SSL cert via `herd secure`. Non-interactive (stdio: pipe).
 * Logs a warning but does not abort if herd fails.
 */
async function provisionSsl(siteName) {
	const spinner = ora(`Securing with Herd SSL: ${siteName}.test…`).start();
	try {
		await secureWithHerd(siteName);
		spinner.succeed(`HTTPS ready \u2192 https://${siteName}.test`);
	} catch (err) {
		spinner.warn(`SSL failed (run "herd secure ${siteName}" manually): ${err.message}`);
	}
}

// ─── Restore Method 1: From full source zip ───────────────────────────────────

async function restoreFromFullSource(config, websitesPath) {
	// 1. Prompt for zip + target site name
	const { zipPath, siteName } = await inquirer.prompt([
		{
			type: 'input',
			name: 'zipPath',
			message: 'Path to the backup .zip file:',
			validate: (v) => {
				const p = v.trim();
				if (!p) return 'Path cannot be empty.';
				if (!fs.existsSync(p)) return `File not found: ${p}`;
				if (path.extname(p).toLowerCase() !== '.zip') return 'Must be a .zip archive.';
				return true;
			},
		},
		{
			type: 'input',
			name: 'siteName',
			message: 'New site name (used as directory & database name):',
			validate: (v) => (v.trim() ? true : 'Site name cannot be empty.'),
			filter: (v) =>
				v.trim().toLowerCase()
					.replace(/[\s_]+/g, '-')
					.replace(/[^a-z0-9-]/g, '')
					.replace(/-+/g, '-')
					.replace(/^-|-$/g, ''),
		},
	]);

	const siteDir = path.join(websitesPath, siteName);

	// 2. Check collision
	if (fs.existsSync(siteDir)) {
		const { overwrite } = await inquirer.prompt([{
			type: 'confirm',
			name: 'overwrite',
			message: `Directory "${siteDir}" already exists. Overwrite?`,
			default: false,
		}]);
		if (!overwrite) { console.log(chalk.gray('\n  Restore cancelled.\n')); return; }
		fs.rmSync(siteDir, { recursive: true, force: true });
	}

	// 3. Extract zip
	let spinner = ora('Extracting archive…').start();
	try {
		fs.mkdirSync(siteDir, { recursive: true });
		const zip = new AdmZip(zipPath.trim());
		zip.extractAllTo(siteDir, /* overwrite */ true);
		spinner.succeed('Archive extracted.');
	} catch (err) {
		spinner.fail(`Extraction failed: ${err.message}`);
		return;
	}

	// 4. Create database
	spinner = ora(`Creating database "${siteName}"…`).start();
	let connection;
	try {
		connection = await createDbConnection(config);
		if (await databaseExists(connection, siteName)) {
			spinner.warn(`Database "${siteName}" already exists — reusing.`);
		} else {
			await createDatabase(connection, siteName);
			spinner.succeed(`Database "${siteName}" created.`);
		}
	} catch (err) {
		spinner.fail(`Database error: ${err.message}`);
		return;
	} finally {
		if (connection) await connection.end();
	}

	// 5. Configure wp-config.php
	const wpConfigPath = path.join(siteDir, 'wp-config.php');
	if (fs.existsSync(wpConfigPath)) {
		spinner = ora('Updating wp-config.php…').start();
		try {
			runWpCommand(['config', 'set', 'DB_NAME', siteName], siteDir);
			runWpCommand(['config', 'set', 'DB_USER', config.db_username], siteDir);
			runWpCommand(['config', 'set', 'DB_PASSWORD', config.db_password || ''], siteDir);
			spinner.succeed('wp-config.php updated.');
		} catch (err) {
			spinner.fail(`wp-config update failed: ${err.message}`);
			return;
		}
	} else {
		spinner = ora('Creating wp-config.php…').start();
		try {
			runWpCommand([
				'config', 'create',
				`--dbname=${siteName}`,
				`--dbuser=${config.db_username}`,
				`--dbpass=${config.db_password || ''}`,
				`--dbhost=127.0.0.1:${config.database_port || 3306}`,
				'--skip-check', '--force',
			], siteDir);
			spinner.succeed('wp-config.php created.');
		} catch (err) {
			spinner.fail(`wp-config create failed: ${err.message}`);
			return;
		}
	}

	// 6. Find and import SQL dump
	const sqlFiles = fs.readdirSync(siteDir).filter((f) => f.endsWith('.sql'));
	if (!sqlFiles.length) {
		console.log(chalk.yellow('\n⚠  No .sql file found in extracted archive — skipping DB import.\n'));
	} else {
		const sqlFile = sqlFiles[0];
		spinner = ora(`Importing database (${sqlFile})…`).start();
		try {
			runWpCommand(['db', 'import', sqlFile], siteDir);
			spinner.succeed('Database imported.');
		} catch (err) {
			spinner.fail(`DB import failed: ${err.message}`);
		}

		// 7. Offer to update siteurl / home
		const newUrl = `https://${siteName}.test`;
		// const { updateUrl } = await inquirer.prompt([{
		//   type: 'confirm',
		//   name: 'updateUrl',
		//   message: `Update site URL to ${newUrl}?`,
		//   default: true,
		// }]);

		// if (updateUrl) {
		spinner = ora('Updating site URL…').start();
		try {
			runWpCommand(['option', 'update', 'siteurl', newUrl], siteDir);
			runWpCommand(['option', 'update', 'home', newUrl], siteDir);
			spinner.succeed(`Site URL → ${newUrl}`);
		} catch (err) {
			spinner.warn(`URL update failed: ${err.message}`);
		}
		// }
	}

	// 7. Provision SSL — non-interactive, pipe only
	await provisionSsl(siteName);

	console.log(chalk.green(`\n\u2714  Restore complete \u2192 https://${siteName}.test/wp-admin/\n`));
}

// ─── Restore Method 2: From AI1WM .wpress ────────────────────────────────────

async function restoreFromAi1wm(config, websitesPath) {
	// 1. Prompt
	const { wpressPath, siteName } = await inquirer.prompt([
		{
			type: 'input',
			name: 'wpressPath',
			message: 'Path to the .wpress backup file:',
			validate: (v) => {
				const p = v.trim();
				if (!p) return 'Path cannot be empty.';
				if (!fs.existsSync(p)) return `File not found: ${p}`;
				return true;
			},
		},
		{
			type: 'input',
			name: 'siteName',
			message: 'New site name:',
			validate: (v) => (v.trim() ? true : 'Site name cannot be empty.'),
			filter: (v) =>
				v.trim().toLowerCase()
					.replace(/[\s_]+/g, '-')
					.replace(/[^a-z0-9-]/g, '')
					.replace(/-+/g, '-')
					.replace(/^-|-$/g, ''),
		},
	]);

	const siteDir = path.join(websitesPath, siteName);

	// 2. Check collision
	if (fs.existsSync(siteDir)) {
		const { overwrite } = await inquirer.prompt([{
			type: 'confirm',
			name: 'overwrite',
			message: `Directory "${siteDir}" already exists. Overwrite?`,
			default: false,
		}]);
		if (!overwrite) { console.log(chalk.gray('\n  Restore cancelled.\n')); return; }
		fs.rmSync(siteDir, { recursive: true, force: true });
	}
	fs.mkdirSync(siteDir, { recursive: true });

	// 3. Create database
	let spinner = ora(`Creating database "${siteName}"…`).start();
	let connection;
	try {
		connection = await createDbConnection(config);
		if (!await databaseExists(connection, siteName)) {
			await createDatabase(connection, siteName);
		}
		spinner.succeed('Database ready.');
	} catch (err) {
		spinner.fail(`Database error: ${err.message}`);
		return;
	} finally {
		if (connection) await connection.end();
	}

	// 4. Download WordPress core
	spinner = ora('Downloading WordPress core…').start();
	try {
		await downloadAndExtractWordPress(siteDir);
		spinner.succeed('WordPress core ready.');
	} catch (err) {
		spinner.fail(`WP download failed: ${err.message}`);
		return;
	}

	// 5. Create wp-config.php + run core install (minimal — AI1WM will overwrite everything)
	spinner = ora('Installing WordPress…').start();
	try {
		await setupWordPress({
			sitePath: siteDir,
			siteName,
			config,
		});
		spinner.succeed('WordPress installed.');
	} catch (err) {
		spinner.fail(`WP install failed: ${err.message}`);
		return;
	}

	// 6. Install & activate AI1WM plugin via private package server (same as --config flow)
	try {
		await installAi1wmPlugin(siteDir, config);
	} catch (err) {
		console.log(chalk.red(`\n✖  AI1WM plugin install failed: ${err.message}\n`));
		console.log(chalk.yellow('   Cannot continue without AI1WM. Aborting.\n'));
		return;
	}

	// 7. Copy .wpress into wp-content/ai1wm-backups/
	const ai1wmBackupsDir = path.join(siteDir, 'wp-content', 'ai1wm-backups');
	fs.mkdirSync(ai1wmBackupsDir, { recursive: true });

	const wpressFileName = path.basename(wpressPath.trim());
	const destWpress = path.join(ai1wmBackupsDir, wpressFileName);

	spinner = ora('Copying .wpress file…').start();
	try {
		fs.copyFileSync(wpressPath.trim(), destWpress);
		spinner.succeed('Backup file copied.');
	} catch (err) {
		spinner.fail(`File copy failed: ${err.message}`);
		return;
	}

	// 8. Run AI1WM restore — auto-confirm "Proceed? [y/n]" by piping 'y\n'
	spinner = ora('Running AI1WM restore (this may take several minutes)…').start();
	try {
		// IMPORTANT: pass only the filename, NOT the full path
		runWpCommandWithInput(
			['ai1wm', 'restore', wpressFileName],
			siteDir,
			'y\n'
		);
		spinner.succeed('AI1WM restore completed.');
	} catch (err) {
		spinner.fail(`AI1WM restore failed: ${err.message}`);
		return;
	}

	// 9. Provision SSL — non-interactive
	await provisionSsl(siteName);

	console.log(chalk.green(`\n✔  Restore complete → https://${siteName}.test/wp-admin/\n`));
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Interactive restore flow.
 * Called when user runs `create-wp --restore`
 */
export async function restoreSite() {
	console.log(chalk.bold.cyan('\n♻️   Restore\n'));

	const config = await loadConfig();
	const websitesPath = resolvePath(config.websites_path);

	if (!fs.existsSync(websitesPath)) {
		console.log(chalk.red(`✖  Websites path not found: ${websitesPath}\n`));
		return;
	}

	const { method } = await inquirer.prompt([{
		type: 'list',
		name: 'method',
		message: 'Select restore method:',
		choices: [
			{ name: '📦  Restore from full source backup           (.zip)', value: 'full' },
			{ name: '🔄  Restore from All-in-One WP Migration    (.wpress)', value: 'ai1wm' },
		],
	}]);

	if (method === 'full') {
		await restoreFromFullSource(config, websitesPath);
	} else {
		await restoreFromAi1wm(config, websitesPath);
	}
}
