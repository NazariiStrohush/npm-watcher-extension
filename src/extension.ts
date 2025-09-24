import * as vscode from 'vscode';
import * as path from 'path';
import { detectPM, runInstallInTerminal } from './pm';
import { takeWorkspaceSnapshot, getBaseline, setBaseline, takeSnapshotFor, diffSnapshots, formatChanges, globPackageJsons } from './snapshot';

let timer: NodeJS.Timeout | undefined;
let statusBarItem: vscode.StatusBarItem;
let changedPackages: Set<string> = new Set();
let outputChannel: vscode.OutputChannel;

export async function activate(ctx: vscode.ExtensionContext) {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel('Package Versions');
  ctx.subscriptions.push(outputChannel);
  
  log('🚀 Package Versions extension activated');
  
  const cfg = vscode.workspace.getConfiguration();
  const fields = cfg.get<string[]>('packageVersions.suggestOnFields', [
    'dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies'
  ]);
  
  log(`📋 Watching fields: ${fields.join(', ')}`);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'packageVersions.showUpdateOptions';
  ctx.subscriptions.push(statusBarItem);
  log('📊 Status bar item created');

  // Initial snapshot if none
  const existingBaseline = getBaseline(ctx);
  if (Object.keys(existingBaseline).length === 0) {
    log('📸 Taking initial snapshot of workspace packages...');
    const baseline = await takeWorkspaceSnapshot(fields);
    await setBaseline(ctx, baseline);
    log(`📸 Initial snapshot complete: ${Object.keys(baseline).length} package.json files found`);
  } else {
    log(`📸 Using existing baseline with ${Object.keys(existingBaseline).length} packages`);
  }

  // Commands
  ctx.subscriptions.push(
    vscode.commands.registerCommand('packageVersions.snapshot', async () => {
      log('🔄 Taking new snapshot command triggered');
      const baseline = await takeWorkspaceSnapshot(fields);
      await setBaseline(ctx, baseline);
      changedPackages.clear();
      updateStatusBar();
      log(`📸 New snapshot taken: ${Object.keys(baseline).length} packages`);
      vscode.window.showInformationMessage('Package versions snapshot updated for workspace.');
    }),

    vscode.commands.registerCommand('packageVersions.reset', async () => {
      log('🔄 Reset baseline command triggered');
      await setBaseline(ctx, {});
      const baseline = await takeWorkspaceSnapshot(fields);
      await setBaseline(ctx, baseline);
      changedPackages.clear();
      updateStatusBar();
      log(`🔄 Baseline reset complete: ${Object.keys(baseline).length} packages`);
      vscode.window.showInformationMessage('Baseline reset and freshly snapshotted.');
    }),

    vscode.commands.registerCommand('packageVersions.showChanges', async () => {
      const editor = vscode.window.activeTextEditor;
      const file = editor?.document?.fileName;
      if (!file || path.basename(file) !== 'package.json') {
        return vscode.window.showInformationMessage('Open a package.json to show changes.');
      }
      const baseline = getBaseline(ctx);
      const prev = baseline[file];
      const next = await takeSnapshotFor(file, fields);
      const changes = diffSnapshots(prev, next ?? undefined);
      if (changes.length === 0) return vscode.window.showInformationMessage('No version changes since baseline.');
      const items = formatChanges(changes).map(label => ({ label }));
      vscode.window.showQuickPick(items, { title: 'Dependency version changes since baseline' });
    }),

    vscode.commands.registerCommand('packageVersions.showUpdateOptions', async () => {
      log(`💬 Update options dialog shown (${changedPackages.size} changed packages)`);
      const choice = await vscode.window.showInformationMessage(
        'Update npm packages?',
        'All',
        'Changed',
        'Show Changes',
        'Dismiss'
      );
      
      log(`💬 User selected: ${choice || 'cancelled'}`);
      switch (choice) {
        case 'All':
          await updateAllPackages();
          break;
        case 'Changed':
          await updateChangedPackages();
          break;
        case 'Show Changes':
          await showAllChanges(ctx, fields);
          break;
        case 'Dismiss':
          changedPackages.clear();
          updateStatusBar();
          log('🔕 Changes dismissed');
          break;
      }
    }),

    vscode.commands.registerCommand('packageVersions.updateAll', () => updateAllPackages()),
    vscode.commands.registerCommand('packageVersions.updateChanged', () => updateChangedPackages())
  );

  // Watcher
  log('👀 Setting up file watchers for package.json files');
  const watcher = vscode.workspace.createFileSystemWatcher('**/package.json');
  const onChange = (uri: vscode.Uri) => handlePackageChange(ctx, uri, fields);
  watcher.onDidChange(onChange, null, ctx.subscriptions);
  watcher.onDidCreate(onChange, null, ctx.subscriptions);
  // also fire on save of active editor to catch immediate changes
  ctx.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
    if (path.basename(doc.fileName) === 'package.json') {
      log(`💾 package.json saved: ${doc.fileName}`);
      onChange(doc.uri);
    }
  }));

  ctx.subscriptions.push(watcher);
  log('✅ Extension initialization complete');
}

