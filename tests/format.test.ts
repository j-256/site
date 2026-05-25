import { describe, expect, it } from 'vitest';
import { formatLsRow, formatSymlinkRow } from '../src/lib/format';

describe('formatLsRow', () => {
  it('formats a project row with all columns aligned', () => {
    const row = formatLsRow({
      perms: 'drwxr-xr-x',
      owner: 'jklein',
      group: 'staff',
      meta: 'stable',
      name: 'rover-dumper',
      desc: 'Bookmarklet: bulk-download Rover.com pet photos',
    });
    expect(row).toBe(
      'drwxr-xr-x  jklein  staff  stable      rover-dumper        Bookmarklet: bulk-download Rover.com pet photos'
    );
  });

  it('right-pads short meta values to a consistent width', () => {
    const row = formatLsRow({
      perms: '-rwxr-xr-x',
      owner: 'jklein',
      group: 'staff',
      meta: 'wip',
      name: 'sh',
      desc: 'Shell script library',
    });
    expect(row).toMatch(/wip {9}sh/);
  });

  it('right-pads short names to a consistent width so descriptions align', () => {
    const row = formatLsRow({
      perms: 'drwxr-xr-x',
      owner: 'jklein',
      group: 'staff',
      meta: '2026-05-18',
      name: 'sh',
      desc: 'Shell script library',
    });
    expect(row).toMatch(/sh {18}Shell/);
  });
});

describe('formatSymlinkRow', () => {
  it('formats a symlink with no meta column and a 10-wide name', () => {
    const row = formatSymlinkRow({
      perms: 'lrwxr-xr-x',
      owner: 'jklein',
      group: 'staff',
      name: 'github',
      target: 'github.com/j-256',
    });
    expect(row).toBe(
      'lrwxr-xr-x  jklein  staff  github      -> github.com/j-256'
    );
  });

  it('does not pad names that exceed the symlink name width', () => {
    const row = formatSymlinkRow({
      perms: 'lrwxr-xr-x',
      owner: 'jklein',
      group: 'staff',
      name: 'really-long-link-name',
      target: 'example.com',
    });
    expect(row).toMatch(/really-long-link-name  -> example/);
  });
});
