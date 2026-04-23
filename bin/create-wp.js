#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';

import { loadConfig } from '../src/config.js';
import { createDbConnection, databaseExists, createDatabase } from '../src/db.js';
import { downloadAndExtractWordPress } from '../src/wordpress.js';
import { setupWordPress, installTheme, installPlugin } from '../src/wpcli.js';
import { secureWithHerd } from '../src/herd.js';
import { resolvePackage } from '../src/packages.js';
import { resolvePath } from '../src/utils/path.js';
import { deleteSite, promptAndDeleteSite } from '../src/delete.js';
import { manageSite } from '../src/manage.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Converts any string to kebab-case suitable for a directory/domain/DB name.
 * Example: "My Shop" → "my-shop"
 */
function toKebabCase(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Prompts for a site name, normalises to kebab-case,
 * and validates no directory/database collision.
 */
async function promptSiteName(websitesPath, connection) {
  while (true) {
    const { rawName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'rawName',
        message: 'Enter the website name:',
        validate: (val) => (val.trim() ? true : 'Website name cannot be empty.'),
      },
    ]);

    const siteName = toKebabCase(rawName);

    if (!siteName) {
      console.log(chalk.red('  ✖  Invalid name. Use letters, numbers, or hyphens.\n'));
      continue;
    }

    if (siteName !== rawName.trim()) {
      console.log(chalk.yellow(`  → Normalised to: ${chalk.bold(siteName)}`));
    }

    const siteDir = path.join(websitesPath, siteName);
    if (fs.existsSync(siteDir)) {
      console.log(chalk.red(`  ✖  Directory already exists: ${siteDir}\n`));
      continue;
    }

    const dbExists = await databaseExists(connection, siteName);
    if (dbExists) {
      console.log(chalk.red(`  ✖  Database already exists: ${siteName}\n`));
      continue;
    }

    return siteName;
  }
}

/**
 * Prompts the user to select one theme from config.themes[].
 * Default is config.default_theme_slug. Returns slug or null to skip.
 */
async function promptTheme(config) {
  const themes = config.themes || [];
  if (!themes.length) return null;

  const defaultSlug = config.default_theme_slug || themes[0]?.slug;
  const defaultTheme = themes.find((t) => t.slug === defaultSlug) || themes[0];

  const choices = [
    ...themes.map((t) => ({
      name: t.slug === defaultSlug ? `${t.name} ${chalk.gray('(default)')}` : t.name,
      value: t.slug,
    })),
    new inquirer.Separator(),
    { name: 'Skip — no theme', value: null },
  ];

  const { selectedSlug } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedSlug',
      message: `Select a theme to install:`,
      default: defaultSlug,
      choices,
      pageSize: 12,
    },
  ]);

  return selectedSlug;
}

/**
 * Prompts the user to select zero or more plugins from config.plugins[].
 * Returns array of slugs.
 */
