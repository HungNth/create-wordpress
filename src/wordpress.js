import axios from 'axios';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { getConfigDir, getWordPressCacheDir } from './utils/path.js';

const WP_VERSION_API = 'https://api.wordpress.org/core/version-check/1.7/';
const WP_CACHE_SLUG = 'wordpress-core';

// ─── Cache helpers (mirrors packages.js pattern) ─────────────────────────────

function getDataJsonPath() {
  return path.join(getConfigDir(), 'data.json');
}

function getWpCoreDir() {
  return getWordPressCacheDir();
}

function loadDataJson() {
  const p = getDataJsonPath();
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}

function saveDataJson(entries) {
  fs.writeFileSync(getDataJsonPath(), JSON.stringify(entries, null, 2), 'utf-8');
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Fetches latest WP version info from the official API.
 * @returns {Promise<{version: string, downloadUrl: string}>}
 */
async function getLatestVersionInfo() {
  const response = await axios.get(WP_VERSION_API, { timeout: 15000 });
  const offers = response.data?.offers;
  if (!offers || offers.length === 0) {
    throw new Error('WordPress API returned no version offers.');
  }
  const latest = offers[0];
  const downloadUrl = latest.packages?.no_content;
  if (!downloadUrl) {
    throw new Error('Could not find no_content download URL from WordPress API.');
  }
  return { version: latest.version, downloadUrl };
}

// ─── Smart zip resolver ───────────────────────────────────────────────────────

/**
 * Ensures the WordPress core zip is available locally.
 * Downloads only if the cached version is outdated or missing.
 * Tracks version in data.json under slug "wordpress-core".
 *
 * @returns {Promise<{zipPath: string, version: string}>}
 */
async function resolveWordPressZip() {
  const spinner = ora('Checking WordPress version...').start();

  let versionInfo;
  try {
    versionInfo = await getLatestVersionInfo();
  } catch (err) {
    spinner.fail('Failed to fetch WordPress version info.');
    throw err;
  }

  const { version, downloadUrl } = versionInfo;

  // Check cache
  const entries = loadDataJson();
  const cached = entries.find((e) => e.slug === WP_CACHE_SLUG);
  if (cached && cached.version === version && fs.existsSync(cached.package_path)) {
    spinner.succeed(`WordPress v${version} — cached ✓`);
    return { zipPath: cached.package_path, version };
  }

  // Download
  spinner.text = `Downloading WordPress v${version}...`;
  const wpCacheDir = getWpCoreDir();
  fs.mkdirSync(wpCacheDir, { recursive: true });
  const zipPath = path.join(wpCacheDir, `wordpress-${version}-no-content.zip`);

  try {
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'arraybuffer',
      timeout: 120000,
      onDownloadProgress: (progress) => {
        if (progress.total) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          spinner.text = `Downloading WordPress v${version}... ${pct}%`;
        }
      },
    });
    fs.writeFileSync(zipPath, Buffer.from(response.data));
  } catch (err) {
    spinner.fail('Failed to download WordPress.');
    throw err;
  }

  // Update data.json — replace old entry or append
  const idx = entries.findIndex((e) => e.slug === WP_CACHE_SLUG);
  const newEntry = { slug: WP_CACHE_SLUG, version, package_path: zipPath };

  if (idx >= 0) {
    const old = entries[idx];
    // Clean up old cached zip if it was a different file
    if (old.package_path !== zipPath && fs.existsSync(old.package_path)) {
      try { fs.unlinkSync(old.package_path); } catch { /* ignore */ }
    }
    entries[idx] = newEntry;
  } else {
    entries.push(newEntry);
  }
  saveDataJson(entries);

  spinner.succeed(`WordPress v${version} — downloaded`);
  return { zipPath, version };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolves the cached WP zip (downloading only if needed) and extracts it
 * into the given destination directory, stripping the inner "wordpress/" folder.
 *
 * @param {string} destinationDir  Absolute path to the site directory.
 */
export async function downloadAndExtractWordPress(destinationDir) {
  const { zipPath } = await resolveWordPressZip();

  const spinner = ora('Extracting WordPress files...').start();
  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    for (const entry of entries) {
      const relativePath = entry.entryName.replace(/^wordpress\//, '');
      if (!relativePath) continue;

      const targetPath = path.join(destinationDir, relativePath);

      if (entry.isDirectory) {
        fs.mkdirSync(targetPath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, entry.getData());
      }
    }

    spinner.succeed('WordPress extracted.');
  } catch (err) {
    spinner.fail('Failed to extract WordPress.');
    throw err;
  }
}
