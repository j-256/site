import { describe, expect, it } from 'vitest';
import { formatLsRow } from '../src/lib/format';

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

  it('formats a symlink row with arrow', () => {
    const row = formatLsRow({
      perms: 'lrwxr-xr-x',
      owner: 'jklein',
      group: 'staff',
      meta: '',
      name: 'github',
      desc: '-> github.com/j-256',
    });
    expect(row).toBe(
      'lrwxr-xr-x  jklein  staff              github              -> github.com/j-256'
    );
  });
});
