export type MetaSource =
  | { source: 'pushed' }
  | { source: 'release' }
  | { source: 'tag' };

export interface Project {
  /** ls-style mode string. Leading char by artifact shape: `-` for a single runnable thing (script, CLI, bookmarklet), `d` for a bundle/tree (extension, cartridge, collection). */
  perms: string;
  owner: string;
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
    meta: { source: 'pushed' },
    name: 'sh',
    repo: 'j-256/sh',
    desc: 'Shell utilities you can run by piping the URL to bash; no install needed',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'release' },
    name: 'stowplan',
    repo: 'j-256/stowplan',
    desc: 'Offline-first inventory app for physical storage; plans explainable moves and syncs when online',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'release' },
    name: 'reorg',
    repo: 'j-256/reorg',
    desc: 'CLI that plans a directory cleanup in your browser, then applies it with an undo script',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'pushed' },
    name: 'claude-code-skills',
    repo: 'j-256/claude-code-skills',
    desc: 'Claude Code skills + eval harness; three of them target the Salesforce dev docs',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'pushed' },
    name: 'stream-eval',
    repo: 'j-256/stream-eval',
    desc: 'Deterministic eval harness for `claude -p` transcripts, with a live dashboard',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'release' },
    name: 'git-crypt-vscode',
    repo: 'j-256/git-crypt-vscode',
    desc: "VSCode extension that keeps git-crypt'd repos from breaking the Source Control panel",
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'release' },
    name: 'qlomni',
    repo: 'j-256/qlomni',
    desc: 'macOS QuickLook extension for the text files macOS itself ignores',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: 'stable',
    name: 'bm_keyvalidator',
    repo: 'j-256/bm_keyvalidator',
    desc: 'SFCC B2C Business Manager extension: confirm a private key and public key form a matching pair (handy for DKIM)',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: 'stable',
    name: 'plugin_rootfile',
    repo: 'j-256/plugin_rootfile',
    desc: 'SFCC B2C cartridge: serve static files from any path, including the apex',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'pushed' },
    name: 'p12-generator',
    repo: 'j-256/p12-generator',
    desc: 'Turns a B2C Commerce CA bundle into a .p12 keystore, entirely in your browser',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'release' },
    name: 'ccam',
    repo: 'j-256/ccam',
    desc: 'TypeScript CLI and SDK for the Commerce Cloud Account Manager API (and its reference implementation, since the API is undocumented)',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'tag' },
    name: 'rover-dumper',
    repo: 'j-256/rover-dumper',
    desc: 'Bookmarklet: download every photo of your pet from Rover.com as a zip',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'pushed' },
    name: 'site',
    repo: 'j-256/site',
    desc: 'Source for this site',
  },
];
