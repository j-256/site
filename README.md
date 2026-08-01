# site

```
   _ _    _      _            _
  (_) |  | |    (_)          | |
   _| | _| | ___ _ _ __    __| | _____   __
  | | |/ / |/ _ \ | '_ \  / _` |/ _ \ \ / /
  | |   <| |  __/ | | | || (_| |  __/\ V /
  | |_|\_\_|\___|_|_| |_(_)__,_|\___| \_/
 _/ |
|__/
```

Source for [jklein.dev](https://jklein.dev/).

## Stack

- [Astro](https://astro.build/) (static)
- TypeScript (strict)
- Vanilla CSS, [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (self-hosted, OFL)
- GitHub Pages (custom domain via generated `public/CNAME`, Cloudflare CNAME flattening at the apex)
- GitHub Actions for build + deploy

## Setup

The hostname comes from a single `SITE_HOST` environment variable, used everywhere
the deployed domain appears (canonical link, OG meta, JSON-LD, sitemap, robots.txt,
the generated `public/CNAME`). The build fails loud if it's unset.

```bash
cp .env.example .env       # contains SITE_HOST=jklein.dev
nvm use                    # picks up .nvmrc
npm install
```

## Develop

```bash
npm run dev                # http://localhost:4321 (also writes public/CNAME)
npm test                   # vitest
npm run typecheck          # astro check
npm run build              # write CNAME, fetch GitHub metadata, then astro build
```

## Hostname change procedure

1. Update `.env` locally.
2. Update the GitHub repo Variable: `gh variable set SITE_HOST --body 'newhost.example' --repo j-256/site`
3. Update DNS at Cloudflare (apex CNAME flatten to `j-256.github.io`).
4. Push. CI rebuilds with the new value, deploys, GitHub Pages claims the new domain.

## Project metadata

The "ls -l" projects list reads metadata from `src/data/repo-meta.cache.json`,
populated at build time by `scripts/fetch-repo-meta.ts`. Each project entry in
`src/data/projects.ts` chooses its own metadata source: a hand-set string,
GitHub `pushed_at`, or the latest release tag. The cache is committed so builds
work offline and survive API outages, with a 7-day staleness fence that fails
the build if a fetch can't be refreshed within that window.

## License

[MIT](LICENSE).
