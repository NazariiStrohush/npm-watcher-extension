export type DepMap = Record<string, string>;

export type PkgJson = {
  name?: string;
  version?: string;
  dependencies?: DepMap;
  devDependencies?: DepMap;
  peerDependencies?: DepMap;
  optionalDependencies?: DepMap;
  bundledDependencies?: string[] | DepMap;
};

export type Snapshot = {
  fields: Record<string, DepMap>;
  takenAt: number;
};
