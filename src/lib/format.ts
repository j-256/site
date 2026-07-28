export interface LsRow {
  perms: string;
  owner: string;
  meta: string;
}

export const META_WIDTH = 10;
const ELLIPSIS = '\u2026';

// Fits a value to a fixed column width: pads short values with spaces and
// clips over-width values to width-1 plus an ellipsis, so an oversized value
// stays inside the column instead of pushing the following fields out of line
export function fitMeta(value: string, width: number): string {
  if (value.length === width) return value;
  if (value.length < width) return value + ' '.repeat(width - value.length);
  return value.slice(0, width - 1) + ELLIPSIS;
}

export function formatLsRow(row: LsRow): string {
  return `${row.perms}  ${row.owner}  ${fitMeta(row.meta, META_WIDTH)}`;
}

export interface SymlinkRow {
  perms: string;
  owner: string;
}

export function formatSymlinkRow(row: SymlinkRow): string {
  return `${row.perms}  ${row.owner}`;
}
