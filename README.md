# Package Versions: Snapshot & Install Prompt

A lightweight VS Code/Cursor extension that:

- Captures a snapshot of dependency versions from each `package.json` in your workspace.
- Watches for changes to dependency version fields.
- When changes are detected, shows a status bar notification in the bottom left corner.
- Provides quick options to update all packages or only changed packages.
- Supports monorepos (multiple `package.json`).
- Provides commands to manually snapshot/reset/show changes.

## Features

- **Status Bar Notifications**: Shows a clickable indicator in the bottom left when packages have changes
- **Batch Updates**: Options to update all packages or only changed packages
- **Smart Detection**: Detects changes in `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`, `bundledDependencies`
- **Package Manager Auto-Detection**: Picks the right package manager (npm/pnpm/yarn/bun) via lockfile or user setting
- **Terminal Integration**: Runs install commands in integrated terminals scoped to each package's directory
- **Debounced Watching**: Avoids duplicate notifications with configurable debounce timing

## Commands

- **Package Versions: Take Snapshot** – Re-snapshot all `package.json` files
- **Package Versions: Reset Baseline** – Clear baseline and snapshot fresh
- **Package Versions: Show Changes** – Show a diff-like quick pick of changed deps since baseline for the active `package.json`
- **Package Versions: Update All Packages** – Run install in all workspace package directories  
- **Package Versions: Update Changed Packages** – Run install only in directories with changes

## Settings

```jsonc
{
  "packageVersions.packageManager": "auto", // "auto" | "npm" | "pnpm" | "yarn" | "bun"
  "packageVersions.suggestOnFields": [
    "dependencies",
    "devDependencies", 
    "peerDependencies",
    "optionalDependencies",
    "bundledDependencies"
  ],
  "packageVersions.alwaysSuggest": true, // when true, suggest install whenever any version change is detected
  "packageVersions.debounceMs": 250, // debounce time for file watching (ms)
  "packageVersions.showStatusBar": true // show status bar notification when packages change
}
```

## Installation

1. Install from the VS Code marketplace
2. The extension activates automatically when you open a workspace with `package.json` files
3. It takes an initial snapshot of all package versions on first activation

## Usage

1. **Status Bar Notifications**: When dependency versions change, a notification appears in the bottom left status bar showing the number of changed packages. Click it to see update options.

2. **Update Options**: 
   - **Update All**: Runs install in all workspace package directories
   - **Update Changed**: Runs install only in directories that have changes
   - **Show Changes**: View detailed list of all dependency changes
   - **Dismiss**: Hide the notification

3. **Manual Commands**: 
   - Use Command Palette (`Cmd/Ctrl+Shift+P`) and search for "Package Versions" to access all commands
   - Take snapshots, reset baselines, or manually trigger updates

4. **Configuration**: Adjust settings in VS Code preferences to customize behavior, package manager preference, status bar visibility, and which dependency fields to watch.

## How it Works

1. On activation, the extension scans your workspace for `package.json` files
2. It creates a baseline snapshot of all dependency versions  
3. When files change, it compares new versions against the baseline
4. If changes are detected, it shows a status bar notification with the count of changed packages
5. Click the status bar item to see options: Update All, Update Changed, Show Changes, or Dismiss
6. The baseline is updated after each change to prevent duplicate notifications

## Package Manager Detection

The extension automatically detects your package manager by looking for lockfiles:
- `pnpm-lock.yaml` → pnpm
- `yarn.lock` → yarn  
- `bun.lockb` → bun
- `package-lock.json` → npm
- Default → npm

You can override this with the `packageVersions.packageManager` setting.

## Development

### Building and Packaging

To create a new installable package:

```bash
# Quick build and package
npm run package

# Build, package, and auto-install
npm run package:install

# Or use the shell script
./package.sh
```

This will generate a `.vsix` file that you can install in any VS Code/Cursor instance.

### Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch for changes and recompile
- `npm run package` - Build and create VSIX package
- `npm run package:install` - Build, package, and auto-install in VS Code

## License

MIT
