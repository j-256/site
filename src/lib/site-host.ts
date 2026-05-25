function readSiteHost(): string | undefined {
  const fromProcess = typeof process !== 'undefined' ? process.env?.SITE_HOST : undefined;
  const fromImportMeta = (import.meta as { env?: Record<string, string | undefined> }).env?.SITE_HOST;
  return (fromProcess ?? fromImportMeta)?.trim() || undefined;
}

export function siteHost(): string {
  const host = readSiteHost();
  if (!host) {
    throw new Error('SITE_HOST environment variable is required but not set');
  }
  return host;
}

export function siteUrl(): string {
  return `https://${siteHost()}/`;
}
