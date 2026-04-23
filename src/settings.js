import fs from 'fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { getConfigFilePath } from './utils/path.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reads config.json without triggering the first-time setup wizard.
 * Returns null if the file does not exist or is corrupted.
 */
function readConfigRaw() {
  const configPath = getConfigFilePath();
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  fs.writeFileSync(getConfigFilePath(), JSON.stringify(config, null, 2), 'utf-8');
}

// ─── Section editors ─────────────────────────────────────────────────────────

async function editGeneral(config) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'websites_path',
      message: 'WordPress sites path:',
      default: config.websites_path,
    },
  ]);
  Object.assign(config, answers);
}

async function editDatabase(config) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'db_username',
      message: 'Database username:',
      default: config.db_username,
    },
    {
      type: 'password',
      name: 'db_password',
      message: 'Database password (leave blank if none):',
      default: config.db_password,
      mask: '*',
    },
    {
      type: 'input',
      name: 'database_port',
      message: 'Database port:',
      default: String(config.database_port || 3306),
      validate: (v) => isNaN(Number(v)) ? 'Must be a number' : true,
      filter: (v) => Number(v),
    },
    {
      type: 'input',
      name: 'db_socket',
      message: 'Database socket path (leave blank for TCP):',
      default: config.db_socket || '',
    },
  ]);
  Object.assign(config, answers);
}

async function editWordPressDefaults(config) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'default_admin_username',
      message: 'Default admin username:',
      default: config.default_admin_username,
    },
    {
      type: 'password',
      name: 'default_admin_password',
      message: 'Default admin password:',
      default: config.default_admin_password,
      mask: '*',
    },
    {
      type: 'input',
      name: 'default_admin_email',
      message: 'Default admin email:',
      default: config.default_admin_email,
    },
  ]);
  Object.assign(config, answers);
}

async function editPackageServer(config) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'server_url',
      message: 'Package server URL (leave blank to disable):',
      default: config.server_url || '',
    },
    {
      type: 'input',
      name: 'package_api_key',
      message: 'Package server API key:',
      default: config.package_api_key || '',
    },
  ]);
  Object.assign(config, answers);
}

async function editThemes(config) {
  // Bug 3 fix: always read from config.themes inside loop — no stale local alias

  const THEME_ACTIONS = [
    { name: '➕  Add a theme', value: 'add' },
    { name: '🗑️   Remove a theme', value: 'remove' },
    { name: '⭐  Set default theme', value: 'default' },
    { name: '← Back', value: 'back' },
  ];

  while (true) {
    // Re-read from config every iteration to stay fresh after mutations
    const themes = config.themes || [];

    console.log(chalk.bold.cyan('\n📋  Current themes:\n'));
    if (themes.length === 0) {
      console.log(chalk.gray('   (none)\n'));
    } else {
      themes.forEach((t, i) => {
        const isDefault = t.slug === config.default_theme_slug;
        console.log(`  ${chalk.gray(String(i + 1).padStart(2))}. ${t.name} ${chalk.gray(`(${t.slug})`)}${isDefault ? chalk.yellow(' ← default') : ''}`);
      });
      console.log();
    }

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Theme list:',
      choices: THEME_ACTIONS,
    }]);

    if (action === 'back') break;

    if (action === 'add') {
      const { name, slug } = await inquirer.prompt([
        { type: 'input', name: 'name', message: 'Theme display name:' },
        { type: 'input', name: 'slug', message: 'Theme slug (package key):' },
      ]);
      if (name && slug) {
        if (!config.themes) config.themes = [];
        config.themes.push({ name: name.trim(), slug: slug.trim() });
        console.log(chalk.green(`✔  Added: ${name}\n`));
      }
    }

    if (action === 'remove' && themes.length > 0) {
      const { slugToRemove } = await inquirer.prompt([{
        type: 'list',
        name: 'slugToRemove',
        message: 'Select theme to remove:',
        choices: themes.map((t) => ({ name: `${t.name} (${t.slug})`, value: t.slug })),
      }]);
      config.themes = config.themes.filter((t) => t.slug !== slugToRemove);
      if (config.default_theme_slug === slugToRemove) {
        config.default_theme_slug = config.themes[0]?.slug || '';
      }
      console.log(chalk.green(`✔  Removed: ${slugToRemove}\n`));
    }

    if (action === 'default' && themes.length > 0) {
      const { defaultSlug } = await inquirer.prompt([{
        type: 'list',
        name: 'defaultSlug',
        message: 'Select default theme:',
        choices: themes.map((t) => ({ name: t.name, value: t.slug })),
        default: config.default_theme_slug,
      }]);
      config.default_theme_slug = defaultSlug;
      console.log(chalk.green(`✔  Default theme set to: ${defaultSlug}\n`));
    }
  }
}

