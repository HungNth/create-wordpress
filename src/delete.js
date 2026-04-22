import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from './config.js';
import { createDbConnection, databaseExists } from './db.js';
import { resolvePath } from './utils/path.js';

/**
 * Lists all subdirectories in the configured websites path,
 * lets the user multi-select (checkbox) which ones to delete,
 * shows ONE combined confirmation summary, then deletes all.
 */
export async function promptAndDeleteSite() {
  const config = await loadConfig();
  const websitesPath = resolvePath(config.websites_path);

  if (!fs.existsSync(websitesPath)) {
    console.log(chalk.red(`✖  Websites directory not found: ${websitesPath}`));
    process.exit(1);
  }

  // List subdirectories only
  const entries = fs.readdirSync(websitesPath, { withFileTypes: true });
  const sites = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  if (sites.length === 0) {
    console.log(chalk.yellow(`⚠  No websites found in ${websitesPath}\n`));
    return;
  }

  // Multi-select
  const { selectedSites } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedSites',
      message: 'Select websites to delete (Space = toggle, Enter = confirm):',
      choices: sites,
      pageSize: 15,
    },
  ]);

  if (!selectedSites || selectedSites.length === 0) {
    console.log(chalk.gray('\n  Cancelled.\n'));
    return;
  }

  // Show combined summary
  console.log(chalk.bold.yellow(`\n⚠  About to permanently delete ${selectedSites.length} website(s):\n`));
  for (const name of selectedSites) {
    console.log(`  • ${chalk.cyan(name)}`);
  }
  console.log();

  // ONE confirmation for all
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: `Are you sure? This cannot be undone.`,
      default: false,
    },
  ]);

  if (!confirmed) {
    console.log(chalk.gray('\n  Cancelled.\n'));
    return;
  }

  // Delete each silently (skipConfirm = true)
  for (const siteName of selectedSites) {
    await deleteSite(siteName, { skipConfirm: true });
  }
}

/**
 * Deletes a WordPress site: removes the directory and drops the database.
 *
 * @param {string} siteName - Kebab-case site name to delete.
 * @param {object} [opts]
 * @param {boolean} [opts.skipConfirm=false] - If true, skips the confirmation prompt (used when
 *   promptAndDeleteSite already asked the user once for multiple deletions).
 */
export async function deleteSite(siteName, { skipConfirm = false } = {}) {
  const config = await loadConfig();
  const websitesPath = resolvePath(config.websites_path);
  const siteDir = path.join(websitesPath, siteName);

  // Connect to check DB existence (non-fatal if DB unavailable)
  let connection;
  let dbExists = false;
  try {
    connection = await createDbConnection(config);
    dbExists = await databaseExists(connection, siteName);
  } catch (err) {
    console.error(chalk.yellow(`⚠  Cannot connect to MySQL: ${err.message}`));
    console.log(chalk.yellow('   Will only delete the directory.\n'));
  }

  const dirExists = fs.existsSync(siteDir);

  // Nothing to delete
  if (!dirExists && !dbExists) {
    console.log(chalk.red(`\n✖  Nothing found for "${siteName}":`));
    console.log(chalk.red(`   Directory: ${siteDir} — not found`));
    console.log(chalk.red(`   Database:  ${siteName} — not found\n`));
    if (connection) await connection.end();
    if (!skipConfirm) process.exit(1);
    return;
  }

  if (!skipConfirm) {
    // Single-site flow: show what will be deleted + confirm
    console.log(chalk.bold.yellow(`\n⚠  About to permanently delete "${siteName}":\n`));
    if (dirExists) console.log(`  📁  Directory: ${chalk.cyan(siteDir)}`);
    if (dbExists)  console.log(`  🗄️   Database:  ${chalk.cyan(siteName)}`);
    console.log();

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `Are you sure? This cannot be undone.`,
        default: false,
      },
    ]);

    if (!confirmed) {
      console.log(chalk.gray('\n  Cancelled.\n'));
      if (connection) await connection.end();
      return;
    }
  }

  // Delete directory
  if (dirExists) {
    const spinner = ora(`Deleting ${siteName} directory...`).start();
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
  console.log(chalk.green(`✔  "${siteName}" deleted.\n`));
}
