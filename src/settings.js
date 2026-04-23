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

async function editWpTweaks(config) {
  const TWEAK_TYPE_LABELS = {
    config_set: 'config_set (wp-config.php constant)',
    rewrite_structure: 'rewrite_structure (permalink)',
    option_update: 'option_update (wp_options)',
  };

  const TWEAK_ACTIONS = [
    { name: '➕  Add a tweak', value: 'add' },
    { name: '🗑️   Remove tweak(s)', value: 'remove' },
    { name: '← Back', value: 'back' },
  ];

  while (true) {
    const tweaks = config.wp_tweaks || [];

    console.log(chalk.bold.cyan('\n⚙️   WordPress Tweaks:\n'));
    if (tweaks.length === 0) {
      console.log(chalk.gray('   (none)\n'));
    } else {
      tweaks.forEach((t, i) => {
        let label;
        if (t.type === 'config_set')        label = `${chalk.yellow('config')}  ${t.key} = ${t.value}${t.raw ? chalk.gray(' --raw') : ''}`;
        else if (t.type === 'rewrite_structure') label = `${chalk.blue('rewrite')} ${t.value}`;
        else                                label = `${chalk.cyan('option')}  ${t.key} = ${t.value}`;
        console.log(`  ${chalk.gray(String(i + 1).padStart(2))}. ${label}`);
      });
      console.log();
    }

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'WordPress tweaks:',
      choices: TWEAK_ACTIONS,
    }]);

    if (action === 'back') break;

    if (action === 'add') {
      const { type } = await inquirer.prompt([{
        type: 'list',
        name: 'type',
        message: 'Tweak type:',
        choices: Object.entries(TWEAK_TYPE_LABELS).map(([v, n]) => ({ name: n, value: v })),
      }]);

      if (type === 'rewrite_structure') {
        const { value } = await inquirer.prompt([
          { type: 'input', name: 'value', message: 'Permalink structure:', default: '/%category%/%postname%/' },
        ]);
        if (!config.wp_tweaks) config.wp_tweaks = [];
        config.wp_tweaks.push({ type: 'rewrite_structure', value: value.trim() });
        console.log(chalk.green('✔  Added rewrite_structure\n'));
      } else if (type === 'config_set') {
        const { key, value, raw } = await inquirer.prompt([
          { type: 'input',   name: 'key',   message: 'Constant name (e.g. WP_DEBUG):' },
          { type: 'input',   name: 'value', message: 'Value:' },
          { type: 'confirm', name: 'raw',   message: 'Use --raw flag (for booleans/integers)?', default: false },
        ]);
        if (key && value) {
          if (!config.wp_tweaks) config.wp_tweaks = [];
          config.wp_tweaks.push({ type: 'config_set', key: key.trim(), value: value.trim(), raw });
          console.log(chalk.green(`✔  Added config_set ${key}\n`));
        }
      } else {
        const { key, value } = await inquirer.prompt([
          { type: 'input', name: 'key',   message: 'Option name (e.g. timezone_string):' },
          { type: 'input', name: 'value', message: 'Option value:' },
        ]);
        if (key && value) {
          if (!config.wp_tweaks) config.wp_tweaks = [];
          config.wp_tweaks.push({ type: 'option_update', key: key.trim(), value: value.trim() });
          console.log(chalk.green(`✔  Added option_update ${key}\n`));
        }
      }
    }

    if (action === 'remove' && tweaks.length > 0) {
      const { indicesToRemove } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'indicesToRemove',
        message: 'Select tweaks to remove:',
        choices: tweaks.map((t, i) => {
          const label = t.type === 'config_set'        ? `config_set ${t.key} = ${t.value}`
                      : t.type === 'rewrite_structure' ? `rewrite_structure ${t.value}`
                      : `option_update ${t.key} = ${t.value}`;
          return { name: label, value: i };
        }),
        pageSize: 20,
      }]);
      // Remove in reverse order to keep indices stable
      const toRemove = new Set(indicesToRemove);
      config.wp_tweaks = config.wp_tweaks.filter((_, i) => !toRemove.has(i));
      console.log(chalk.green(`✔  Removed ${indicesToRemove.length} tweak(s)\n`));
    }
  }
}

// ─── Main menu ────────────────────────────────────────────────────────────────

const SETTINGS_SECTIONS = [
  { name: '📁  General          (websites path)', value: 'general' },
  { name: '🗄️  Database         (host, port, credentials)', value: 'database' },
  { name: '🔑  WordPress        (default admin credentials)', value: 'wp' },
  { name: '📦  Package Server   (URL, API key)', value: 'server' },
  { name: '🎨  Themes           (manage theme list & default)', value: 'themes' },
  { name: '🔌  Plugins          (manage plugin list)', value: 'plugins' },
  { name: '⚙️  WP Tweaks        (config_set, option, rewrite)', value: 'tweaks' },
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
      case 'tweaks':   await editWpTweaks(config);         break;
    }
  }
}
