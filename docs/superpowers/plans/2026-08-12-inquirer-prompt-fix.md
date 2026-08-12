# Inquirer Prompt Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix crashes caused by the deprecated `list` prompt type by updating it to `select` across the codebase.

**Architecture:** We will replace all occurrences of `type: 'list'` with `type: 'select'` inside `inquirer.prompt()` calls in the affected source files.

**Tech Stack:** Node.js, JS (ESM), Inquirer

## Global Constraints

- Node.js ESM format must be used for imports/exports.
- Testing is skipped for individual steps because there is no testing framework, but we will rely on syntax checking for verification.

---

### Task 1: Update prompt types across `src` directory files

**Files:**
- Modify: `src/backup.js`
- Modify: `src/manage.js`
- Modify: `src/restore.js`
- Modify: `src/settings.js`

**Interfaces:**
- Produces: Corrected inquirer prompt definitions using `type: 'select'` instead of `type: 'list'`.

- [ ] **Step 1: Update `src/backup.js`**

Replace all occurrences of `type: 'list'` with `type: 'select'`.

- [ ] **Step 2: Update `src/manage.js`**

Replace all occurrences of `type: 'list'` with `type: 'select'`.

- [ ] **Step 3: Update `src/restore.js`**

Replace all occurrences of `type: 'list'` with `type: 'select'`.

- [ ] **Step 4: Update `src/settings.js`**

Replace all occurrences of `type: 'list'` with `type: 'select'`.

- [ ] **Step 5: Verify Syntax**

Run `npm test` to ensure there are no syntax errors introduced by the changes.
Expected: PASS with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/backup.js src/manage.js src/restore.js src/settings.js
git commit -m "fix(cli): replace deprecated inquirer list prompt with select"
```