async function editPlugins(config) {
  // Bug 3 fix: always read from config.plugins inside loop — no stale local alias

  const PLUGIN_ACTIONS = [
    { name: '➕  Add a plugin', value: 'add' },
    { name: '🗑️   Remove plugin(s)', value: 'remove' },
    { name: '← Back', value: 'back' },
  ];

  while (true) {
    // Re-read from config every iteration to stay fresh after mutations
    const plugins = config.plugins || [];

    console.log(chalk.bold.cyan('\n📋  Current plugins:\n'));
    if (plugins.length === 0) {
      console.log(chalk.gray('   (none)\n'));
    } else {
      plugins.forEach((p, i) => {
        console.log(`  ${chalk.gray(String(i + 1).padStart(2))}. ${p.name} ${chalk.gray(`(${p.slug})`)}`);
      });
      console.log();
    }

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Plugin list:',
      choices: PLUGIN_ACTIONS,
    }]);

    if (action === 'back') break;

    if (action === 'add') {
      const { name, slug } = await inquirer.prompt([
        { type: 'input', name: 'name', message: 'Plugin display name:' },
        { type: 'input', name: 'slug', message: 'Plugin slug (package key):' },
      ]);
      if (name && slug) {
        if (!config.plugins) config.plugins = [];
        config.plugins.push({ name: name.trim(), slug: slug.trim() });
        console.log(chalk.green(`✔  Added: ${name}\n`));
      }
    }

    if (action === 'remove' && plugins.length > 0) {
      const { slugsToRemove } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'slugsToRemove',
        message: 'Select plugins to remove:',
        choices: plugins.map((p) => ({ name: `${p.name} (${p.slug})`, value: p.slug })),
        pageSize: 15,
      }]);
      config.plugins = config.plugins.filter((p) => !slugsToRemove.includes(p.slug));
      console.log(chalk.green(`✔  Removed ${slugsToRemove.length} plugin(s)\n`));
    }
  }
}

// ─── Main menu ────────────────────────────────────────────────────────────────

const SETTINGS_SECTIONS = [
  { name: '📁  General          (websites path)', value: 'general' },
  { name: '🗄️   Database         (host, port, credentials)', value: 'database' },
  { name: '🔑  WordPress        (default admin credentials)', value: 'wp' },
  { name: '📦  Package Server   (URL, API key)', value: 'server' },
  { name: '🎨  Themes           (manage theme list & default)', value: 'themes' },
  { name: '🔌  Plugins          (manage plugin list)', value: 'plugins' },
  new inquirer.Separator(),
  { name: '💾  Save & Exit', value: 'save' },
  { name: '❌  Exit without saving', value: 'exit' },
];

/**
 * Interactive settings editor for config.json.
 * Called when user runs `create-wp --settings`
 *
 * Bug 2 fix: uses readConfigRaw() instead of loadConfig() to avoid triggering
 * the first-time setup wizard (which would write config.json to disk immediately).
 */
export async function editSettings() {
  console.log(chalk.bold.cyan('\n🛠️   Settings Editor\n'));
  console.log(chalk.gray(`   Config file: ${getConfigFilePath()}\n`));

  // Bug 2 fix: raw read — no wizard, no side-effects on disk
  const config = readConfigRaw();

  if (!config) {
    console.log(chalk.yellow('⚠  No config file found.'));
    console.log(chalk.yellow('   Run `create-wp` first to complete the initial setup.\n'));
    return;
  }

  while (true) {
    const { section } = await inquirer.prompt([{
      type: 'list',
      name: 'section',
      message: 'Select a section to edit:',
      choices: SETTINGS_SECTIONS,
      pageSize: 12,
    }]);

    if (section === 'save') {
      saveConfig(config);
      console.log(chalk.green(`\n✔  Settings saved to ${getConfigFilePath()}\n`));
      return;
    }

    if (section === 'exit') {
      console.log(chalk.gray('\n  Exited without saving.\n'));
      return;
    }

    switch (section) {
      case 'general':  await editGeneral(config);          break;
      case 'database': await editDatabase(config);         break;
      case 'wp':       await editWordPressDefaults(config); break;
      case 'server':   await editPackageServer(config);    break;
      case 'themes':   await editThemes(config);           break;
      case 'plugins':  await editPlugins(config);          break;
    }
  }
}
