# AI1WM Concurrent Spinners Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the concurrent `ora` spinner warning when running the AI1WM backup method.

**Architecture:** Remove the outer spinner in `src/backup.js` that wraps `installAi1wmPlugin`, delegating progress reporting to the internal functions (`resolvePackage` and `installPlugin`) which already manage their own spinners. Replace `spinner.succeed` and `spinner.warn` with `console.log`.

**Tech Stack:** Node.js, chalk, ora

## Global Constraints

- Node.js ESM format must be used for imports/exports.
- Testing is skipped in this plan because the project currently lacks a testing framework; instead, syntax checks will be run for verification.

---

### Task 1: Remove wrapper spinner in `src/backup.js`

**Files:**
- Modify: `src/backup.js`

**Interfaces:**
- Produces: Updated `backupAi1wm` function that does not start a spinner for plugin installation.

- [ ] **Step 1: Update `src/backup.js`**

In `src/backup.js`, within the `backupAi1wm` function, find the section that installs and activates the AI1WM plugin. Remove the `let spinner = ora('Installing All-in-One WP Migration plugin...').start();` line. Replace `spinner.succeed` and `spinner.warn` with `console.log(chalk.green(...))` and `console.log(chalk.yellow(...))`.

```javascript
	// 1. Install & activate plugin
	try {
		await installAi1wmPlugin(siteDir, config);
		console.log(chalk.green('✔  AI1WM plugin installed & activated.'));
	} catch (err) {
		console.log(chalk.yellow(`⚠  Plugin install warning (continuing): ${err.message}`));
	}
```

- [ ] **Step 2: Verify Syntax**

Run syntax check to ensure there are no errors.

Run: `node --check src/backup.js`
Expected: PASS with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/backup.js
git commit -m "fix(cli): remove wrapper spinner to prevent concurrent ora warnings"
```
