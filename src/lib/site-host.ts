export function siteHost(): string {
  const host = process.env.SITE_HOST?.trim();
  if (!host) {
    throw new Error('SITE_HOST environment variable is required but not set');
  }
  return host;
}

export function siteUrl(): string {
  return `https://${siteHost()}/`;
}
