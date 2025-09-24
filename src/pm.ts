import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type PM = 'npm' | 'pnpm' | 'yarn' | 'bun';

export function detectPM(folder: string, cfg: vscode.WorkspaceConfiguration, outputChannel?: vscode.OutputChannel): PM {
  const pref = cfg.get<string>('packageVersions.packageManager', 'auto');
  const folderName = path.basename(folder);
  
  if (pref && pref !== 'auto') {
    if (outputChannel) {
      outputChannel.appendLine(`[${new Date().toISOString().substring(11, 23)}] 🔧 Using configured package manager: ${pref} (${folderName})`);
    }
    return pref as PM;
  }
  
  const has = (f: string) => fs.existsSync(path.join(folder, f));
  
  let detected: PM;
  if (has('pnpm-lock.yaml')) {
    detected = 'pnpm';
  } else if (has('yarn.lock')) {
    detected = 'yarn';
  } else if (has('bun.lockb')) {
    detected = 'bun';
  } else {
    detected = has('package-lock.json') ? 'npm' : 'npm';
  }
  
  if (outputChannel) {
    const lockfile = has('pnpm-lock.yaml') ? 'pnpm-lock.yaml' : 
                     has('yarn.lock') ? 'yarn.lock' : 
                     has('bun.lockb') ? 'bun.lockb' :
                     has('package-lock.json') ? 'package-lock.json' : 'none';
    outputChannel.appendLine(`[${new Date().toISOString().substring(11, 23)}] 🔍 Detected package manager: ${detected} (${folderName}, lockfile: ${lockfile})`);
  }
  
  return detected;
}

export function installCommand(pm: PM): string {
  switch (pm) {
    case 'pnpm': return 'pnpm install';
    case 'yarn': return 'yarn install';
    case 'bun': return 'bun install';
    default: return 'npm i';
  }
}

export function runInstallInTerminal(pm: PM, cwd: string, outputChannel?: vscode.OutputChannel) {
  const cmd = installCommand(pm);
  const folderName = path.basename(cwd);
  const terminalName = `Install: ${folderName}`;
  
  if (outputChannel) {
    outputChannel.appendLine(`[${new Date().toISOString().substring(11, 23)}] 🔧 Creating terminal "${terminalName}" with command: ${cmd}`);
  }
  
  const term = vscode.window.createTerminal({ name: terminalName, cwd });
  term.show(true);
  term.sendText(cmd);
  
  if (outputChannel) {
    outputChannel.appendLine(`[${new Date().toISOString().substring(11, 23)}] 🚀 Command sent to terminal: ${cmd}`);
  }
}
