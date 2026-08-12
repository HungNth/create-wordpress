# Fix AI1WM Backup Plugin Installation Flow

## Problem
When using `create-wp --backup` and selecting the AI1WM method, the script fails to install the `all-in-one-wp-migration-unlimited-extension` plugin. The error occurs because the script currently tries to install it using the standard WP-CLI command (`wp plugin install <slug>`), which only searches the public WordPress.org repository. Because this is a premium plugin, it returns a "Plugin not found" error.

However, the user noted that installing the plugin via `create-wp --config` works perfectly. This is because the configuration setup correctly utilizes the private package server to resolve and download the zip file using `server_url` and `package_api_key`.

## Approach & Architecture
We will fix the backup flow by reusing the private package installation logic that is already working elsewhere in the codebase (specifically in `restore.js`).

### 1. Reusable Plugin Installation Logic
In `src/restore.js`, there is an existing `installAi1wmPlugin(siteDir, config)` function that:
- Finds the AI1WM plugin in `config.plugins`.
- Validates the `server_url` and `package_api_key`.
- Uses `resolvePackage` to download the zip file and `installPlugin` to activate it.

We will export this function so it can be reused by the backup process.

### 2. Update the Backup Flow
In `src/backup.js`:
- Import `installAi1wmPlugin` from `./restore.js`.
- In the `backupSite` function, we already load the `config`. We need to pass this `config` object to `backupAi1wm`.
- Update `backupAi1wm` to accept `config` as the fourth parameter: `backupAi1wm(siteName, siteDir, backupsDir, config)`.
- Replace the failing `runWpCommand` installation block with `await installAi1wmPlugin(siteDir, config)`.

## Error Handling
The existing `installAi1wmPlugin` function properly throws errors if the configuration for the private server is missing or if the plugin is not found in the config. These errors will be caught in `backup.js` by the existing try/catch block, displaying a warning while allowing the process to continue.

## Affected Files
- `src/restore.js` (Export `installAi1wmPlugin`)
- `src/backup.js` (Import and use `installAi1wmPlugin`, pass `config` appropriately)
