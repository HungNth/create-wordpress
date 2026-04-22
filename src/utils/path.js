import os from 'os';
import path from 'path';

/**
 * Returns the user's home directory, cross-platform.
 */
export function getHomeDir() {
  return os.homedir();
}

/**
 * Returns the config directory for create-wordpress.
 * - macOS/Linux: ~/.config/create-wordpress
 * - Windows:     %APPDATA%\create-wordpress
 */
export function getConfigDir() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(getHomeDir(), 'AppData', 'Roaming');
    return path.join(appData, 'create-wordpress');
  }
  return path.join(getHomeDir(), '.config', 'create-wordpress');
}

/**
 * Returns the full path to config.json.
 */
export function getConfigFilePath() {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * Returns the default websites path (~\/Herd).
 */
export function getDefaultWebsitesPath() {
  return path.join(getHomeDir(), 'Herd');
}

/**
 * Resolves a path that may start with ~/
 * into an absolute path using the real home directory.
 */
export function resolvePath(inputPath) {
  if (!inputPath) return getDefaultWebsitesPath();
  if (inputPath.startsWith('~/') || inputPath === '~') {
    return path.join(getHomeDir(), inputPath.slice(2));
  }
  return inputPath;
}
