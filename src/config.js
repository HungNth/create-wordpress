import fs from 'fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { getConfigDir, getConfigFilePath } from './utils/path.js';

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_THEMES = [
  { name: 'Flatsome', slug: 'flatsome' },
  { name: 'Jannah', slug: 'jannah' },
  { name: 'Avada', slug: 'Avada' },
  { name: 'Woodmart', slug: 'woodmart' },
  { name: 'Bricks', slug: 'bricks' },
  { name: 'Etch Theme', slug: 'etch-theme' },
];

const DEFAULT_PLUGINS = [
  { name: 'Advanced Custom Fields PRO', slug: 'advanced-custom-fields-pro' },
  { name: 'All-in-One WP Migration Unlimited Extension', slug: 'all-in-one-wp-migration-unlimited-extension' },
  { name: 'Rank Math SEO PRO', slug: 'seo-by-rank-math-pro' },
  { name: 'UpdraftPlus - Backup/Restore', slug: 'updraftplus' },
  { name: 'WP Mail SMTP Pro', slug: 'wp-mail-smtp-pro' },
  { name: 'Admin and Site Enhancements (ASE) Pro', slug: 'admin-site-enhancements-pro' },
  { name: 'WP Rocket', slug: 'wp-rocket' },
  { name: 'Duplicator Pro', slug: 'duplicator-pro' },
  { name: 'Elementor Pro', slug: 'elementor-pro' },
  { name: 'FluentCart Pro', slug: 'fluent-cart-pro' },
  { name: 'Blocksy Companion (Premium)', slug: 'blocksy-companion-pro' },
  { name: 'Etch', slug: 'etch' },
  { name: 'Automatic.css', slug: 'automaticcss-plugin' },
  { name: 'GP Premium', slug: 'gp-premium' },
  { name: 'GenerateBlocks Pro', slug: 'generateblocks-pro' },
  { name: 'Tocer', slug: 'tocer' },
  { name: 'Perfmatters', slug: 'perfmatters' },
];

const DEFAULT_WP_TWEAKS = [
  // ── wp-config.php constants ──────────────────────────────────────────────
  { type: 'config_set', key: 'WP_DEBUG',           value: 'true',  raw: true },
  { type: 'config_set', key: 'WP_DEBUG_LOG',       value: 'true',  raw: true },
  { type: 'config_set', key: 'WP_DEBUG_DISPLAY',   value: 'true',  raw: true },
  { type: 'config_set', key: 'WP_MEMORY_LIMIT',    value: '256M',  raw: false },
  { type: 'config_set', key: 'AUTOSAVE_INTERVAL',  value: '600',   raw: true },
  { type: 'config_set', key: 'WP_POST_REVISIONS',  value: '5',     raw: true },
  { type: 'config_set', key: 'EMPTY_TRASH_DAYS',   value: '21',    raw: true },
  // ── Permalink structure ───────────────────────────────────────────────────
  { type: 'rewrite_structure', value: '/%category%/%postname%/' },
  // ── wp_options ────────────────────────────────────────────────────────────
  { type: 'option_update', key: 'timezone_string',       value: 'Asia/Ho_Chi_Minh' },
  { type: 'option_update', key: 'time_format',           value: 'H:i' },
  { type: 'option_update', key: 'date_format',           value: 'd/m/Y' },
  { type: 'option_update', key: 'large_size_w',          value: '0' },
  { type: 'option_update', key: 'large_size_h',          value: '0' },
  { type: 'option_update', key: 'medium_large_size_w',   value: '0' },
  { type: 'option_update', key: 'medium_large_size_h',   value: '0' },
  { type: 'option_update', key: 'medium_size_w',         value: '0' },
  { type: 'option_update', key: 'medium_size_h',         value: '0' },
  { type: 'option_update', key: 'thumbnail_size_w',      value: '0' },
  { type: 'option_update', key: 'thumbnail_size_h',      value: '0' },
  { type: 'option_update', key: 'thumbnail_crop',        value: '0' },
  { type: 'option_update', key: 'comment_moderation',    value: '1' },
  { type: 'option_update', key: 'default_ping_status',   value: 'closed' },
  { type: 'option_update', key: 'posts_per_page',        value: '30' },
  { type: 'option_update', key: 'posts_per_rss',         value: '210' },
  { type: 'option_update', key: 'rss_use_excerpt',       value: '1' },
  { type: 'option_update', key: 'avatar_default',        value: 'identicon' },
];

// ─── Migration ─────────────────────────────────────────────────────────────────

/**
 * Patches an existing config with any missing fields (e.g. themes/plugins
 * added after initial setup). Saves back to disk if anything was patched.
 */
