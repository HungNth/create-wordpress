import { spawnSync } from 'child_process';
import ora from 'ora';
import { resolveCommand } from './utils/which.js';

/**
 * Spawns a resolved binary, handling the case where the resolved path
 * is a Windows .bat/.cmd file (which requires cmd.exe /c to execute).
 *
 * @param {string} resolvedPath - Absolute path to the binary or batch file.
 * @param {string[]} args
 * @param {object} [opts] - Extra spawnSync options.
 */
function spawnResolved(resolvedPath, args, opts = {}) {
  const isBatch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(resolvedPath);
  const file = isBatch ? 'cmd.exe' : resolvedPath;
  const finalArgs = isBatch ? ['/c', resolvedPath, ...args] : args;
  return spawnSync(file, finalArgs, opts);
}

/** Cached resolved path to wp binary */
let wpPath = null;

/**
 * Returns the resolved absolute path to the wp binary.
 * Caches the result for subsequent calls within the same process.
 * @returns {string|null}
 */
function getWpPath() {
  if (wpPath === null) {
    wpPath = resolveCommand('wp') || false; // false = looked up, not found
  }
  return wpPath || null;
}

/**
 * Checks whether WP-CLI is available in PATH.
 * @returns {boolean}
 */
function isWpCliAvailable() {
  const resolved = getWpPath();
  if (!resolved) return false;
  const result = spawnResolved(resolved, ['--info'], { stdio: 'pipe' });
  return result.status === 0 && !result.error;
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

  const result = spawnResolved(resolved, args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.error || result.status !== 0) {
    const msg = result.stderr?.trim() || result.stdout?.trim() || `wp ${args[0]} failed`;
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
      'Install it from: https://wp-cli.org/'
    );
  }

  const spinner = ora('Creating wp-config.php...').start();

  try {
    runWp(
      [
        'config', 'create',
        `--dbname=${siteName}`,
        `--dbuser=${config.db_username}`,
        `--dbpass=${config.db_password}`,
        `--dbhost=127.0.0.1:${config.database_port}`,
        '--skip-check',
        '--force',
      ],
      sitePath
    );

    spinner.text = 'Installing WordPress core...';
    runWp(
      [
        'core', 'install',
        `--url=https://${siteName}.test`,
        `--title=${siteName}`,
        `--admin_user=${config.default_admin_username}`,
        `--admin_password=${config.default_admin_password}`,
        `--admin_email=${config.default_admin_email}`,
        '--skip-email',
      ],
      sitePath
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
    runWp(['plugin', 'install', zipPath, '--activate', '--force'], sitePath);
    spinner.succeed(`Plugin installed: ${name}`);
  } catch (err) {
    spinner.warn(`Plugin install failed (skipping): ${name}`);
  }
}

/**
 * Public wrapper for runWp — allows other modules to run arbitrary WP-CLI commands.
 * @param {string[]} args  WP-CLI args array
 * @param {string} cwd     Site directory path
 * @returns {string} stdout
 */
export function runWpCommand(args, cwd) {
  return runWp(args, cwd);
}
