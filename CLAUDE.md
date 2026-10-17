# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run serve          # dev server (Astro, localhost:4321) with hot-reload
bun run build          # build static site to dist/ (astro build + generate-redirects.mjs)
bun run preview        # preview built dist/ locally
bun run check          # astro check (type checking)

bun run lint           # check formatting (biome)
bun run format         # auto-fix formatting (biome + format-yaml.js)

bun run test           # everything: build, astro check, unit tests, and e2e (mobile-chrome)
bun run test:unit      # unit tests only (vitest run, all of test/*.test.ts — assumes dist/ already built)
bun run test:fast      # lint + test:data in parallel (quick pre-flight)
bun run test:data      # data validation only (fastest, no build)
bun run test:build     # test/build.test.ts only (assumes dist/ already built)
bun run test:structured-data  # test/structured-data.test.ts only (JSON-LD, assumes dist/ already built)
bun run test:ical      # test/ical.test.ts only
bun run test:e2e       # build + Playwright e2e (mobile-chrome)
bun run test:e2e:full  # Playwright e2e only, no rebuild
bun run test:e2e:smoke     # mobile Chrome smoke: site.spec only (no a11y, no rebuild)
bun run test:e2e:desktop   # build + Playwright e2e (desktop-chrome)
bun run test:e2e:all       # build + Playwright e2e (both projects)
bun run test:e2e:a11y          # build + Playwright a11y spec only
bun run test:push          # fast push gate: build + check + unit + e2e:smoke (CI runs a11y + full e2e)
```

Note: `bun test` invokes Bun's own built-in test runner, not the `test`
script above — always use `bun run test` / `bun run <script>` here.

Git hooks (lefthook, shared config pinned from `taraxvoid/voidflow`; install the binary with `mise install`, then `bun install` wires the hooks):

- pre-commit: `bun run format` (auto-fixes and re-stages), lint:actions, type-check, then `bun run test:unit` (excluding `test/build.test.ts` and `test/structured-data.test.ts`, which need a prior build)
- pre-push: syncs with the remote branch first (aborts if the remote is ahead), then runs `bun run test:push` — build + type-check + unit + mobile smoke; a11y + full e2e are CI-only (ci.yml, via the shared `site-ci.yml` workflow in `taraxvoid/voidflow`)

Playwright defaults to the `mobile-chrome` project (`devices['Pixel 7']`) as
the primary e2e target; `desktop-chrome` is opt-in via `test:e2e:desktop`
(or `test:e2e:all` for both). The e2e suite serves the built `dist/` via
`astro preview` on port 4242.

### Commit messages

New commits (hand-written or bot-generated) should follow [Conventional
Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `chore:`,
`docs:`, etc). This is a soft convention, not an enforced one: the
`commit-msg` hook only prints a friendly hint — it never blocks a
commit. History before this convention was adopted is left
as-is, not rewritten.

- `bun run commit` — runs [opencommit](https://github.com/di-sukharev/opencommit)
  (via `bunx`, not a project dependency) to draft a Conventional Commit
  message from the staged diff. Needs `bunx oco config set OCO_AI_PROVIDER=... OCO_API_KEY=...`
  once, locally.
- `bun run changelog` — regenerates `CHANGELOG.md` from git history using
  [git-cliff](https://git-cliff.org) (config: `cliff.toml`), grouped by commit
  type. Commits that don't parse as Conventional Commits are silently
  excluded rather than dumped into an "other" bucket.
- `bun run changelog:unreleased` — prints changelog entries for commits
  since the last tag, without writing the file.

git-cliff is a standalone binary (`brew install git-cliff`), not an npm
package.

## Architecture

Static site built with **Astro**, deployed to Netlify. Content lives as plain YAML edited directly via git. Single layout at `src/layouts/Base.astro`.

### Content model

Directory pages live as plain YAML in `src/content/pages/*.yaml`. Each file is a category (friends, spiritual, art, cafes, music, makers) with an `items` array.

Item fields (see `itemSchema` in `src/content.config.ts`):

- `name` (required string)
- `public: false` — hides from builds
- `vanity_slug` — pins the item's permalink slug (`/<category>/<vanity_slug>`) so it survives renames of `name`; falls back to a slug derived from `name`
- `description` — plain text
- `tags` — array of keys from `src/data/tagMap.json`
- `links` — array of `{ label, url }`
- `notes` — internal notes (not displayed)
- `location` — optional `{ street, city, state, zip, neighborhood, google_maps_url }`
- `recurring_events` — optional array of `{ summary, rrule, dtstart, time, end_time?, duration?, location?, description?, url? }`, feeds the `.ics` calendar

Zod schemas live in `src/content.config.ts`. The `directory` collection uses the glob loader over `*.yaml`. Hand-edited YAML that leaves an optional key empty (e.g. `description:`) parses as `null`; the schema normalizes `null` to `undefined` before validating.

### Routing

- `/` — full directory, all categories shown
- `/[category]` — directory with that category pre-filtered (e.g. `/art`, `/spiritual`)
- `/[category]/[item-slug]` — item permalink within a category
- `/[...].md` — Markdown rendering of the same directory/filter/item routes (for LLM/agent consumption), served by `src/pages/[...filters].md.ts`
- `/contact` — standalone contact form (Netlify Forms)
- `/privacy` — privacy policy
- `/events.ics` — iCal feed generated from `recurring_events` across all items
- `/llms.txt` — llms.txt service doc, advertised via a `Link: </llms.txt>; rel="service-doc"` response header
- `/robots.txt` — includes AI-crawler content-signal directives

All filter/permalink routes (including the `.md` variants) are statically generated from `src/utils/resolveFilters.ts` via `getFilterStaticPaths`. Tags are not routable — tag filtering is client-side JS only, driven by `data-initial-filter` on `<body>` and pill buttons in the layout.

The footer (`src/components/SiteFooter.astro`) holds three `<details>`/`<summary>` accordions on every page: a "Suggestion Box" quick-add form, a "Gay Agenda" calendar preview + subscribe links (Google/Apple, backed by `/events.ics`), and a utility box linking to GitHub, `/privacy`, and `/contact`.

### Data files

- `src/data/tagMap.json` — canonical tag registry (icon + label, optional icon `family` for brand icons)
- `src/data/categoryMap.json` — canonical category registry (icon, label, descriptor) for the six directory categories
- `src/data/site.json` — site-wide config (URL)

### Utils

- `src/utils/resolveFilters.ts` — filter/category/tag resolution shared by the HTML and `.md` route handlers
- `src/utils/itemSlug.ts` — computes item permalink slugs (respects `vanity_slug`)
- `src/utils/slugify.ts` — generic string-to-slug helper
- `src/utils/location.ts` — formats an item's `location` into a display line
- `src/utils/jsonLd.ts` — serializes JSON-LD, escaping `<` to prevent script-tag breakout
- `src/utils/ical.ts` — builds the `.ics` feed from `recurring_events`
- `src/utils/eventsPreview.ts` — computes the footer's upcoming-events preview list

### Components

- `src/layouts/Base.astro` — main layout (HTML shell, nav, footer, filter JS, emoji tooltips)
- `src/components/FilterBar.astro` — category + tag filter pills
- `src/components/ItemCard.astro` — individual `wa-card` entry
- `src/components/EntryTag.astro` — single tag pill/badge
- `src/components/HeadMeta.astro` — `<head>` metadata, including JSON-LD structured data and link-preview (`og:` / `twitter:`) tags. The default share image `public/og-image.png` is committed; regenerate it with `bun run generate:og-image` (`scripts/generate-og-image.ts`, satori + sharp). The `astro-og` dev toolbar app previews cards under `bun run serve`
- `src/components/SiteHeader.astro` / `SiteFooter.astro` — header nav / footer accordions
- `src/components/posthog.astro` — cookieless PostHog analytics snippet

### Tests

- `test/data.test.ts` — validates YAML content structure and tag references
- `test/build.test.ts` — runs `astro build` and checks `dist/` output
- `test/structured-data.test.ts` — validates JSON-LD output from `HeadMeta.astro`
- `test/filter.test.ts`, `test/itemSlug.test.ts`, `test/slugify.test.ts`, `test/location.test.ts`, `test/ical.test.ts`, `test/eventsPreview.test.ts` — unit tests for the corresponding `src/utils/*`
- `test/e2e/site.spec.js` — Playwright tests serving `dist/` on port 4242
- `test/e2e/a11y.spec.js` — Playwright + axe-core accessibility checks
- `test/pages/*.test.ts` — tests for `.ics`, `.md`, `llms.txt`, and `robots.txt` route handlers

Default to using Bun instead of Node.js/NPM.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use `dotenv`.

## Frontend

### Core Principles

- **Vanilla JavaScript Only**: No frontend frameworks. Astro handles rendering and vanilla JS adds minimal interactivity.
- **Progressive Enhancement**: Everything works without JavaScript. Enhance progressively for modern browsers.
- **Accessibility First**: Semantic HTML, keyboard navigation, visible focus states (WCAG 2.1 AA).

### JavaScript/TypeScript Guidelines

Client-side JS/TS lives in `/src/scripts/`. Target specific elements—no global listeners.

```typescript
// Avoid / Don't do
window.onload = init()

// Good
document.querySelectorAll('[data-custom-action]').forEach((btn) => {
  btn.addEventListener('click', handler)
})
```

Prefer state-based attributes when appropriate:

```typescript
// Insufficient
button.classList.add('active')

// Good, communicates button state to screen reading devices
button.setAttribute('aria-pressed', 'true')
```

### CSS Guidelines

- Place global styles in `theme.css`
- Place component-specific styles in the respective Astro component file
  - Styles are automatically scoped per Astro component
- When targeting `:hover`, also target `:focus` and/or `:focus-within` for keyboard navigators
- Target state-based attributes and pseudo-selectors, when relevant, to maintain consistency
```css
.some-button {
  &[aria-pressed="true"] {
    /* Active/pressed style here */
  }
  &:disabled  {
    /* Disabled style here */
  }
}
```
- When adding animations/transitions with motion, only apply it when the user has `prefers-reduced-motion: no-preference`
```css
.some-item {
  @media (prefers-reduced-motion: no-preference) {
    /* motion related styles here */
  }
}
```

#### Additional Recommendations
- Avoid CSS ID selectors
  - Instead, use class selectors
- Do not use the `order` CSS property
  - This creates a disconnect between visual and logical order
  - Instead, move the HTML elements to the intended order instead

### Progressive Enhancement Levels

| Layer                     | Coverage                  | Examples                                       |
| ------------------------- | ------------------------- | ---------------------------------------------- |
| Layer 0 (No-JS)           | Universal                 | All content readable, links work, forms submit |
| Layer 1 (Widely Baseline) | ~95%+ browsers since 2020 | CSS Grid/Flexbox, custom properties, `fetch()` |
| Layer 2 (Newly Baseline)  | Feature-checked           | Container queries, View Transitions API, etc.  |

Filter pills revert to showing all items when JS disabled. Verify by disabling JS in DevTools.

Example feature detection:

```typescript
if (
  'ViewTransition' in document &&
  CSS.supports('container-type', 'inline-size')
) {
  // Apply modern enhancements
} else {
  // Graceful degradation kicks in
}
```

### Accessibility Checklist

- [x] Tab order follows visual flow
- [x] Focus indicators visible (never `outline: none` without replacement)
- [x] Skip-to-main link present
- [x] ARIA live regions only for dynamic updates (aria-live="polite")
- [x] 4.5:1 contrast ratio minimum
- [x] Links distinguishable beyond color alone
