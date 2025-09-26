import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PkgJson, Snapshot, DepMap } from './types';

const KEY = 'packageVersions.baseline';

type Baseline = Record<string /*fsPath*/, Snapshot>;

export async function readJson<T = any>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function globPackageJsons(): Promise<string[]> {
  // First get workspace folders
  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  const rootPackageJsons: string[] = [];
  
  // Check for package.json in each workspace root
  for (const folder of workspaceFolders) {
    const rootPackageJson = path.join(folder.uri.fsPath, 'package.json');
    try {
      await fs.readFile(rootPackageJson, 'utf8');
      rootPackageJsons.push(rootPackageJson);
    } catch {
      // No package.json in this workspace root, skip
    }
  }
  
  // If no workspace folders or no root package.json found, fall back to finding any package.json
  if (rootPackageJsons.length === 0) {
    const uris = await vscode.workspace.findFiles('**/package.json', '**/{node_modules,dist,out,.next,.turbo}/**', 10);
    return uris.map(u => u.fsPath);
  }
  
  return rootPackageJsons;
}

function pickFields(pkg: PkgJson, fields: string[]): Record<string, DepMap> {
  const out: Record<string, DepMap> = {};
  for (const f of fields) {
    const v: any = (pkg as any)[f];
    if (!v) continue;
    if (Array.isArray(v)) {
      // bundledDependencies as an array -> convert to map with "*"
      out[f] = Object.fromEntries((v as string[]).map((n) => [n, '*']));
    } else {
      out[f] = { ...v } as DepMap;
    }
  }
  return out;
}

export async function takeSnapshotFor(file: string, fields: string[]): Promise<Snapshot | null> {
  const pkg = await readJson<PkgJson>(file);
  if (!pkg) return null;
  return { fields: pickFields(pkg, fields), takenAt: Date.now() };
}

export async function takeWorkspaceSnapshot(fields: string[]): Promise<Baseline> {
  const files = await globPackageJsons();
  const entries = await Promise.all(files.map(async f => [f, await takeSnapshotFor(f, fields)] as const));
  const baseline: Baseline = {};
  for (const [f, snap] of entries) if (snap) baseline[f] = snap;
  return baseline;
}

export function getBaseline(ctx: vscode.ExtensionContext): Baseline {
  return ctx.workspaceState.get<Baseline>(KEY) ?? {};
}

export async function setBaseline(ctx: vscode.ExtensionContext, baseline: Baseline) {
  await ctx.workspaceState.update(KEY, baseline);
}

export function diffSnapshots(prev: Snapshot | undefined, next: Snapshot | undefined) {
  const changes: { field: string; name: string; from?: string; to?: string }[] = [];
  if (!prev && next) {
    for (const [field, map] of Object.entries(next.fields)) {
      for (const [name, to] of Object.entries(map)) changes.push({ field, name, to });
    }
    return changes;
  }
  if (!next) return changes;

  const fields = new Set([...Object.keys(prev?.fields ?? {}), ...Object.keys(next.fields)]);
  for (const field of fields) {
    const a = prev?.fields[field] ?? {};
    const b = next.fields[field] ?? {};
    const names = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const name of names) {
      const va = a[name];
      const vb = b[name];
      if (va !== vb) changes.push({ field, name, from: va, to: vb });
    }
  }
  return changes;
}

export function formatChanges(changes: ReturnType<typeof diffSnapshots>): string[] {
  return changes.map(c => `${c.field}: ${c.name}  ${c.from ?? '∅'} → ${c.to ?? '∅'}`);
}
