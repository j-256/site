export interface LsRow {
  perms: string;
  owner: string;
  group: string;
  meta: string;
  name: string;
  desc: string;
}

const META_WIDTH = 10;
const NAME_WIDTH = 18;

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

export function formatLsRow(row: LsRow): string {
  const meta = pad(row.meta, META_WIDTH);
  const name = pad(row.name, NAME_WIDTH);
  return `${row.perms}  ${row.owner}  ${row.group}  ${meta}  ${name}  ${row.desc}`;
}
