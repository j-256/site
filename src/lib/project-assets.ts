export const PROJECT_COVER_PATH = 'docs/screenshots/cover.png';
export const PROJECT_SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
export const PROJECT_ASSET_DIRECTORY = 'project-assets';

export interface ProjectCoverDimensions {
  width: number;
  height: number;
}

const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;
const PNG_SIGNATURE = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR = Object.freeze([0x49, 0x48, 0x44, 0x52]);

function matches(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000
    + bytes[offset + 1] * 0x10000
    + bytes[offset + 2] * 0x100
    + bytes[offset + 3]
  );
}

export function assertProjectRepository(repository: string): void {
  if (!REPOSITORY_PATTERN.test(repository)) {
    throw new Error(`invalid project repository: ${repository}`);
  }
}

export function assertProjectCoverImage(
  bytes: Uint8Array,
  options: { declaredSize?: number; contentType?: string | null } = {}
): ProjectCoverDimensions {
  if (bytes.length === 0) throw new Error(`${PROJECT_COVER_PATH} is empty`);
  if (bytes.length > PROJECT_SCREENSHOT_MAX_BYTES) {
    throw new Error(`${PROJECT_COVER_PATH} exceeds the screenshot size limit`);
  }
  if (options.declaredSize !== undefined && options.declaredSize !== bytes.length) {
    throw new Error(`${PROJECT_COVER_PATH} changed during fetch`);
  }
  if (bytes.length < 24 || !matches(bytes, 0, PNG_SIGNATURE) || !matches(bytes, 12, IHDR)) {
    throw new Error(`${PROJECT_COVER_PATH} is not a PNG image`);
  }
  const width = readUint32(bytes, 16);
  const height = readUint32(bytes, 20);
  if (width === 0 || height === 0) {
    throw new Error(`${PROJECT_COVER_PATH} has invalid dimensions`);
  }
  const contentType = options.contentType?.split(';', 1)[0].trim().toLowerCase();
  if (contentType && contentType !== 'image/png' && contentType !== 'application/octet-stream') {
    throw new Error(`${PROJECT_COVER_PATH} returned unsupported content type ${contentType}`);
  }
  return { width, height };
}

export function projectCoverAssetPath(repository: string): string {
  assertProjectRepository(repository);
  return `${PROJECT_ASSET_DIRECTORY}/${repository}/cover.png`;
}
