import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ora from 'ora';
import { getConfigDir, getPackagesCacheDir } from './utils/path.js';

// ─── Paths ───────────────────────────────────────────────────────────────────

function getDataJsonPath() {
  return path.join(getConfigDir(), 'data.json');
}

function getPackagesDir() {
  return getPackagesCacheDir();
}

// ─── data.json helpers ───────────────────────────────────────────────────────

function loadDataJson() {
  const dataPath = getDataJsonPath();
  if (!fs.existsSync(dataPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch {
    return [];
  }
}

function saveDataJson(entries) {
  fs.writeFileSync(getDataJsonPath(), JSON.stringify(entries, null, 2), 'utf-8');
}

function findCachedEntry(slug) {
  return loadDataJson().find((e) => e.slug === slug) || null;
}

// ─── Network ─────────────────────────────────────────────────────────────────

/**
 * Fetches package metadata from the private server.
 * URL format: {serverUrl}/{slug}/metadata/license/{apiKey}
 * @returns {Promise<{ name, version, download_url, slug, ... }>}
 */
async function fetchMetadata(serverUrl, slug, apiKey) {
  const url = `${serverUrl.replace(/\/$/, '')}/${slug}/metadata/license/${apiKey}`;
  try {
    const res = await axios.get(url, { timeout: 15000 });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      throw new Error(`Auth failed for ${slug} (${status}). Check your package_api_key.`);
    }
    if (status === 404) {
      throw new Error(`Package not found on server: ${slug}`);
    }
    throw new Error(`Metadata fetch failed for ${slug}: ${err.message}`);
  }
}

/**
 * Downloads the package zip from the given URL into
 * ~/.config/create-wordpress/cache/packages/{slug}/{slug}.zip
 * @returns {string} Absolute path to the downloaded zip.
 */
async function downloadPackage(downloadUrl, slug) {
  const slugDir = path.join(getPackagesDir(), slug);
  fs.mkdirSync(slugDir, { recursive: true });

  const zipPath = path.join(slugDir, `${slug}.zip`);

  const res = await axios({
    method: 'GET',
    url: downloadUrl,
    responseType: 'arraybuffer',
    timeout: 120000,
  });

  fs.writeFileSync(zipPath, Buffer.from(res.data));
  return zipPath;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Smart package resolver:
 *  1. Fetches latest metadata from server
 *  2. Compares version with local data.json
 *  3. Downloads only if no cache or version is newer
 *  4. Updates data.json
 *  5. Returns absolute zip path for WP-CLI to install
 *
 * @param {string} serverUrl
 * @param {string} slug
 * @param {string} apiKey
 * @returns {Promise<string>} Absolute path to local zip file.
 */
export async function resolvePackage(serverUrl, slug, apiKey) {
  const spinner = ora(`Checking ${slug}...`).start();

  // 1. Fetch metadata
  let metadata;
  try {
    metadata = await fetchMetadata(serverUrl, slug, apiKey);
  } catch (err) {
    spinner.fail(`Cannot get metadata for ${slug}.`);
    throw err;
  }

  const { version, download_url } = metadata;

  // 2. Check cache
  const cached = findCachedEntry(slug);
  if (cached && cached.version === version && fs.existsSync(cached.package_path)) {
    spinner.succeed(`${slug} v${version} — cached ✓`);
    return cached.package_path;
  }

  // 3. Download
  spinner.text = `Downloading ${slug} v${version}...`;
  let zipPath;
  try {
    zipPath = await downloadPackage(download_url, slug);
  } catch (err) {
    spinner.fail(`Download failed: ${slug}`);
    throw err;
  }

  // 4. Update data.json (replace old entry or add new)
  const entries = loadDataJson();
  const idx = entries.findIndex((e) => e.slug === slug);
  const newEntry = { slug, version, package_path: zipPath };

  if (idx >= 0) {
    // Clean up old zip if path changed
    const old = entries[idx];
    if (old.package_path !== zipPath && fs.existsSync(old.package_path)) {
      try { fs.unlinkSync(old.package_path); } catch { /* ignore */ }
    }
    entries[idx] = newEntry;
  } else {
    entries.push(newEntry);
  }
  saveDataJson(entries);

  spinner.succeed(`${slug} v${version} — downloaded`);
  return zipPath;
}
