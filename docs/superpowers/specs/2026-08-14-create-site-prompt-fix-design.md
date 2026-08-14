# Inquirer Prompt Type Fix in Main CLI Design

## Problem
When creating a new WordPress site with `create-wp`, the prompt to select a theme fails with:
```
✖ Unexpected error: Prompt type "list" is not registered. Available prompt types: checkbox, confirm, editor, expand, input, number, password, rawlist, search, select
```
This occurs because Inquirer v9+ deprecated/removed the `list` prompt type in favor of `select`. While other files in `src/` were previously updated, `bin/create-wp.js` at line 108 still uses `type: 'list'`.

## Scope and Audit
A full codebase search across all JavaScript files in `bin/` and `src/` was conducted. All other interactive prompts in `src/` use valid types (`select`, `input`, `password`, `confirm`, `checkbox`). Only `bin/create-wp.js` in `promptTheme` contains the unsupported `list` type.

## Proposed Changes

### `bin/create-wp.js`
In function `promptTheme(config)`:
- Replace `type: 'list'` with `type: 'select'`.
- Retain all other existing properties (`name`, `message`, `default`, `choices`, `pageSize`).

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

## Verification
1. Run syntax verification: `node --check bin/create-wp.js` and `npm test`.
2. Verify interactive prompt rendering.
