<div align="center">

# Create WordPress CLI

**A modern CLI tool to scaffold and manage local WordPress sites, with Laravel Herd integration enabled by default.**

[![Node.js Version](https://img.shields.io/badge/node_>=_18.0.0-brightgreen.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-macOS_%7C_Windows-lightgrey.svg)]()
[![Built with WP-CLI](https://img.shields.io/badge/WP--CLI-Integrated-blue.svg)](https://wp-cli.org)

</div>

## Overview

`create-wp` is an interactive Node.js command-line tool designed to automate local WordPress development setup.

Instead of manually downloading WordPress, configuring the database, running through the 5-minute install, and installing themes/plugins, this tool does it automatically. When Laravel Herd is enabled, it also provisions local HTTPS certificates with `herd secure`.

## Roadmap

- [x] Backup website
- [x] Restore website

### Key Features

- **🚀 Interactive Setup:** Simple wizard for choosing site names, themes, and plugins.
- **⚡ Smart Caching:** WordPress core, themes, and plugins are cached locally in `~/.config/create-wordpress/cache/` to prevent redundant downloads on future runs.
- **🗄️ Database Automation:** Automatically creates MySQL databases via `mysql2`.
- **🔒 Optional Herd SSL:** Laravel Herd is the default local environment integration. When enabled, the CLI runs `herd secure` for local HTTPS (`https://site-name.test`).
- **📦 Private Package Server:** Connects to a private update server to download premium themes and plugins.
- **🛠️ Settings Editor:** Use `--settings` to update the saved CLI defaults in `config.json`.
- **⚙️ Site Configuration:** Use `--config` to change admin credentials, install configured themes/plugins, find packages by slug, or apply saved WordPress tweaks to existing sites.
- **🗄️ Backup & Restore:** Create full-source `.zip` backups or AI1WM `.wpress` backups, then restore from `.zip`, `.wpress`, or a `wp-content/` folder plus SQL dump.
- **🧹 Easy Cleanup:** Use `--delete` to instantly wipe a site directory and drop its database.

---

## Prerequisites

Before using this tool, make sure your system has the following installed:

1. **[Node.js](https://nodejs.org)** (v18.0.0 or higher)
2. **[WP-CLI](https://wp-cli.org/)** (Must be available in your system `PATH`)
3. **MySQL-compatible database** (Must be reachable with the credentials saved in `config.json`)

Optional:

- **[Laravel Herd](https://herd.laravel.com)** — enabled by default during first-time setup. If disabled, the CLI skips all Herd-specific steps.

> [!IMPORTANT]
> WP-CLI must be available in your `PATH`. If you enable Herd integration, `herd` must also be available in your `PATH`; otherwise only the Herd SSL step will fail or be skipped.

---

## Installation

### From GitHub

```bash
npm install -g https://github.com/HungNth/create-wordpress.git
```

### From npm

```bash
npm install -g @thienhungdev/create-wp
```

> [!NOTE]
> On first run, the tool will launch a one-time setup wizard to configure Herd integration, your paths, database credentials, and default admin details. Settings are saved to `~/.config/create-wordpress/config.json`.

---

## USEFUL COMMANDS

```bash
create-wp
create-wp --config
create-wp --backup (-b)
create-wp --restore (-r)
create-wp --delete <my-site-name>
create-wp --settings
create-wp --version (-v)
create-wp --help (-h)
```

---

## Usage

### Create a new WordPress site

```bash
create-wp
```

<details>
<summary><strong>What happens step by step</strong></summary>

1. **Config check** — Loads `~/.config/create-wordpress/config.json`, or runs the setup wizard on first run.
2. **Site name** — Prompts for a name (normalised to kebab-case). Validates that no directory or database collision exists.
3. **Theme selection** — Choose from a list of themes defined in your config.
4. **Plugin selection** — Multi-select checkbox to pick plugins.
5. **Provisioning:**
   - Creates the site directory in your configured websites path.
   - Creates a blank MySQL database.
   - Downloads WordPress core (uses cache on subsequent runs).
   - Generates `wp-config.php` and runs the WP install via WP-CLI.
   - Installs and activates the selected theme and plugins.
   - Prompts whether to apply saved `wp_tweaks`.
   - Provisions an SSL cert via `herd secure` when `use_herd` is enabled.

</details>

---

### Edit saved CLI settings

```bash
create-wp --settings
```

Opens an interactive editor for `~/.config/create-wordpress/config.json` so you can update the saved defaults after first run.

This is useful when you want to change:

- websites path
- Laravel Herd integration
- database username, password, port, or socket
- default WordPress admin username, password, or email
- package server URL or API key
- theme list, default theme, or plugin list
- `wp_tweaks` — `config_set`, `rewrite_structure`, `option_update`, `language_core`, `site`

Changes are only written when you choose **Save & Exit**.

---

### Show installed version

```bash
create-wp --version
```

```bash
create-wp -v
```

Prints the installed package version and exits.

---

### Show full help

```bash
create-wp --help
```

```bash
create-wp -h
```

Prints the full usage guide and exits.

---

### Configure an existing site

```bash
create-wp --config
```

Launches the site configuration wizard with 5 options:

| Option                                 | Description                                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 🔐 Change admin credentials            | Update admin username (via MySQL), password and email (via WP-CLI). Reads `DB_NAME` and `$table_prefix` directly from `wp-config.php`. |
| ⚙️ Apply WordPress configuration       | Applies each entry in `wp_tweaks` from `config.json` to the selected site via WP-CLI. Supports all 5 tweak types.                      |
| 🔍 Find and install package(s) by slug | Enter one or more comma-separated slugs, resolve them from the private package server, and install each package automatically.         |
| 🎨 Install theme                       | Pick a theme from your config list and install it on the selected site.                                                                |
| 🔌 Install plugins                     | Multi-select checkbox to install one or more plugins from your config list.                                                            |

`Apply WordPress configuration` reads the `wp_tweaks` array from `config.json` and runs each tweak in order:

| Type                | WP-CLI command                                                               |
| ------------------- | ---------------------------------------------------------------------------- |
| `config_set`        | `wp config set <KEY> <VALUE>` (+ `--raw` for booleans / integers)            |
| `rewrite_structure` | `wp rewrite structure <VALUE> --hard`                                        |
| `option_update`     | `wp option update <KEY> <VALUE>`                                             |
| `language_core`     | `wp language core <KEY> <VALUE>` (KEY = `install` \| `activate` \| `update`) |
| `site`              | `wp site <KEY> <VALUE>` (for multisite sub-commands)                         |

`Find and install package(s) by slug` lets you install packages that are available on your private package server but are not necessarily saved in the local `themes` or `plugins` lists.

Example input:

```text
flatsome, advanced-custom-fields-pro, wp-rocket
```

For each slug, the CLI fetches metadata from the package server, downloads or reuses the cached ZIP, then tries to install it as a plugin first. If plugin installation fails, it falls back to installing it as a theme. A result summary is printed after all slugs are processed.

> [!IMPORTANT]
> `Find and install package(s) by slug` requires both `server_url` and `package_api_key` in `config.json`.

---

### Backup a website

```bash
create-wp --backup
```

```bash
create-wp -b
```

Launches an interactive backup wizard:

| Method                    | Output                               | Details                                                                                                                                                                            |
| ------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Full source code`        | `full-source_<site>_<timestamp>.zip` | Exports the database to a temporary `.sql`, zips the site folder, excludes `.idea`, `.vscode`, `node_modules`, and `__MACOSX`, then removes the loose SQL file from the site root. |
| `All-in-One WP Migration` | `ai1wm-<site>_<timestamp>.wpress`    | Installs/activates the AI1WM plugin, runs `wp ai1wm backup`, then moves the generated backup into the shared backups folder.                                                       |

All backups are saved to:

```bash
<websites_path>/backups/
```

The backup picker excludes the `backups` directory itself, so only actual sites are listed.

---

### Restore a website

```bash
create-wp --restore
```

```bash
create-wp -r
```

Launches an interactive restore wizard with 3 modes:

| Method                                 | Input                  | What the CLI does                                                                                                                                                                                                                                   |
| -------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Restore from full source backup`      | `.zip`                 | Extracts the archive into a new site directory, creates/reuses the database, updates or creates `wp-config.php`, imports the bundled `.sql`, updates `siteurl` and `home`, then runs `herd secure` when Herd is enabled.                            |
| `Restore from All-in-One WP Migration` | `.wpress`              | Creates a fresh WordPress site, installs the AI1WM plugin, copies the `.wpress` file into `wp-content/ai1wm-backups/`, runs `wp ai1wm restore`, then provisions SSL when Herd is enabled.                                                           |
| `Restore from wp-content folder`       | `wp-content/` + `.sql` | Creates a fresh WordPress site, replaces the generated `wp-content` with your provided folder, imports the SQL dump directly via `mysql2`, syncs the detected table prefix, updates `siteurl` and `home`, then provisions SSL when Herd is enabled. |

For all restore modes:

- you choose a new site name, and it is normalized to kebab-case
- if the target directory already exists, the CLI asks before overwriting it
- when `use_herd` is enabled, the restored site is secured with Herd and ends up at `https://<site-name>.test`

For `Restore from wp-content folder`, the folder path must point to a directory named exactly `wp-content`. The copy process skips Windows shortcut files, symlinks, and directories listed in `wp_content_copy_excludes`.

> [!IMPORTANT]
> Restoring from `.wpress` requires the plugin `all-in-one-wp-migration-unlimited-extension` to exist in `config.plugins`. If it is hosted on your private package server, `server_url` and `package_api_key` must also be configured.

---

### Delete a WordPress site

**Interactive mode** — shows a multi-select list of all existing sites:

```bash
create-wp --delete
```

**Direct mode** — delete a specific site immediately:

```bash
create-wp --delete my-site-name
```

Both modes show a summary of what will be deleted (directory + database) and ask for a single confirmation before any destructive action.

---

## Configuration

Config file location:

- **macOS:** `~/.config/create-wordpress/config.json`
- **Windows:** `~/.config/create-wordpress/config.json`

You can edit this file manually, or run:

```bash
create-wp --settings
```

Cache directory:

- **WordPress core ZIPs:** `~/.config/create-wordpress/cache/wordpress-core/`
- **Theme and plugin ZIPs:** `~/.config/create-wordpress/cache/packages/`
- **Version metadata:** `~/.config/create-wordpress/data.json`

### Example `config.json`

```json
{
  "use_herd": true,
  "websites_path": "F:\\laravel-herd\\wordpress",
  "server_url": "https://your-private-repo.com/api/v1/package", // https:://package.example.com/api/v1/package/package_slug?license_key=YOUR_SECRET_KEY
  "package_api_key": "YOUR_SECRET_KEY",
  "default_admin_username": "admin",
  "default_admin_password": "password123",
  "default_admin_email": "admin@example.com",
  "database_port": 3306,
  "db_username": "root",
  "db_password": "",
  "default_theme_slug": "flatsome",
  "backup_excludes": [".idea", ".vscode", "node_modules", "__MACOSX"],
  "wp_content_copy_excludes": [
    ".idea",
    ".vscode",
    "__MACOSX",
    "node_modules",
    "cache"
  ],
  "themes": [
    { "name": "Flatsome", "slug": "flatsome" },
    { "name": "Bricks", "slug": "bricks" }
  ],
  "plugins": [
    {
      "name": "Advanced Custom Fields PRO",
      "slug": "advanced-custom-fields-pro"
    },
    { "name": "WP Rocket", "slug": "wp-rocket" }
  ],
  "wp_tweaks": [
    { "type": "config_set", "key": "WP_DEBUG", "value": "true", "raw": true },
    { "type": "rewrite_structure", "value": "/%category%/%postname%/" },
    {
      "type": "option_update",
      "key": "timezone_string",
      "value": "Asia/Ho_Chi_Minh"
    },
    { "type": "language_core", "key": "install", "value": "vi" },
    { "type": "language_core", "key": "activate", "value": "vi" }
  ]
}
```

> [!NOTE]
> If `server_url` and `package_api_key` are left empty, the CLI skips theme and plugin downloads - WordPress core setup still works perfectly.

> [!NOTE]
> Set `"use_herd": false` if you do not use Laravel Herd. The CLI will still create, configure, backup, restore, and delete WordPress sites, but it will not run `herd secure`.

> [!NOTE]
> `backup_excludes` controls directories skipped by full-source backups. `wp_content_copy_excludes` controls directories skipped when restoring from a `wp-content/` folder.

---

## Architecture

- **Unified config path:** On both macOS and Windows, configuration is stored in `~/.config/create-wordpress/config.json`.
- **Smart caching:** WordPress core ZIPs live in `~/.config/create-wordpress/cache/wordpress-core/`, theme and plugin ZIPs live in `~/.config/create-wordpress/cache/packages/`, and versions are tracked in `~/.config/create-wordpress/data.json`.
- **Optional Herd integration:** `use_herd` controls whether the CLI runs Herd-specific SSL provisioning. Existing configs are migrated to `use_herd: true` to preserve the original default behavior.
- **Restore from wp-content:** The restore flow can rebuild a fresh WordPress core, copy a supplied `wp-content/` folder, import a `.sql` dump with `mysql2`, detect the imported table prefix, and update local URLs.
- **Cross-platform binary resolution:** On Windows, WP-CLI may resolve as `wp.bat`. The tool detects `.bat`/`.cmd` extensions and routes via `cmd.exe /c` to avoid the Node.js `DEP0190` shell warning.
- **Admin ID resolution:** When changing admin credentials, the tool runs `wp user list --field=ID --number=1` to find the real admin user ID (which may not be `1`), falling back to a direct MySQL query if WP-CLI is unavailable.
- **DB name from config:** `DB_NAME` and `$table_prefix` are parsed directly from the site's `wp-config.php`, so the tool works correctly with existing sites that have a different directory name vs. database name.
