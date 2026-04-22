// src/utils/which.js
import { spawnSync } from 'child_process';
import fs from 'fs';

/**
 * Resolves the absolute path to a binary on the system.
 * On Windows, uses `where`; on macOS/Linux, uses `which`.
 * Returns null if the binary is not found.
 *
 * @param {string} name - Binary name (e.g. 'wp', 'herd')
 * @returns {string|null} Absolute path or null
 */
export function resolveCommand(name) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(cmd, [name], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.status !== 0 || result.error) return null;

  // `where` on Windows can return multiple lines; take the first
  const resolved = result.stdout.trim().split(/\r?\n/)[0]?.trim();
  if (!resolved || !fs.existsSync(resolved)) return null;

  return resolved;
}
