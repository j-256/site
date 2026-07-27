export interface LsRow {
  perms: string;
  owner: string;
  meta: string;
}

const META_WIDTH = 10;

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

export function formatLsRow(row: LsRow): string {
  return `${row.perms}  ${row.owner}  ${pad(row.meta, META_WIDTH)}`;
}

export interface SymlinkRow {
  perms: string;
  owner: string;
}

export function formatSymlinkRow(row: SymlinkRow): string {
  return `${row.perms}  ${row.owner}`;
}
