import { describe, expect, it } from 'vitest';
import { formatLsRow, formatSymlinkRow } from '../src/lib/format';

describe('formatLsRow', () => {
  it('emits perms, owner and a padded meta column with no name', () => {
    const row = formatLsRow({
      perms: 'drwxr-xr-x',
      owner: 'jklein',
      meta: 'stable',
    });
    expect(row).toBe('drwxr-xr-x  jklein  stable    ');
  });

  it('pads meta to a fixed width so names start at the same column', () => {
    const short = formatLsRow({ perms: '-rwxr-xr-x', owner: 'jklein', meta: 'wip' });
    const long = formatLsRow({ perms: '-rwxr-xr-x', owner: 'jklein', meta: '2026-05-14' });
    expect(short).toHaveLength(long.length);
  });

  it('does not truncate a meta value that exceeds the column width', () => {
    const row = formatLsRow({
      perms: '-rwxr-xr-x',
      owner: 'jklein',
      meta: 'v10.20.30-rc1',
    });
    expect(row).toContain('v10.20.30-rc1');
  });

  it('omits the group column entirely', () => {
    const row = formatLsRow({ perms: 'drwxr-xr-x', owner: 'jklein', meta: 'stable' });
    expect(row).not.toContain('staff');
  });
});

describe('formatSymlinkRow', () => {
  it('emits perms and owner with no name, target or group', () => {
    const row = formatSymlinkRow({ perms: 'lrwxr-xr-x', owner: 'jklein' });
    expect(row).toBe('lrwxr-xr-x  jklein');
  });

  it('omits the group column entirely', () => {
    const row = formatSymlinkRow({ perms: 'lrwxr-xr-x', owner: 'jklein' });
    expect(row).not.toContain('staff');
  });
});
