import os from 'os';
import path from 'path';

/**
 * Returns the user's home directory, cross-platform.
 */
export function getHomeDir() {
  return os.homedir();
}

/**
 * Returns the config directory for the CLI.
 * Unified on all platforms: ~/.config/create-wordpress
 * On Windows this maps to %USERPROFILE%\.config\create-wordpress
 */
export function getConfigDir() {
  return path.join(getHomeDir(), '.config', 'create-wordpress');
}

/**
 * Returns the full path to config.json.
 */
export function getConfigFilePath() {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * Returns the cache directory.
 * ~/.config/create-wordpress/cache
 */
export function getCacheDir() {
  return path.join(getConfigDir(), 'cache');
}

/**
 * Returns the packages cache directory.
 * ~/.config/create-wordpress/cache/packages
 */
export function getPackagesCacheDir() {
  return path.join(getCacheDir(), 'packages');
}

/**
 * Returns the WordPress core cache directory.
 * ~/.config/create-wordpress/cache/wordpress-core
 */
export function getWordPressCacheDir() {
  return path.join(getCacheDir(), 'wordpress-core');
}

/**
 * Returns the default websites path (~/Herd).
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
