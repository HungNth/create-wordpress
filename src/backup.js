import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from './config.js';
import { resolvePath } from './utils/path.js';
import { runWpCommand } from './wpcli.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Timestamp in format HHhMM-DDMMYYYYFormat  e.g. 09h30-24042026
 */
function makeTimestamp() {
  const now = new Date();
  const hh   = String(now.getHours()).padStart(2, '0');
  const mm   = String(now.getMinutes()).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  const mo   = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${hh}h${mm}-${dd}${mo}${yyyy}`;
}

/**
 * Returns (and creates if needed) websitesPath/backups/
 */
function ensureBackupsDir(websitesPath) {
  const dir = path.join(websitesPath, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Interactive picker — excludes the 'backups' dir itself.
 */
async function pickSite(websitesPath) {
  const dirs = fs.readdirSync(websitesPath, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'backups')
    .map((e) => e.name)
    .sort();

  if (!dirs.length) {
    console.log(chalk.yellow('⚠  No websites found.\n'));
    return null;
  }

  const { siteName } = await inquirer.prompt([{
    type: 'list',
    name: 'siteName',
    message: 'Select a website to backup:',
    choices: dirs,
    pageSize: 15,
  }]);

  return siteName;
}

// ─── Backup Method 1: Full source code ───────────────────────────────────────

async function backupFullSource(siteName, siteDir, backupsDir) {
  const ts          = makeTimestamp();
  const sqlFileName = `${siteName}_${ts}.sql`;
  const sqlFile     = path.join(siteDir, sqlFileName);
  const zipName     = `full-source_${siteName}_${ts}.zip`;
  const zipPath     = path.join(backupsDir, zipName);

  // 1. Export database into site root
  let spinner = ora('Exporting database...').start();
  try {
    runWpCommand(['db', 'export', `./${sqlFileName}`], siteDir);
    spinner.succeed('Database exported.');
  } catch (err) {
    spinner.fail(`DB export failed: ${err.message}`);
    return;
  }

  // 2. Zip entire site directory (including the dump)
  spinner = ora(`Compressing "${siteName}"… (may take a while for large sites)`).start();
  try {
    const zip = new AdmZip();
    zip.addLocalFolder(siteDir);
    zip.writeZip(zipPath);
    spinner.succeed(`Archive created: ${zipName}`);
  } catch (err) {
    spinner.fail(`Compression failed: ${err.message}`);
    try { fs.unlinkSync(sqlFile); } catch {}
    return;
  }

  // 3. Remove the loose SQL dump from site root (it's inside the zip now)
  try { fs.unlinkSync(sqlFile); } catch {}

  const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
  console.log(chalk.green(`\n✔  Full backup complete (${sizeMB} MB):`));
  console.log(chalk.gray(`   ${zipPath}\n`));
}

// ─── Backup Method 2: All-in-One WP Migration ────────────────────────────────

function moveAi1wmFile(srcPath, siteName, ts, backupsDir) {
  const ext      = path.extname(srcPath) || '.wpress';
  const destName = `ai1wm-${siteName}_${ts}${ext}`;
  const destPath = path.join(backupsDir, destName);

  const spinner = ora('Moving backup to backups directory...').start();
  try {
    fs.copyFileSync(srcPath, destPath);
    try { fs.unlinkSync(srcPath); } catch {}
    spinner.succeed(`Saved: ${destName}`);

    const sizeMB = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
    console.log(chalk.green(`\n✔  AI1WM backup complete (${sizeMB} MB):`));
    console.log(chalk.gray(`   ${destPath}\n`));
  } catch (err) {
    spinner.fail(`Failed to move backup file: ${err.message}`);
  }
}

async function backupAi1wm(siteName, siteDir, backupsDir) {
  const ts = makeTimestamp();

  // 1. Install & activate plugin
  let spinner = ora('Installing All-in-One WP Migration plugin...').start();
  try {
    runWpCommand(
      ['plugin', 'install', 'all-in-one-wp-migration-unlimited-extension', '--activate'],
      siteDir
    );
    spinner.succeed('AI1WM plugin installed & activated.');
  } catch (err) {
    spinner.warn(`Plugin install warning (continuing): ${err.message}`);
  }

  // 2. Run backup and capture output
  spinner = ora('Running AI1WM backup...').start();
  let output = '';
  try {
    output = runWpCommand(
      ['ai1wm', 'backup', '--exclude-cache', '--exclude-spam-comments'],
      siteDir
    );
    spinner.succeed('AI1WM backup completed.');
  } catch (err) {
    spinner.fail(`AI1WM backup failed: ${err.message}`);
    return;
  }

  // 3. Parse backup file path — WP-CLI AI1WM outputs "Backup location: /path/to/file.wpress"
  const locationMatch = output.match(/Backup\s+(?:file\s+)?(?:location|path)[:\s]+(.+\.(?:wpress|zip))/im);

  if (!locationMatch) {
    console.log(chalk.yellow('\n⚠  Could not auto-detect backup file path.'));
    console.log(chalk.gray('   Raw output:\n' + output));

    const { manualPath } = await inquirer.prompt([{
      type: 'input',
      name: 'manualPath',
      message: 'Enter the full path to the backup file:',
      validate: (v) => (fs.existsSync(v.trim()) ? true : 'File not found.'),
    }]);

    if (manualPath?.trim()) moveAi1wmFile(manualPath.trim(), siteName, ts, backupsDir);
    return;
  }

  moveAi1wmFile(locationMatch[1].trim(), siteName, ts, backupsDir);
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Interactive backup flow.
 * Called when user runs `create-wp --backup`
 */
export async function backupSite() {
  console.log(chalk.bold.cyan('\n🗄️   Backup\n'));

  const config       = await loadConfig();
  const websitesPath = resolvePath(config.websites_path);

  if (!fs.existsSync(websitesPath)) {
    console.log(chalk.red(`✖  Websites path not found: ${websitesPath}\n`));
    return;
  }

  const siteName = await pickSite(websitesPath);
  if (!siteName) return;

  const siteDir    = path.join(websitesPath, siteName);
  const backupsDir = ensureBackupsDir(websitesPath);

  const { method } = await inquirer.prompt([{
    type: 'list',
    name: 'method',
    message: 'Select backup method:',
    choices: [
      { name: '📦  Full source code  (zip archive + SQL dump)', value: 'full'  },
      { name: '🔄  All-in-One WP Migration  (.wpress)',         value: 'ai1wm' },
    ],
  }]);

  if (method === 'full') {
    await backupFullSource(siteName, siteDir, backupsDir);
  } else {
    await backupAi1wm(siteName, siteDir, backupsDir);
  }
}
