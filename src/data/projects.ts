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
    desc: 'Shell script library, served from the URL',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: 'stable',
    name: 'rover-dumper',
    repo: 'j-256/rover-dumper',
    desc: 'Bookmarklet: bulk-download Rover.com pet photos',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: { source: 'pushed' },
    name: 'claude-code-skills',
    repo: 'j-256/claude-code-skills',
    desc: 'Public skills for Claude Code',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: { source: 'pushed' },
    name: 'ccam',
    repo: 'j-256/ccam',
    desc: 'TS CLI + SDK for Salesforce Commerce Cloud Account Manager',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: { source: 'release' },
    name: 'git-crypt-vscode',
    repo: 'j-256/git-crypt-vscode',
    desc: 'VSCode: make git-crypt repos work in Source Control',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: 'stable',
    name: 'qlomni',
    repo: 'j-256/qlomni',
    desc: 'macOS QuickLook for the text files macOS forgets',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    meta: 'stable',
    name: 'plugin_rootfile',
    repo: 'j-256/plugin_rootfile',
    desc: 'SFCC cartridge: serve static files from any URI',
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