async function handlePackageChange(ctx: vscode.ExtensionContext, uri: vscode.Uri, fields: string[]) {
  const cfg = vscode.workspace.getConfiguration();
  const debounceMs = Math.max(0, cfg.get<number>('packageVersions.debounceMs', 250));
  const fileName = path.basename(path.dirname(uri.fsPath));
  
  log(`🔄 Package change detected: ${fileName}/package.json (debouncing ${debounceMs}ms)`);
  
  clearTimeout(timer as any);
  timer = setTimeout(async () => {
    const file = uri.fsPath;
    const baseline = getBaseline(ctx);
    const prev = baseline[file];
    const next = await takeSnapshotFor(file, fields);
    
    if (!next) {
      log(`⚠️ Could not read package.json: ${file}`);
      return;
    }

    const changes = diffSnapshots(prev, next);
    log(`📊 Found ${changes.length} changes in ${fileName}/package.json`);
    
    if (changes.length === 0) return;

    // Log the specific changes
    for (const change of changes.slice(0, 5)) { // Log first 5 changes
      log(`  📝 ${change.field}: ${change.name} ${change.from || '∅'} → ${change.to || '∅'}`);
    }
    if (changes.length > 5) {
      log(`  📝 ... and ${changes.length - 5} more changes`);
    }

    // Add to changed packages and update status bar
    changedPackages.add(file);
    updateStatusBar();

    // Update baseline immediately so repeated prompts don't fire
    await setBaseline(ctx, { ...baseline, [file]: next });
    log(`💾 Baseline updated for ${fileName}`);
  }, debounceMs);
}

function updateStatusBar() {
  const cfg = vscode.workspace.getConfiguration();
  const showStatusBar = cfg.get<boolean>('packageVersions.showStatusBar', true);
  
  if (changedPackages.size === 0 || !showStatusBar) {
    statusBarItem.hide();
    log('📊 Status bar hidden (no changes or disabled)');
  } else {
    const count = changedPackages.size;
    statusBarItem.text = `$(package) ${count} package${count === 1 ? '' : 's'} changed`;
    statusBarItem.tooltip = `${count} package(s) have dependency changes. Click to update.`;
    statusBarItem.show();
    log(`📊 Status bar updated: ${count} package${count === 1 ? '' : 's'} changed`);
  }
}

async function updateAllPackages() {
  log('🔄 Update All Packages triggered');
  const cfg = vscode.workspace.getConfiguration();
  const files = await globPackageJsons();
  
  log(`📦 Found ${files.length} package.json files to update`);
  
  for (const file of files) {
    const folder = path.dirname(file);
    const pm = detectPM(folder, cfg, outputChannel);
    const folderName = path.basename(folder);
    log(`🚀 Starting ${pm} install in ${folderName}`);
    runInstallInTerminal(pm, folder, outputChannel);
  }
  
  changedPackages.clear();
  updateStatusBar();
  log(`✅ Started install in ${files.length} package director${files.length === 1 ? 'y' : 'ies'}`);
  vscode.window.showInformationMessage(`Started install in ${files.length} package director${files.length === 1 ? 'y' : 'ies'}.`);
}

async function updateChangedPackages() {
  log('🔄 Update Changed Packages triggered');
  const cfg = vscode.workspace.getConfiguration();
  const changedArray = Array.from(changedPackages);
  
  log(`📦 Found ${changedArray.length} changed package.json files to update`);
  
  for (const file of changedArray) {
    const folder = path.dirname(file);
    const pm = detectPM(folder, cfg, outputChannel);
    const folderName = path.basename(folder);
    log(`🚀 Starting ${pm} install in ${folderName} (changed)`);
    runInstallInTerminal(pm, folder, outputChannel);
  }
  
  changedPackages.clear();
  updateStatusBar();
  log(`✅ Started install in ${changedArray.length} changed package director${changedArray.length === 1 ? 'y' : 'ies'}`);
  vscode.window.showInformationMessage(`Started install in ${changedArray.length} changed package director${changedArray.length === 1 ? 'y' : 'ies'}.`);
}

async function showAllChanges(ctx: vscode.ExtensionContext, fields: string[]) {
  const baseline = getBaseline(ctx);
  const allChanges: { file: string; changes: ReturnType<typeof diffSnapshots> }[] = [];
  
  for (const file of changedPackages) {
    const prev = baseline[file];
    const next = await takeSnapshotFor(file, fields);
    const changes = diffSnapshots(prev, next ?? undefined);
    if (changes.length > 0) {
      allChanges.push({ file, changes });
    }
  }
  
  if (allChanges.length === 0) {
    return vscode.window.showInformationMessage('No changes found.');
  }
  
  const items = allChanges.flatMap(({ file, changes }) => [
    { label: `📁 ${path.basename(path.dirname(file))}`, description: path.dirname(file), kind: vscode.QuickPickItemKind.Separator },
    ...formatChanges(changes).map(change => ({ label: `  ${change}`, description: '' }))
  ]);
  
  await vscode.window.showQuickPick(items, { title: 'All dependency changes across workspace' });
}

function log(message: string) {
  const timestamp = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
  outputChannel.appendLine(`[${timestamp}] ${message}`);
}

export function deactivate() {
  log('🛑 Package Versions extension deactivated');
}
