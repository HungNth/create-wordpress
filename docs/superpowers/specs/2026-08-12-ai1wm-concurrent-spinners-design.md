# AI1WM Concurrent Spinners Fix Design

## Problem
When running `create-wp --backup` with the All-in-One WP Migration method, `ora` emits warnings:
`[ora] Multiple concurrent spinners detected. This may cause visual corruption. Use one spinner at a time.`

This occurs because `backupAi1wm` in `src/backup.js` starts a spinner that wraps `installAi1wmPlugin`. However, `installAi1wmPlugin` internally calls `resolvePackage` and `installPlugin`, both of which start and manage their own `ora` spinners. Running multiple `ora` spinners simultaneously in the same terminal causes the warning.

## Solution
Remove the outer wrapper spinner in `src/backup.js`.

### Changes to `src/backup.js`

In `backupAi1wm`:
Remove the outer spinner initialization and replace `spinner.succeed` and `spinner.warn` with `console.log`.

**Before:**
```javascript
	// 1. Install & activate plugin
	let spinner = ora('Installing All-in-One WP Migration plugin...').start();
	try {
		await installAi1wmPlugin(siteDir, config);
		spinner.succeed('AI1WM plugin installed & activated.');
	} catch (err) {
		spinner.warn(`Plugin install warning (continuing): ${err.message}`);
	}
```

**After:**
```javascript
	// 1. Install & activate plugin
	try {
		await installAi1wmPlugin(siteDir, config);
		console.log(chalk.green('✔  AI1WM plugin installed & activated.'));
	} catch (err) {
		console.log(chalk.yellow(`⚠  Plugin install warning (continuing): ${err.message}`));
	}
```

This delegates the progress UI entirely to the underlying functions that actually perform the work, removing the conflict.
