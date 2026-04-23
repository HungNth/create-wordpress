<div align="center">

# Create WordPress CLI

**A modern, lightning-fast CLI tool to scaffold WordPress sites effortlessly within the Laravel Herd environment.**

[![Node.js Version](https://img.shields.io/badge/node_>=_18.0.0-brightgreen.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-macOS_%7C_Windows-lightgrey.svg)]()
[![Built with WP-CLI](https://img.shields.io/badge/WP--CLI-Integrated-blue.svg)](https://wp-cli.org)

</div>

## Overview

`create-wp` is an interactive Node.js command-line tool designed to completely automate local WordPress development setup when using [Laravel Herd](https://herd.laravel.com).

Instead of manually downloading WordPress, configuring the database, running through the 5-minute install, and adding SSL certificates, this tool does it all automatically—including downloading and activating your favorite premium themes and plugins from a private package server.

### Key Features

- **🚀 Interactive Setup:** Simple wizard for choosing site names, themes, and plugins.
- **⚡ Smart Caching:** WordPress core, themes, and plugins are cached locally in `~/.config/create-wordpress/cache/` to prevent redundant downloads on future runs.
- **🗄️ Database Automation:** Automatically creates MySQL databases via `mysql2`.
- **🔒 Automatic SSL:** Seamless integration with `herd secure` to instantly provision local HTTPS (`https://site-name.test`).
- **📦 Private Package Server:** Connects to a private update server to download premium themes and plugins.
- **🛠️ Settings Editor:** Use `--settings` to update the saved CLI defaults in `config.json`.
- **⚙️ Site Configuration:** Use `--config` to change admin credentials, install themes, add plugins, or apply saved WordPress tweaks to existing sites.
- **🧹 Easy Cleanup:** Use `--delete` to instantly wipe a site directory and drop its database.

---

## Prerequisites

Before using this tool, make sure your system has the following installed:

1. **[Node.js](https://nodejs.org)** (v18.0.0 or higher)
2. **[Laravel Herd](https://herd.laravel.com)** (Must be currently running)
3. **[WP-CLI](https://wp-cli.org/)** (Must be available in your system `PATH`)

> [!IMPORTANT]
> If WP-CLI or Laravel Herd are not detected in your PATH, the CLI will throw an error or skip certain steps. On Windows, make sure Herd's injected paths are accessible globally.

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
> On first run, the tool will launch a one-time setup wizard to configure your paths, database credentials, and default admin details. Settings are saved to `~/.config/create-wordpress/config.json`.

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
   - Creates the site directory in your Herd path.
   - Creates a blank MySQL database.
   - Downloads WordPress core (uses cache on subsequent runs).
   - Generates `wp-config.php` and runs the WP install via WP-CLI.
   - Installs and activates the selected theme and plugins.
   - Provisions an SSL cert via `herd secure`.

</details>

---

### Edit saved CLI settings

```bash
create-wp --settings
```

Opens an interactive editor for `~/.config/create-wordpress/config.json` so you can update the saved defaults after first run.

This is useful when you want to change:

- websites path
- database username, password, port, or socket
- default WordPress admin username, password, or email
- package server URL or API key
- theme list, default theme, or plugin list
- `wp_tweaks` used by `create-wp --config`

Changes are only written when you choose **Save & Exit**.

---

### Configure an existing site

```bash
create-wp --config
```

Launches the site configuration wizard with 4 options:

| Option                           | Description                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🔐 Change admin credentials      | Update admin username (via MySQL), password and email (via WP-CLI). Reads `DB_NAME` and `$table_prefix` directly from `wp-config.php`.                 |
| 🎨 Install theme                 | Pick a theme from your config list and install it on the selected site.                                                                                |
| 🔌 Install plugins               | Multi-select checkbox to install one or more plugins from your config list.                                                                            |
| ⚙️ Apply WordPress configuration | Applies each entry in `wp_tweaks` from `config.json` to the selected site via WP-CLI. Supports `config_set`, `rewrite_structure`, and `option_update`. |

`Apply WordPress configuration` reads the `wp_tweaks` array from `config.json` and runs each tweak in order:

- `config_set` -> `wp config set <KEY> <VALUE>` with optional `--raw`
- `rewrite_structure` -> `wp rewrite structure <VALUE> --hard`
- `option_update` -> `wp option update <KEY> <VALUE>`
- `language_core` -> `wp language core <KEY> <VALUE>`
- `site` -> `wp site <KEY> <VALUE>`

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
  "websites_path": "F:\\laravel-herd\\wordpress",
  "server_url": "https://your-private-repo.com/api",
  "package_api_key": "YOUR_SECRET_KEY",
  "default_admin_username": "admin",
  "default_admin_password": "password123",
  "default_admin_email": "admin@example.com",
  "database_port": 3306,
  "db_username": "root",
  "db_password": "",
  "default_theme_slug": "flatsome",
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
    }
  ]
}
```

> [!NOTE]
> If `server_url` and `package_api_key` are left empty, the CLI skips theme and plugin downloads - WordPress core setup still works perfectly.

---

## Architecture

- **Unified config path:** On both macOS and Windows, configuration is stored in `~/.config/create-wordpress/config.json`.
- **Smart caching:** WordPress core ZIPs live in `~/.config/create-wordpress/cache/wordpress-core/`, theme and plugin ZIPs live in `~/.config/create-wordpress/cache/packages/`, and versions are tracked in `~/.config/create-wordpress/data.json`.
- **Cross-platform binary resolution:** On Windows, Herd injects WP-CLI as `wp.bat`. The tool detects `.bat`/`.cmd` extensions and routes via `cmd.exe /c` to avoid the Node.js `DEP0190` shell warning.
- **Admin ID resolution:** When changing admin credentials, the tool runs `wp user list --field=ID --number=1` to find the real admin user ID (which may not be `1`), falling back to a direct MySQL query if WP-CLI is unavailable.
- **DB name from config:** `DB_NAME` and `$table_prefix` are parsed directly from the site's `wp-config.php`, so the tool works correctly with existing sites that have a different directory name vs. database name.
