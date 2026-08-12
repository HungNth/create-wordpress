# Fix Concurrent Spinners in Restore Flow Design

## Problem
The user encountered `[ora] Multiple concurrent spinners detected` during `--restore`.
This is caused by `src/restore.js` creating `ora` spinners to wrap function calls that internally spawn their own `ora` spinners.

The functions that spawn their own spinners are:
1. `downloadAndExtractWordPress` (spawns 2 sequential spinners: downloading, extracting)
2. `setupWordPress` (spawns 1 spinner for config/install)
3. `secureWithHerd` (spawns 1 spinner for SSL provisioning)

In `src/restore.js`, these functions are wrapped in outer spinners across 5 occurrences:
- `restoreFullZip`: wraps `downloadAndExtractWordPress` and `setupWordPress`
- `restoreAi1wm`: wraps `downloadAndExtractWordPress` and `setupWordPress`
- `provisionSsl`: wraps `secureWithHerd`

## Solution
Remove the outer `ora` wrappers around these function calls in `src/restore.js`. Use `console.log(chalk.green(...))` or `chalk.yellow(...)` to report the high-level completion, delegating the progress UI completely to the internal functions.

### Detailed Changes to `src/restore.js`

1. **In `provisionSsl`:**
   Remove `const spinner = ora(...).start();` and its `succeed`/`warn` calls.
   Replace with `console.log` upon completion/error.

2. **In `restoreFullZip` (Downloading WP core):**
   Remove `spinner = ora('Downloading WordPress core…').start();`
   Replace `spinner.succeed` with `console.log(chalk.green('✔  WordPress core ready.'));`
   Replace `spinner.fail` with `console.log(chalk.red('✖  WP download failed: ...'));`

3. **In `restoreFullZip` (Installing WP):**
   Remove `spinner = ora('Installing WordPress…').start();`
   Replace `spinner.succeed` with `console.log(chalk.green('✔  WordPress installed.'));`
   Replace `spinner.fail` with `console.log(chalk.red('✖  WP install failed: ...'));`

4. **In `restoreAi1wm` (Downloading WP core):**
   Same changes as above.

5. **In `restoreAi1wm` (Installing WP):**
   Same changes as above.

By removing these 5 outer wrappers, all inner functions will execute and display their own spinners sequentially without conflict. A full codebase scan of all `ora(` instances has verified that these are the only remaining nested spinner wrappers.
