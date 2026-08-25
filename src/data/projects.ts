export type MetaSource =
  | { source: 'pushed' }
  | { source: 'release' }
  | { source: 'tag' };

export interface Project {
  /** ls-style mode string. Leading char by artifact shape: `-` for a single runnable thing (script, CLI, bookmarklet), `d` for a bundle/tree (extension, cartridge, collection) */
  perms: string;
  owner: string;
  /** Either a literal string (rendered verbatim) or a source descriptor (resolved at build time) */
  meta: string | MetaSource;
  /** Display name -- what shows up as the directory/file name */
  name: string;
  /** GitHub `owner/repo` slug. Used for the link target and for build-time metadata fetches */
  repo: string;
  desc: string;
}

export const projects: Project[] = [
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'release' },
    name: 'stowplan',
    repo: 'j-256/stowplan',
    desc: 'Offline-first inventory app with explainable move plans, shared workspaces, and durable sync across outages',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'release' },
    name: 'hookrelay',
    repo: 'j-256/hookrelay',
    desc: 'Cloudflare event relay that normalizes webhooks and email, persists every decision, and retries each sink independently',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'pushed' },
    name: 'd1-r2-starter-factory',
    repo: 'j-256/d1-r2-starter-factory',
    desc: 'Source factory for synchronized D1 + R2 starters across ChatGPT Sites and Cloudflare Workers, with residue-checked generation and replay-safe publishing',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'release' },
    name: 'reorg',
    repo: 'j-256/reorg',
    desc: 'CLI for planning directory reorganizations with an AI agent in a shared browser, then applying them with generated undo',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'release' },
    name: 'ccam',
    repo: 'j-256/ccam',
    desc: 'Typed CLI and SDK for the undocumented Salesforce Commerce Cloud Account Manager API',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'pushed' },
    name: 'agent-skills',
    repo: 'j-256/agent-skills',
    desc: 'Agent skills that turn Salesforce API specs and live-sandbox findings into cited, runnable workflows',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'pushed' },
    name: 'stream-eval',
    repo: 'j-256/stream-eval',
    desc: 'Deterministic multi-agent eval harness with isolated profiles, portable assertions, and a live dashboard',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'pushed' },
    name: 'site',
    repo: 'j-256/site',
    desc: 'This Astro portfolio builds GitHub metadata into a responsive terminal UI and verifies it with automated browser tests',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'release' },
    name: 'qlomni',
    repo: 'j-256/qlomni',
    desc: 'macOS Quick Look extension for extensionless files, dotfiles, and text formats the system leaves unhandled',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'release' },
    name: 'git-crypt-vscode',
    repo: 'j-256/git-crypt-vscode',
    desc: 'VS Code extension that restores Source Control for git-crypt repos and bundles the missing macOS and Linux binary',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'pushed' },
    name: 'persistent-clicker',
    repo: 'j-256/persistent-clicker',
    desc: 'Chrome extension that clicks a selected control on a per-tab interval and resumes across reloads and navigation',
  },
  {
    perms: 'drwxr-xr-x',
    owner: 'jklein',
    meta: 'stable',
    name: 'bm_keyvalidator',
    repo: 'j-256/bm_keyvalidator',
    desc: 'B2C Commerce admin extension that verifies keypairs safely during DKIM, mTLS, and signing setup',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'pushed' },
    name: 'sh',
    repo: 'j-256/sh',
    desc: 'Tested, documented shell utilities that run directly from toolio.sh or install with one command',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'pushed' },
    name: 'p12-generator',
    repo: 'j-256/p12-generator',
    desc: 'In-browser certificate issuer and PKCS#12 packager for B2C Commerce; private keys never leave the tab',
  },
  {
    perms: '-rwxr-xr-x',
    owner: 'jklein',
    meta: { source: 'tag' },
    name: 'rover-dumper',
    repo: 'j-256/rover-dumper',
    desc: "Bookmarklet that paginates Rover's internal API and downloads every pet photo at full quality in one zip",
  },
];
