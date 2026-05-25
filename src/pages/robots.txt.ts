import type { APIRoute } from 'astro';
import { siteHost } from '../lib/site-host';

export const GET: APIRoute = () => {
  const body = `User-agent: *\nAllow: /\n\nSitemap: https://${siteHost()}/sitemap.xml\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain' },
  });
};
