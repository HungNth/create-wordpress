<div align="center">

# Create WordPress for Laravel Herd

**A modern, lightning-fast CLI tool to scaffold WordPress sites effortlessly within the Laravel Herd environment.**

[![Node.js Version](https://img.shields.io/badge/node_>=_18.0.0-brightgreen.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-macOS_%7C_Windows-lightgrey.svg)]()
[![Built with WP-CLI](https://img.shields.io/badge/WP--CLI-Integrated-blue.svg)](https://wp-cli.org)

</div>

## Overview

`create-wordpress` is an interactive Node.js command-line tool designed to completely automate local WordPress development setup when using [Laravel Herd](https://herd.laravel.com).

Instead of manually downloading WordPress, configuring the database, running through the 5-minute install, and adding SSL certificates, this tool does it all automatically—including downloading and activating your favorite premium themes and plugins from a private package server.

### Key Features

- **🚀 Interactive Setup:** Simple wizard for choosing site names, themes, and plugins.
- **⚡ Smart Caching:** WordPress core, themes, and plugins are cached locally in `~/.config/create-wordpress` to prevent redundant downloads on future runs.
- **🗄️ Database Automation:** Automatically creates MySQL databases via `mysql2`.
- **🔒 Automatic SSL:** Seamless integration with `herd secure` to instantly provision local HTTPS (`https://site-name.test`).
- **📦 Package Management Integration:** Connects to a private update server to download premium themes and plugins.
- **🧹 Easy Cleanup:** Use `--delete` to instantly wipe a site directory and drop its database.

---

## Prerequisites

Before using this tool, make sure your system has the following installed:

1. **[Node.js](https://nodejs.org)** (v18.0.0 or higher)
2. **[Laravel Herd](https://herd.laravel.com)** (Must be currently running)
3. **[WP-CLI](https://wp-cli.org/)** (Must be available in your system `PATH`)

> [!IMPORTANT]  
> If WP-CLI or Laravel Herd are not detected in your PATH, the CLI will throw an error or skip certain configurations. On Windows, make sure Herd's injected paths are accessible globally.

---

## Installation

You can run this package directly using `npx` without needing to install it globally:

```bash
npx create-wordpress
```

Or, if you prefer to install it globally:

```bash
npm install -g create-wordpress
create-wordpress
```

---

## Usage

### Creating a new Website

Simply run the command to launch the interactive wizard:

```bash
npx create-wordpress
```

<details>
<summary><strong>What happens when you run this?</strong></summary>

1. **Config check**: On the very first run, it will ask for your default paths (like `~/Herd`), database credentials, and default WordPress admin details. These are saved to `~/.config/create-wordpress/config.json`.
2. **Site Name**: Prompts for a website name (e.g., `my-shop`). It automatically normalizes this to a URL-friendly slug and ensures no database or directory collision exists.
3. **Themes & Plugins**: Select from your predefined list of themes and plugins.
4. **Provisioning**:
    - Creates the directory in your Herd path.
    - Connects to MySQL and creates a blank database.
    - Resolves WordPress core (using cache or live download).
    - Generates `wp-config.php` and runs the core installation via WP-CLI.
    - Installs and activates selected themes and plugins.
    - Provisions an SSL cert using `herd secure`.
      </details>

### Deleting a Website

To remove a site directory and completely drop its associated database, use the `--delete` flag:

**Interactive Mode:**
If you run it without specifying a name, you will get an interactive checkbox list to select one or multiple sites to delete:

```bash
npx create-wordpress --delete
```

**Direct Mode:**
If you know the exact name, pass it directly:

```bash
npx create-wordpress --delete my-site-name
```

---

## Configuration

On your first run, the tool generates a configuration file.

- **macOS/Linux**: `~/.config/create-wordpress/config.json`
- **Windows**: `%APPDATA%\create-wordpress\config.json`

You can manually edit this file to change your default database credentials, Herd path, or append new items to the `themes` and `plugins` arrays.

### Example `config.json`

```json
{
    "websites_path": "F:\\laravel-herd\\wordpress",
    "server_url": "https://your-private-repo.com/api",
    "package_api_key": "YOUR_SECRET_KEY",
    "default_admin_username": "admin",
    "default_admin_password": "password123",
    "database_port": 3306,
    "db_username": "root",
    "db_password": "",
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
    ]
}
```

> [!NOTE]  
> If `server_url` and `package_api_key` are left empty during setup, the CLI will skip downloading premium plugins and themes, but the core WordPress setup will still function perfectly.

---

## Architecture details

- Uses **`AdmZip`** for rapid in-memory extraction of WordPress core without relying on system `unzip` commands.
- Caching system tracks package versions in a `data.json` file. It pings your custom package server metadata endpoint to check if the local ZIP is outdated before initiating any downloads.
- Cross-platform binary resolution ensures Windows `.bat`/`.cmd` files (like Herd's injected `wp.bat`) gracefully spawn within a `cmd.exe` context to avoid Node.js `DEP0190` shell warnings.
