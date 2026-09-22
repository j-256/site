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
- Cloudflare Workers Static Assets with a custom domain
- GitHub Actions for verification and direct deployment

## Setup

The hostname comes from a single `SITE_HOST` environment variable, used everywhere the deployed domain appears (canonical link, OG meta, JSON-LD, sitemap, robots.txt, the generated `public/CNAME`). The build fails loud if it's unset.

```bash
cp .env.example .env       # contains SITE_HOST=jklein.dev
nvm use                    # picks up .nvmrc
npm install
```

## Develop

```bash
npm run dev                # http://localhost:4321 (also writes public/CNAME)
npm test                   # vitest plus the required documentation cover
npm run test:visual        # browser checks against a running server
npm run typecheck          # astro check
npm run build              # write CNAME, fetch project data, then astro build
npm run refresh-project-cache # refresh the committed project fallback
npm run capture:cover      # build locally and refresh the documentation cover
npm run deploy:dry-run     # validate the current dist artifact with Wrangler
```

Install the matching browser with `npx playwright install chromium` before using the cover command. It renders the candidate production build locally at 1440x1000 CSS pixels with 4x pixel density, dark colors, and reduced motion, replaces `docs/screenshots/cover.png` with a 5760x4000 PNG, and synchronizes that image into the built site's self-preview; it does not capture or deploy the live site.

Visual checks use `SITE_URL` to select the running server, defaulting to `http://localhost:4321`. The controlled mouse and ball wake comparison requires Astro's development modules and reports a skip against production builds. The interaction checks run against either server type.

## Ripples

Mouse, pen, and finger movement leave a soft gray wake behind the terminal content, including the nameplate and its controls. The sticky nameplate continues the same water surface while covering content that scrolls underneath. The waves spread, overlap, and fade back to black when movement stops. One-finger touch scrolling stays native, and the canvas never intercepts links, selection, or gestures. The simulation uses a bounded resolution, stops when the surface settles, and clears when the page is hidden.

The first paddle return in Pong gradually hands the water from the cursor to the ball. Both sources use the same water surface, trail density, and short decay. The ball varies the width and pressure of its circular disturbance along its path, leaving a connected wake with soft, curved edges and small pulses at paddle and wall impacts. Pausing lets the water settle, and new serves begin a fresh trail. Sleep and dismissal return ripple control to the cursor; waking or restoring a revealed game hands it back to the ball. The gray palette stays the same throughout.

Ripples follow the same motion preference as the boot transcript and Pong: reduced motion disables them by default, `?animate=1` enables them for a preview, and `?animate=0` disables them explicitly.

## Pong

The low-contrast background court rests behind the page without a ball. Sustained mouse movement for 1.2 seconds spawns the ball and starts play with both paddles on the ball's subdued background layer; brief or interrupted movement leaves the court dormant. `P` skips that discovery delay and reveals the game paused; Escape skips it and starts play immediately. On a touchscreen, placing one thumb on each half of the viewport starts or resumes play immediately, with one thumb controlling each paddle. Lifting either thumb pauses the game. Pong claims scrolling and pinch gestures only while that two-thumb control is active, so ordinary one-finger browsing never activates or controls it. The ball disappears completely behind foreground text until a player returns it with a paddle. Each of the first four paddle returns permanently raises the foreground brightness of the ball and both paddles through 20%, 40%, 60%, and 80% opacity; later returns remain at the final stage. The first return also types the score into the boot prompt, reveals compact Escape and `P` hints in the desktop header, and briefly emphasizes the ball above its settled brightness. Each paddle return slightly accelerates the ball for the rest of the rally, up to a cap, and each goal resets the next serve to its base speed. The brightness stage persists across later points, pause and resume, inactivity sleep and wake, and Escape dismissal and restoration. The prompt clears and retypes the score after each goal. Mouse movement controls the paddle on its half of the viewport, `W` and `S` control the left paddle, and Arrow Up and Arrow Down control the right paddle. `P` freezes or resumes the ball and paddles. Escape hides the game; a second Escape restores whether it was running or paused. The desktop hints follow the score's visibility while Pong is paused, sleeping, dismissed, or restored. After eight seconds without player input, the game sleeps behind the dormant court; the next mouse movement, paddle key, two-thumb touch, or Escape restores it. Other game input is ignored while it is dismissed. Foreground links, text selection, and scrolling remain the primary interface.

A present `animate` query parameter forces the boot transcript, ripples, and Pong to animate despite a reduced-motion preference, including bare `?animate`, `?animate=1`, and `?animate=true`. `?animate=0` or `?animate=false` forces these animations off. Only an absent parameter defers to the system preference. With system motion reduction active, the dormant court stays static until Escape opts the loaded page into motion and starts Pong immediately; `P` then pauses or resumes normal play. Escape does not override the explicit disable query values. The override is entirely client-side and the deployment remains static.

