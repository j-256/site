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

![Terminal project listing on jklein.dev](docs/screenshots/cover.png)

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
npm test                   # vitest plus the required documentation cover
npm run typecheck          # astro check
npm run build              # write CNAME, fetch project data, then astro build
```

## Hostname change procedure

1. Update `.env` locally.
2. Update the GitHub repo Variable: `gh variable set SITE_HOST --body 'newhost.example' --repo j-256/site`
3. Update DNS at Cloudflare (apex CNAME flatten to `j-256.github.io`).
4. Push. CI rebuilds with the new value, deploys, GitHub Pages claims the new domain.

## Projects

`src/data/projects.ts` is the site's ordered list and contains only site-specific display choices. At build time, `scripts/fetch-projects.ts` verifies each repository is public and active, derives its name, owner, description, URL, and default-branch revision from GitHub, then fetches `docs/screenshots/cover.png` at that exact revision. Missing, malformed, oversized, or unverifiable covers fail the build. Local fetches use `GITHUB_TOKEN`, then `GH_TOKEN`, then the authenticated GitHub CLI session; without a credential, requests remain anonymous and are subject to GitHub's lower rate limit.

The terminal project rows remain the primary interface. On fine-pointer devices, dwelling on the compact entry line fills a progress bar before opening a non-interactive terminal-framed cover preview. The description and padded click target do not trigger it, pointer focus does not pin it open, and Escape hides it. Keyboard focus uses the same dwell; touch layouts retain the terminal list without a preview.

The generated project images live under `public/project-assets/` and are ignored. `src/data/project-data.cache.json` keeps the last fetched display data and metadata values, but it cannot make a repository or cover publishable: visibility and the revision-bound cover are verified on every build. Set `PROJECT_REPOSITORY_ROOT` to a directory of local Git checkouts to read each committed cover locally while still verifying repository state and display metadata with GitHub.

## License

[MIT](LICENSE).
