# AI1WM Backup Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the AI1WM backup plugin installation flow to correctly install the premium plugin from the private package server.

**Architecture:** Export the existing `installAi1wmPlugin` function from `src/restore.js` and use it in `src/backup.js`, passing down the configuration object to access the private package server credentials.

**Tech Stack:** Node.js, JS (ESM)

## Global Constraints

- Node.js ESM format must be used for imports/exports.
- Testing is skipped in this plan because the project currently lacks a testing framework.

---

### Task 1: Export `installAi1wmPlugin` from `src/restore.js`

**Files:**
- Modify: `src/restore.js`

**Interfaces:**
- Produces: `export async function installAi1wmPlugin(siteDir, config)`

- [ ] **Step 1: Export the function**

Modify `src/restore.js` to add the `export` keyword before `async function installAi1wmPlugin(siteDir, config)`.

```javascript
export async function installAi1wmPlugin(siteDir, config) {
```

- [ ] **Step 2: Commit**

```bash
git add src/restore.js
git commit -m "refactor(restore): export installAi1wmPlugin"
```

---

### Task 2: Import and use `installAi1wmPlugin` in `src/backup.js`

**Files:**
- Modify: `src/backup.js`

**Interfaces:**
- Consumes: `import { installAi1wmPlugin } from './restore.js';`
- Modifies: `backupSite()`
- Modifies: `backupAi1wm(siteName, siteDir, backupsDir, config)`

- [ ] **Step 1: Import `installAi1wmPlugin`**

In `src/backup.js`, at the top of the file with other imports, add:

```javascript
import { installAi1wmPlugin } from './restore.js';
```

- [ ] **Step 2: Update `backupSite` to pass `config`**

In `src/backup.js`, locate the `backupSite` function. It currently calls:
```javascript
	} else {
		await backupAi1wm(siteName, siteDir, backupsDir);
	}
```
Update it to pass `config`:
```javascript
	} else {
		await backupAi1wm(siteName, siteDir, backupsDir, config);
	}
```

- [ ] **Step 3: Update `backupAi1wm` definition and logic**

In `src/backup.js`, locate `backupAi1wm`.
Update its signature to accept `config`:
```javascript
async function backupAi1wm(siteName, siteDir, backupsDir, config) {
```

Then, replace the old plugin installation block:
```javascript
	try {
		runWpCommand(
			['plugin', 'install', 'all-in-one-wp-migration-unlimited-extension', '--activate'],
			siteDir
		);
		spinner.succeed('AI1WM plugin installed & activated.');
	} catch (err) {
		spinner.warn(`Plugin install warning (continuing): ${err.message}`);
	}
```
with the new call using `installAi1wmPlugin`:
```javascript
	try {
		await installAi1wmPlugin(siteDir, config);
		spinner.succeed('AI1WM plugin installed & activated.');
	} catch (err) {
		spinner.warn(`Plugin install warning (continuing): ${err.message}`);
	}
```

- [ ] **Step 4: Commit**

```bash
git add src/backup.js
git commit -m "fix(backup): use private package server for AI1WM plugin installation"
```
