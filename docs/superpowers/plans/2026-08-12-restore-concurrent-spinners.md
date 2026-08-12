# Restore Concurrent Spinners Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the concurrent `ora` spinner warnings when running the restore commands.

**Architecture:** Remove outer `ora` wrappers in `src/restore.js` that conflict with inner function spinners (`downloadAndExtractWordPress`, `setupWordPress`, and `secureWithHerd`). Replace `spinner.succeed` and `spinner.fail` with direct `console.log(chalk.green(...))` and `console.log(chalk.red(...))` or `chalk.yellow(...)`.

**Tech Stack:** Node.js, chalk, ora

## Global Constraints

- Node.js ESM format must be used for imports/exports.
- Testing is skipped in this plan because the project currently lacks a testing framework; instead, syntax checks will be run for verification.

---

### Task 1: Remove wrapper spinners in `src/restore.js`

**Files:**
- Modify: `src/restore.js`

**Interfaces:**
- Produces: Updated `restoreFullZip`, `restoreAi1wm`, and `provisionSsl` functions that don't start conflicting spinners.

- [ ] **Step 1: Update `provisionSsl`**

Find `provisionSsl` in `src/restore.js`. Remove the `ora` spinner.
**Before:**
```javascript
	const spinner = ora(\`Securing with Herd SSL: \${siteName}.test…\`).start();
	try {
		await secureWithHerd(siteName);
		spinner.succeed(\`HTTPS ready → https://\${siteName}.test\`);
	} catch (err) {
		spinner.warn(\`SSL failed (run "herd secure \${siteName}" manually): \${err.message}\`);
	}
```
**After:**
```javascript
	try {
		await secureWithHerd(siteName);
		console.log(chalk.green(\`✔  HTTPS ready → https://\${siteName}.test\`));
	} catch (err) {
		console.log(chalk.yellow(\`⚠  SSL failed (run "herd secure \${siteName}" manually): \${err.message}\`));
	}
```

- [ ] **Step 2: Update `restoreFullZip`**

Find `restoreFullZip` in `src/restore.js`. Remove the spinners for WP core downloading and installation.
**Before:**
```javascript
	// 5. Download WordPress core
	spinner = ora('Downloading WordPress core…').start();
	try {
		await downloadAndExtractWordPress(siteDir);
		spinner.succeed('WordPress core ready.');
	} catch (err) {
		spinner.fail(\`WP download failed: \${err.message}\`);
		return;
	}

	// 6. Basic WP setup (wp-config.php + core install)
	spinner = ora('Installing WordPress…').start();
	try {
		await setupWordPress({ sitePath: siteDir, siteName, config });
		spinner.succeed('WordPress installed.');
	} catch (err) {
		spinner.fail(\`WP install failed: \${err.message}\`);
		return;
	}
```
**After:**
```javascript
	// 5. Download WordPress core
	try {
		await downloadAndExtractWordPress(siteDir);
		console.log(chalk.green('✔  WordPress core ready.'));
	} catch (err) {
		console.log(chalk.red(\`✖  WP download failed: \${err.message}\`));
		return;
	}

	// 6. Basic WP setup (wp-config.php + core install)
	try {
		await setupWordPress({ sitePath: siteDir, siteName, config });
		console.log(chalk.green('✔  WordPress installed.'));
	} catch (err) {
		console.log(chalk.red(\`✖  WP install failed: \${err.message}\`));
		return;
	}
```

- [ ] **Step 3: Update `restoreAi1wm`**

Find `restoreAi1wm` in `src/restore.js`. Remove the spinners for WP core downloading and installation (similar to `restoreFullZip`).
**Before:**
```javascript
	// 4. Download WordPress core
	spinner = ora('Downloading WordPress core…').start();
	try {
		await downloadAndExtractWordPress(siteDir);
		spinner.succeed('WordPress core ready.');
	} catch (err) {
		spinner.fail(\`WP download failed: \${err.message}\`);
		return;
	}

	// 5. Create wp-config.php + run core install (minimal — AI1WM will overwrite everything)
	spinner = ora('Installing WordPress…').start();
	try {
		await setupWordPress({
			sitePath: siteDir,
			siteName,
			config,
		});
		spinner.succeed('WordPress installed.');
	} catch (err) {
		spinner.fail(\`WP install failed: \${err.message}\`);
		return;
	}
```
**After:**
```javascript
	// 4. Download WordPress core
	try {
		await downloadAndExtractWordPress(siteDir);
		console.log(chalk.green('✔  WordPress core ready.'));
	} catch (err) {
		console.log(chalk.red(\`✖  WP download failed: \${err.message}\`));
		return;
	}

	// 5. Create wp-config.php + run core install (minimal — AI1WM will overwrite everything)
	try {
		await setupWordPress({
			sitePath: siteDir,
			siteName,
			config,
		});
		console.log(chalk.green('✔  WordPress installed.'));
	} catch (err) {
		console.log(chalk.red(\`✖  WP install failed: \${err.message}\`));
		return;
	}
```

- [ ] **Step 4: Verify Syntax**

Run: `node --check src/restore.js`
Expected: PASS with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/restore.js
git commit -m "fix(cli): remove wrapper spinners in restore flow to prevent concurrent ora warnings"
```
