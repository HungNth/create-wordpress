import { spawnSync } from 'child_process';
import ora from 'ora';
import { resolveCommand } from './utils/which.js';

/**
 * Spawns a resolved binary, handling the case where the resolved path
 * is a Windows .bat/.cmd file (which requires cmd.exe /c to execute).
 */
function spawnResolved(resolvedPath, args, opts = {}) {
  const isBatch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(resolvedPath);
  const file = isBatch ? 'cmd.exe' : resolvedPath;
  const finalArgs = isBatch ? ['/c', resolvedPath, ...args] : args;
  return spawnSync(file, finalArgs, opts);
}

/**
 * Runs `herd secure <siteName>` to provision a local SSL certificate.
 * @param {string} siteName
 */
export async function secureWithHerd(siteName) {
  const herdPath = resolveCommand('herd');
  if (!herdPath) {
    throw new Error(
      'Herd CLI is not available in PATH.\n' +
      'Make sure Laravel Herd is installed: https://herd.laravel.com/'
    );
  }

  const spinner = ora(`Running: herd secure ${siteName}...`).start();

  const result = spawnResolved(herdPath, ['secure', siteName], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.error || result.status !== 0) {
    spinner.fail('herd secure failed.');
    const msg = result.stderr?.trim() || result.stdout?.trim() || 'Unknown error';
    throw new Error(`herd secure ${siteName}: ${msg}`);
  }

  spinner.succeed(`SSL certificate created → https://${siteName}.test`);
}
