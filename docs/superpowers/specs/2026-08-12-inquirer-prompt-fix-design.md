# Inquirer Prompt Fix Design

## Problem
When running scripts like `node .\bin\create-wp.js --config`, the application crashes with the error: `Unexpected error: Prompt type "list" is not registered.`
This is because the project uses `inquirer` version `^14.0.2`, which has removed the `list` prompt type and replaced it with `select`.

## Architecture & Scope
We will update the prompt configurations throughout the codebase to match the new `inquirer` API.

**Changes:**
- Search for instances of `type: 'list'` used in `inquirer.prompt()` calls.
- Replace them with `type: 'select'`.

**Affected Files:**
- `src/backup.js`
- `src/manage.js`
- `src/restore.js`
- `src/settings.js`

## Error Handling & Testing
- The change is a direct alias update, so it poses no logical risks.
- We will rely on `npm test` (which runs syntax checks via `node --check`) to verify that no syntax errors were introduced during the replacement.

