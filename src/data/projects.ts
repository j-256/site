export type MetaSource =
  | { source: 'pushed' }
  | { source: 'release' };

export interface Project {
  perms: string;
  owner: string;
  group: string;
  /** Either a literal string (rendered verbatim) or a source descriptor (resolved at build time). */
  meta: string | MetaSource;
  /** Display name -- what shows up as the directory/file name. */
  name: string;
  /** GitHub `owner/repo` slug. Used for the link target and for build-time metadata fetches. */
  repo: string;
  desc: string;
}

export const projects: Project[] = [
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: { source: 'pushed' },
    name: 'sh',
    repo: 'j-256/sh',
    desc: 'Shell utilities you can run by piping the URL to bash; no install needed',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: 'stable',
    name: 'rover-dumper',
    repo: 'j-256/rover-dumper',
    desc: "Bookmarklet: download every photo of your pet from Rover.com as a zip",
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: { source: 'pushed' },
    name: 'claude-code-skills',
    repo: 'j-256/claude-code-skills',
    desc: 'Claude Code skills + eval harness; three of them target the Salesforce dev docs',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: { source: 'pushed' },
    name: 'ccam',
    repo: 'j-256/ccam',
    desc: 'TypeScript CLI and SDK for the Commerce Cloud Account Manager API (and its reference implementation, since the API is undocumented)',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: { source: 'release' },
    name: 'git-crypt-vscode',
    repo: 'j-256/git-crypt-vscode',
    desc: "VSCode extension that keeps git-crypt'd repos from breaking the Source Control panel",
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: 'stable',
    name: 'qlomni',
    repo: 'j-256/qlomni',
    desc: "macOS QuickLook extension for the text files macOS itself won't preview",
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: 'stable',
    name: 'plugin_rootfile',
    repo: 'j-256/plugin_rootfile',
    desc: 'SFCC B2C cartridge: serve static files from any path, including the apex',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: { source: 'pushed' },
    name: 'site',
    repo: 'j-256/site',
    desc: 'Source for this site',
  },
];
