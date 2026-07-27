export interface Link {
  perms: string;
  owner: string;
  name: string;
  /** Full URL the symlink points at. */
  target: string;
}

export const links: Link[] = [
  {
    perms: 'lrwxr-xr-x',
    owner: 'jklein',
    name: 'github',
    target: 'https://github.com/j-256',
  },
  {
    perms: 'lrwxr-xr-x',
    owner: 'jklein',
    name: 'linkedin',
    target: 'https://www.linkedin.com/in/james-klein-developer',
  },
];
