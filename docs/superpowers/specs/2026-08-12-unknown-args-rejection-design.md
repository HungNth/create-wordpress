# Unknown Arguments Rejection Design

## Problem
Currently, the `create-wp` CLI script falls through to the "Create a new WordPress site" interactive flow if the user inputs an argument that is not recognized (e.g., `create-wp --abc` or `create-wp -f`). This causes unexpected behavior when the user makes a typo. The script should instead reject unknown arguments, display an error, and show the help menu.

## Solution
Apply a strict rejection pattern at the end of the argument parsing block in `bin/create-wp.js`.

### Architecture
The CLI script parses arguments using simple `if` blocks. Every valid command (e.g., `--delete`, `--config`, `--backup`) handles its logic and immediately calls `return;`. 
Because of this structure, if the execution reaches past the argument check block and the `args` array is not empty, it guarantees that the provided arguments did not match any known commands. 

### Changes to `bin/create-wp.js`

Right after the check for `--restore` and before "Step 1: Load (or create) config", insert a validation block:

```javascript
	if (args.length > 0) {
		console.error(chalk.red(`\n✖  Unknown argument(s): ${args.join(' ')}\n`));
		printHelp();
		process.exit(1);
	}
```

This simple addition ensures that:
- `create-wp` (no arguments) will bypass the block because `args.length` is 0, successfully proceeding to create a new site.
- `create-wp --backup` will execute `backupSite()` and `return`, never reaching this block.
- `create-wp --abc` will skip all known flag checks, reach this block, print the unknown argument error, show the help menu, and exit safely with status code 1.
