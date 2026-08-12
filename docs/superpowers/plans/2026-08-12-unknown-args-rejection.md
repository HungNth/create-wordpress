# Unknown Arguments Rejection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unrecognized arguments from triggering the "Create a new WordPress site" interactive flow by explicitly validating them and showing the help menu.

**Architecture:** Add a strict validation block at the end of the argument parsing logic in `bin/create-wp.js`. If the script falls through all specific command checks but the `args` array still contains elements, it will log an error, print the help menu, and exit with status 1.

**Tech Stack:** Node.js, chalk

## Global Constraints

- Node.js ESM format must be used for imports/exports.
- Testing is skipped in this plan because the project currently lacks a testing framework; instead, syntax checks and CLI runs will be used for verification.

---

### Task 1: Add unknown arguments rejection logic

**Files:**
- Modify: `bin/create-wp.js`

**Interfaces:**
- Produces: Updated argument parsing flow that correctly terminates on unknown arguments.

- [ ] **Step 1: Update `bin/create-wp.js`**

Open `bin/create-wp.js`. Locate the end of the argument parsing section, just after the check for `--restore` and before `// ── Step 1: Load (or create) config`.
Insert the following check:

```javascript
	if (args.length > 0) {
		console.error(chalk.red(`\n✖  Unknown argument(s): ${args.join(' ')}\n`));
		printHelp();
		process.exit(1);
	}
```

- [ ] **Step 2: Verify Syntax and Execution**

Run: `node --check bin/create-wp.js`
Expected: PASS with no errors.

- [ ] **Step 3: Commit**

Since the user requested to review before commit, **DO NOT COMMIT YOUR CHANGES**. Skip Step 3.