## Deployment

GitHub Actions owns the production pipeline. Every push to `main`, weekly refresh, and manual workflow run installs the locked dependencies, runs the tests, fetches current project descriptions and covers, refreshes the site's own cover, and deploys the resulting `dist` directory to the `site` Cloudflare Worker through Wrangler. The build log and job summary identify each repository whose version/date, description, or cover changed relative to the prior deployed release. The refreshed site cover is also committed when it changed; that workflow-authored push does not start another workflow run. Pull requests perform the same tests and production build with read-only repository access, without capturing, committing, or deploying.

Run a release manually from the Actions tab or with `gh workflow run deploy.yml --repo j-256/site`. The deploy step receives `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from repository Actions secrets; `wrangler.jsonc` contains only non-secret deployment configuration.

`npm run deploy` publishes the existing `dist` directory and assumes it has already been verified. Use `npm run deploy:dry-run` to validate the artifact and configuration without publishing.

## Hostname change procedure

1. Update `.env` locally.
2. Update the GitHub repo Variable: `gh variable set SITE_HOST --body 'newhost.example' --repo j-256/site`
3. Update the Worker's custom domain and its DNS record in Cloudflare.
4. Push. GitHub Actions rebuilds with the new value and deploys the verified artifact.

## Projects

`src/data/projects.ts` contains the site's explicitly ordered initial and disclosed project inventories, with only site-specific display choices in either tier. At build time, `scripts/fetch-projects.ts` verifies each repository is public and active, derives its name, owner, description, URL, and default-branch revision from GitHub, then fetches `docs/screenshots/cover.png` at that exact revision. Missing, malformed, oversized, or unverifiable covers fail the build. Local fetches use `GITHUB_TOKEN`, then `GH_TOKEN`, then the authenticated GitHub CLI session; without a credential, requests remain anonymous and are subject to GitHub's lower rate limit.

The terminal project rows remain the primary interface. The initial inventory renders immediately, while the additional inventory sits behind a native disclosure whose control remains below the sticky header while its rows scroll. Collapsing from within the additional inventory returns to the disclosure boundary. The header always offers a links shortcut, then types in a top shortcut once the header sticks. On fine-pointer devices, dwelling on a compact entry line fills a progress bar before opening a non-interactive terminal-framed cover preview. The preview preserves the screenshot's proportions and fits within 90% of the viewport width and 85% of its height. The description and padded click target do not trigger it, pointer focus does not pin it open, and Escape hides it. Keyboard focus uses the same dwell.

Every project offers a separate `[preview]` button on desktop and touch layouts. It opens a modal screenshot viewer with mouse-wheel or pinch zoom, drag to pan, zoom buttons, and `[fit]` to restore the full image. Wheel zoom preserves the image point beneath the pointer. The `+` and `-` keys zoom, and `0` restores the fitted view; the percentage is relative to that fit. Zoom stays inside the image area so `[close]` remains reachable. Closing the viewer, including with Escape, returns focus and scroll position to the project list. Viewer gestures do not control the background game. Covers load on demand; a failed load explains how to retry. The project link still opens its repository directly, and remains available without JavaScript.

Project covers are copied without resizing or recompression. Desktop hover previews stop at the source image's pixel width to avoid enlarging small covers automatically. Their source repositories own capture quality: browser captures should keep the intended CSS viewport and render at 4x pixel density to provide detail for high-density displays and zooming. Increasing the viewport alone changes the page layout instead of adding detail to the same view. Required source width is the displayed CSS width multiplied by the display's pixel ratio and the viewer's zoom factor. Higher capture density preserves detail but does not increase the apparent text size; use tighter framing and the viewer to inspect dense interfaces. Native device screenshots may have a fixed source resolution. Regenerate covers from their original application rather than enlarging the PNG, and judge small-text readability on the actual display as well as checking pixel dimensions.

Routine development and builds write fetched display data to the ignored `src/data/project-data.runtime.json`, so starting the site does not modify tracked files. `src/data/project-data.cache.json` is the committed fallback snapshot used when runtime data is unavailable. Whichever data file is loaded supplies fallback values when an individual metadata lookup fails. Run `npm run refresh-project-cache` when a verified result should replace the committed snapshot. Neither data file can make a repository or cover publishable: visibility and the revision-bound cover are verified on every fetch. Generated project images and the release comparison manifest live under the ignored `public/project-assets/`; the deployed manifest becomes the next release's comparison baseline, with the committed cache as a fallback. Set `PROJECT_REPOSITORY_ROOT` to a directory of local Git checkouts to read each committed cover locally while still verifying repository state and display metadata with GitHub.

## License

[MIT](LICENSE).
