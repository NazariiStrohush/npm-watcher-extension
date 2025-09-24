import * as vscode from 'vscode';
import * as path from 'path';
import { detectPM, runInstallInTerminal } from './pm';
import { takeWorkspaceSnapshot, getBaseline, setBaseline, takeSnapshotFor, diffSnapshots, formatChanges, globPackageJsons } from './snapshot';

let timer: NodeJS.Timeout | undefined;
let statusBarItem: vscode.StatusBarItem;
let changedPackages: Set<string> = new Set();

export async function activate(ctx: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration();
  const fields = cfg.get<string[]>('packageVersions.suggestOnFields', [
    'dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies'
  ]);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'packageVersions.showUpdateOptions';
  ctx.subscriptions.push(statusBarItem);

  // Initial snapshot if none
  if (Object.keys(getBaseline(ctx)).length === 0) {
    const baseline = await takeWorkspaceSnapshot(fields);
    await setBaseline(ctx, baseline);
  }

  // Commands
  ctx.subscriptions.push(
    vscode.commands.registerCommand('packageVersions.snapshot', async () => {
      const baseline = await takeWorkspaceSnapshot(fields);
      await setBaseline(ctx, baseline);
      changedPackages.clear();
      updateStatusBar();
      vscode.window.showInformationMessage('Package versions snapshot updated for workspace.');
    }),

    vscode.commands.registerCommand('packageVersions.reset', async () => {
      await setBaseline(ctx, {});
      const baseline = await takeWorkspaceSnapshot(fields);
      await setBaseline(ctx, baseline);
      changedPackages.clear();
      updateStatusBar();
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
      const choice = await vscode.window.showInformationMessage(
        'Update npm packages?',
        'All',
        'Changed',
        'Show Changes',
        'Dismiss'
      );
      
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
          break;
      }
    }),

    vscode.commands.registerCommand('packageVersions.updateAll', () => updateAllPackages()),
    vscode.commands.registerCommand('packageVersions.updateChanged', () => updateChangedPackages())
  );

  // Watcher
  const watcher = vscode.workspace.createFileSystemWatcher('**/package.json');
  const onChange = (uri: vscode.Uri) => handlePackageChange(ctx, uri, fields);
  watcher.onDidChange(onChange, null, ctx.subscriptions);
  watcher.onDidCreate(onChange, null, ctx.subscriptions);
  // also fire on save of active editor to catch immediate changes
  ctx.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
    if (path.basename(doc.fileName) === 'package.json') onChange(doc.uri);
  }));

  ctx.subscriptions.push(watcher);
}

async function handlePackageChange(ctx: vscode.ExtensionContext, uri: vscode.Uri, fields: string[]) {
  const cfg = vscode.workspace.getConfiguration();
  const debounceMs = Math.max(0, cfg.get<number>('packageVersions.debounceMs', 250));
  clearTimeout(timer as any);
  timer = setTimeout(async () => {
    const file = uri.fsPath;
    const baseline = getBaseline(ctx);
    const prev = baseline[file];
    const next = await takeSnapshotFor(file, fields);
    if (!next) return;

    const changes = diffSnapshots(prev, next);
    if (changes.length === 0) return;

    // Add to changed packages and update status bar
    changedPackages.add(file);
    updateStatusBar();

    // Update baseline immediately so repeated prompts don't fire
    await setBaseline(ctx, { ...baseline, [file]: next });
  }, debounceMs);
}

function updateStatusBar() {
  const cfg = vscode.workspace.getConfiguration();
  const showStatusBar = cfg.get<boolean>('packageVersions.showStatusBar', true);
  
  if (changedPackages.size === 0 || !showStatusBar) {
    statusBarItem.hide();
  } else {
    const count = changedPackages.size;
    statusBarItem.text = `$(package) ${count} package${count === 1 ? '' : 's'} changed`;
    statusBarItem.tooltip = `${count} package(s) have dependency changes. Click to update.`;
    statusBarItem.show();
  }
}

async function updateAllPackages() {
  const cfg = vscode.workspace.getConfiguration();
  const files = await globPackageJsons();
  
  for (const file of files) {
    const folder = path.dirname(file);
    const pm = detectPM(folder, cfg);
    runInstallInTerminal(pm, folder);
  }
  
  changedPackages.clear();
  updateStatusBar();
  vscode.window.showInformationMessage(`Started install in ${files.length} package director${files.length === 1 ? 'y' : 'ies'}.`);
}

async function updateChangedPackages() {
  const cfg = vscode.workspace.getConfiguration();
  const changedArray = Array.from(changedPackages);
  
  for (const file of changedArray) {
    const folder = path.dirname(file);
    const pm = detectPM(folder, cfg);
    runInstallInTerminal(pm, folder);
  }
  
  changedPackages.clear();
  updateStatusBar();
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

export function deactivate() {}