async function promptPlugins(config) {
  const plugins = config.plugins || [];
  if (!plugins.length) return [];

  const { selectedSlugs } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedSlugs',
      message: 'Select plugins to install (Space = toggle, Enter = confirm):',
      choices: plugins.map((p) => ({ name: p.name, value: p.slug })),
      pageSize: 15,
    },
  ]);

  return selectedSlugs;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    chalk.bold.cyan(
      '\n🚀  create-wp  —  WordPress site generator for Laravel Herd\n'
    )
  );

  // ── Arg parsing ─────────────────────────────────────────────────────────
  const args = process.argv.slice(2);
  const deleteIndex = args.indexOf('--delete');
  if (deleteIndex !== -1) {
    const siteName = args[deleteIndex + 1];
    if (!siteName) {
      // No site name given → show interactive picker
      await promptAndDeleteSite();
    } else {
      // Site name given → delete directly
      await deleteSite(siteName);
    }
    return;
  }

  const configIndex = args.indexOf('--config');
  if (configIndex !== -1) {
    await manageSite();
    return;
  }

  // ── Step 1: Load (or create) config ──────────────────────────────────────
  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.error(chalk.red(`✖  Failed to load config: ${err.message}`));
    process.exit(1);
  }

  const websitesPath = resolvePath(config.websites_path);

  if (!fs.existsSync(websitesPath)) {
    console.log(chalk.yellow(`  ⚠  Websites path does not exist: ${websitesPath}`));
    console.log(chalk.yellow('     Creating it now...\n'));
    fs.mkdirSync(websitesPath, { recursive: true });
  }

  // ── Step 2: Connect to MySQL ─────────────────────────────────────────────
  let connection;
  try {
    connection = await createDbConnection(config);
  } catch (err) {
    console.error(chalk.red(`\n✖  ${err.message}`));
    console.log(
      chalk.yellow('  Check your database settings: ') +
      chalk.cyan('~/.config/create-wordpress/config.json')
    );
    process.exit(1);
  }

  // ── Step 3: Site name ─────────────────────────────────────────────────────
  let siteName;
  try {
    siteName = await promptSiteName(websitesPath, connection);
  } catch (err) {
    console.error(chalk.red(`✖  ${err.message}`));
    await connection.end();
    process.exit(1);
  }

  // ── Step 4: Theme & plugin selection ─────────────────────────────────────
  const selectedThemeSlug = await promptTheme(config);
  const selectedPluginSlugs = await promptPlugins(config);

  const selectedTheme = selectedThemeSlug
    ? (config.themes || []).find((t) => t.slug === selectedThemeSlug)
    : null;
  const selectedPlugins = selectedPluginSlugs.map(
    (slug) => (config.plugins || []).find((p) => p.slug === slug)
  ).filter(Boolean);

  // Summary before proceeding
  console.log();
  console.log(chalk.bold('  Installation summary:'));
  console.log(`  Theme:   ${selectedTheme ? chalk.cyan(selectedTheme.name) : chalk.gray('none')}`);
  if (selectedPlugins.length) {
    selectedPlugins.forEach((p) => console.log(`  Plugin:  ${chalk.cyan(p.name)}`));
  } else {
    console.log(`  Plugins: ${chalk.gray('none')}`);
  }
  console.log();

  const siteDir = path.join(websitesPath, siteName);

  // ── Step 5: Create directory + database ──────────────────────────────────
  try {
    console.log(chalk.cyan(`📁  Creating directory: ${siteDir}`));
    fs.mkdirSync(siteDir, { recursive: true });

    console.log(chalk.cyan(`🗄️   Creating database:  ${siteName}`));
    await createDatabase(connection, siteName);
    await connection.end();

    console.log(chalk.green('✔  Directory and database created.\n'));
  } catch (err) {
    console.error(chalk.red(`\n✖  ${err.message}`));
    try { await connection.end(); } catch { /* ignore */ }
    process.exit(1);
  }

  // ── Step 6: Download & extract WordPress ─────────────────────────────────
  try {
    await downloadAndExtractWordPress(siteDir);
    console.log();
  } catch (err) {
    console.error(chalk.red(`\n✖  ${err.message}`));
    process.exit(1);
  }

  // ── Step 7: WP-CLI core install ───────────────────────────────────────────
  try {
    await setupWordPress({ sitePath: siteDir, siteName, config });
    console.log();
  } catch (err) {
    console.error(chalk.red(`\n✖  ${err.message}`));
    process.exit(1);
  }

  // ── Step 8: Install theme ─────────────────────────────────────────────────
  const hasPackageServer = config.server_url && config.package_api_key;

  if (selectedTheme) {
    if (!hasPackageServer) {
      console.log(chalk.yellow(`\n⚠  server_url / package_api_key not set — skipping theme install.\n`));
    } else {
      try {
        const zipPath = await resolvePackage(config.server_url, selectedTheme.slug, config.package_api_key);
        await installTheme(siteDir, zipPath, selectedTheme.name);
        console.log();
      } catch (err) {
        console.error(chalk.red(`\n✖  Theme install failed: ${err.message}`));
        console.log(chalk.yellow('   Continuing without theme...\n'));
      }
    }
  }

  // ── Step 9: Install plugins ───────────────────────────────────────────────
  if (selectedPlugins.length) {
    if (!hasPackageServer) {
      console.log(chalk.yellow(`\n⚠  server_url / package_api_key not set — skipping plugin installs.\n`));
    } else {
      console.log(chalk.bold(`\n🔌  Installing ${selectedPlugins.length} plugin(s)...\n`));
      for (const plugin of selectedPlugins) {
        try {
          const zipPath = await resolvePackage(config.server_url, plugin.slug, config.package_api_key);
          await installPlugin(siteDir, zipPath, plugin.name);
        } catch (err) {
          console.log(chalk.yellow(`   ⚠  Skipped ${plugin.name}: ${err.message}`));
        }
      }
      console.log();
    }
  }

  // ── Step 10: herd secure ──────────────────────────────────────────────────
  try {
    await secureWithHerd(siteName);
    console.log();
  } catch (err) {
    console.log(chalk.yellow(`\n⚠  ${err.message}`));
    console.log(chalk.yellow(`   Run manually: herd secure ${siteName}\n`));
  }

  // ── Done! ─────────────────────────────────────────────────────────────────
  const hr = chalk.gray('─'.repeat(52));
  console.log(hr);
  console.log(chalk.bold.green('  ✅  WordPress site is ready!\n'));
  console.log(`  📂  Path     ${chalk.cyan(siteDir)}`);
  console.log(`  🌐  URL      ${chalk.cyan(`https://${siteName}.test`)}`);
  console.log(`  🔧  Admin    ${chalk.cyan(`https://${siteName}.test/wp-admin`)}`);
  console.log(`  👤  User     ${chalk.cyan(config.default_admin_username)}`);
  console.log(`  🔑  Pass     ${chalk.cyan(config.default_admin_password)}`);
  console.log(hr + '\n');
}

main().catch((err) => {
  console.error(chalk.red(`\n✖  Unexpected error: ${err.message}`));
  process.exit(1);
});
