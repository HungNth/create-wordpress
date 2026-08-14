# Fix Inquirer Prompt Type in Main CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `Prompt type "list" is not registered` runtime error when running `create-wp` to create a new WordPress site by updating `type: 'list'` to `type: 'select'`.

**Architecture:** Update `promptTheme` in `bin/create-wp.js` to use `type: 'select'` for theme selection in Inquirer.

**Tech Stack:** Node.js, Inquirer v9+

## Global Constraints

- Node.js ESM format must be used for imports/exports.
- Testing is skipped for individual unit tests because there is no testing framework; instead, syntax checks and CLI verification will be run.

---

### Task 1: Update promptTheme prompt type in `bin/create-wp.js`

**Files:**
- Modify: `bin/create-wp.js:106-115`

**Interfaces:**
- Produces: Corrected inquirer prompt definition in `promptTheme` using `type: 'select'` instead of `type: 'list'`.

- [ ] **Step 1: Update `promptTheme` in `bin/create-wp.js`**

Locate `promptTheme` in `bin/create-wp.js` around line 106-115.
Change `type: 'list'` to `type: 'select'`:

```javascript
	const { selectedSlug } = await inquirer.prompt([
		{
			type: 'select',
			name: 'selectedSlug',
			message: `Select a theme to install:`,
			default: defaultSlug,
			choices,
			pageSize: 12,
		},
	]);
```

- [ ] **Step 2: Run syntax verification**

Run: `node --check bin/create-wp.js && npm test`
Expected: PASS with exit code 0.

- [ ] **Step 3: Commit (Skipped until user review)**

*(Note: As requested by the user, do not commit files until reviewed)*.