function migrateConfig(config) {
  let changed = false;

  if (!config.default_theme_slug) {
    config.default_theme_slug = 'flatsome';
    changed = true;
  }
  if (!config.themes || !Array.isArray(config.themes) || config.themes.length === 0) {
    config.themes = DEFAULT_THEMES;
    changed = true;
  }
  if (!config.plugins || !Array.isArray(config.plugins) || config.plugins.length === 0) {
    config.plugins = DEFAULT_PLUGINS;
    changed = true;
  }
  if (!config.wp_tweaks || !Array.isArray(config.wp_tweaks)) {
    config.wp_tweaks = DEFAULT_WP_TWEAKS;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(getConfigFilePath(), JSON.stringify(config, null, 2), 'utf-8');
    console.log(chalk.gray('  ℹ  Config updated with default themes & plugins.\n'));
  }

  return config;
}

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * Loads config from disk. If missing or invalid, runs the first-time setup wizard.
 * Automatically patches missing fields without re-running the wizard.
 * @returns {Promise<object>} The config object.
 */
export async function loadConfig() {
  const configPath = getConfigFilePath();

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      return migrateConfig(config);
    } catch {
      console.error(chalk.red('✖  Config file is corrupted. Starting setup wizard...\n'));
      return createConfig();
    }
  }

  return createConfig();
}


/**
 * Interactive first-time setup wizard. Saves result to config.json.
 * @returns {Promise<object>}
 */
async function createConfig() {
  console.log(chalk.bold.cyan('📋 First-time setup — configuring your defaults.\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'websites_path',
      message: 'Where do you store your WordPress sites?',
      default: '~/Herd',
    },
    {
      type: 'input',
      name: 'server_url',
      message: 'Custom package server URL (leave blank to skip):',
      default: '',
    },
    {
      type: 'input',
      name: 'package_api_key',
      message: 'Package server API key (leave blank to skip):',
      default: '',
    },
    {
      type: 'input',
      name: 'default_admin_username',
      message: 'Default admin username:',
      default: 'admin',
    },
    {
      type: 'password',
      name: 'default_admin_password',
      message: 'Default admin password:',
      default: 'admin',
      mask: '*',
    },
    {
      type: 'input',
      name: 'default_admin_email',
      message: 'Default admin email:',
      default: 'admin@admin.com',
    },
    {
      type: 'input',
      name: 'database_port',
      message: 'Database port:',
      default: '3306',
      validate: (val) => (isNaN(Number(val)) ? 'Must be a number' : true),
    },
    {
      type: 'input',
      name: 'db_username',
      message: 'Database username:',
      default: 'root',
    },
    {
      type: 'password',
      name: 'db_password',
      message: 'Database password (leave blank if none):',
      default: '',
      mask: '*',
    },
  ]);

  const config = {
    websites_path: answers.websites_path || '~/Herd',
    server_url: answers.server_url || '',
    package_api_key: answers.package_api_key || '',
    default_admin_username: answers.default_admin_username || 'admin',
    default_admin_password: answers.default_admin_password || 'admin',
    default_admin_email: answers.default_admin_email || 'admin@admin.com',
    database_port: parseInt(answers.database_port, 10) || 3306,
    db_username: answers.db_username || 'root',
    db_password: answers.db_password || '',
    db_socket: '',
    default_theme_slug: 'flatsome',
    themes: [
      { name: 'Flatsome', slug: 'flatsome' },
      { name: 'Jannah', slug: 'jannah' },
      { name: 'Avada', slug: 'Avada' },
      { name: 'Woodmart', slug: 'woodmart' },
      { name: 'Bricks', slug: 'bricks' },
      { name: 'Etch Theme', slug: 'etch-theme' },
    ],
    plugins: [
      { name: 'Advanced Custom Fields PRO', slug: 'advanced-custom-fields-pro' },
      { name: 'All-in-One WP Migration Unlimited Extension', slug: 'all-in-one-wp-migration-unlimited-extension' },
      { name: 'Rank Math SEO PRO', slug: 'seo-by-rank-math-pro' },
      { name: 'UpdraftPlus - Backup/Restore', slug: 'updraftplus' },
      { name: 'WP Mail SMTP Pro', slug: 'wp-mail-smtp-pro' },
      { name: 'Admin and Site Enhancements (ASE) Pro', slug: 'admin-site-enhancements-pro' },
      { name: 'WP Rocket', slug: 'wp-rocket' },
      { name: 'Duplicator Pro', slug: 'duplicator-pro' },
      { name: 'Elementor Pro', slug: 'elementor-pro' },
      { name: 'FluentCart Pro', slug: 'fluent-cart-pro' },
      { name: 'Blocksy Companion (Premium)', slug: 'blocksy-companion-pro' },
      { name: 'Etch', slug: 'etch' },
      { name: 'Automatic.css', slug: 'automaticcss-plugin' },
      { name: 'GP Premium', slug: 'gp-premium' },
      { name: 'GenerateBlocks Pro', slug: 'generateblocks-pro' },
      { name: 'Tocer', slug: 'tocer' },
      { name: 'Perfmatters', slug: 'perfmatters' },
    ],
    wp_tweaks: DEFAULT_WP_TWEAKS,
  };

  // Ensure config directory exists
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(getConfigFilePath(), JSON.stringify(config, null, 2), 'utf-8');
  console.log(chalk.green(`\n✔  Config saved to ${getConfigFilePath()}\n`));

  return config;
}
