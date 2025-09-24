import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type PM = 'npm' | 'pnpm' | 'yarn' | 'bun';

export function detectPM(folder: string, cfg: vscode.WorkspaceConfiguration): PM {
  const pref = cfg.get<string>('packageVersions.packageManager', 'auto');
  if (pref && pref !== 'auto') return pref as PM;
  
  const has = (f: string) => fs.existsSync(path.join(folder, f));
  
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('bun.lockb')) return 'bun';
  return has('package-lock.json') ? 'npm' : 'npm';
}

export function installCommand(pm: PM): string {
  switch (pm) {
    case 'pnpm': return 'pnpm install';
    case 'yarn': return 'yarn install';
    case 'bun': return 'bun install';
    default: return 'npm i';
  }
}

export function runInstallInTerminal(pm: PM, cwd: string) {
  const cmd = installCommand(pm);
  const term = vscode.window.createTerminal({ name: `Install: ${path.basename(cwd)}`, cwd });
  term.show(true);
  term.sendText(cmd);
}
