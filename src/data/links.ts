export interface Link {
  perms: string;
  owner: string;
  group: string;
  name: string;
  /** Full URL the symlink points at. */
  target: string;
}

export const links: Link[] = [
  {
    perms: 'lrwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    name: 'github',
    target: 'https://github.com/j-256',
  },
  {
    perms: 'lrwxr-xr-x',
    owner: 'jklein',
    group: 'staff',
    name: 'linkedin',
    target: 'https://www.linkedin.com/in/james-klein-developer',
  },
];
