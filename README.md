# queeromaha.net

[![Netlify Status](https://api.netlify.com/api/v1/badges/eb46506c-ce32-4485-ae05-ae4872ac953c/deploy-status)](https://app.netlify.com/projects/queeromaha/deploys) (until the Cloudflare cutover)

![trans rights](https://pride-badges.pony.workers.dev/static/v1?label=trans%20rights&stripeWidth=6&stripeColors=5BCEFA,F5A9B8,FFFFFF,F5A9B8,5BCEFA)


Directory of queer/trans groups, venues and spaces in Omaha.

## Requirements

- \*nix
- [Bun](https://bun.sh/) as drop-in Node interpreter replacement, package manager and test runner
- (optional) [mise](https://mise.jdx.dev/) for node ver wrangling (see `mise.toml`)

## Stack

- [Astro](https://astro.build/) for static site generation and light SSE
- [Biome](https://biomejs.dev/) for lint
- [Playwright](https://playwright.dev/) for mobile and desktop browser testing
- [vitest](https://vitest.dev/) for unit tests

## Local Development

### Dependencies

```
# install JS deps
bun install --development

(optional) To run e2e tests
bunx playwright install --with-deps
```

### Running locally

```
# start local astro server w/ HMR at localhost:4321
bun run dev
```

## Deployment

Hosting is moving from Netlify to Cloudflare Workers ([#367](https://github.com/queeromaha/queeromaha.net/issues/367)) as a blue/green cutover:

- **Green:** a Worker on [queeromaha.dev](https://queeromaha.dev) serving `dist/` as static assets, Worker `queeromaha-net`, deployed with [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (`wrangler.jsonc`). The Worker (`worker/`) handles the contact and Suggestion Box form POSTs (emailed through Cloudflare Email Routing) and `Accept: text/markdown` negotiation.
- **Blue:** Netlify keeps serving queeromaha.net (`netlify.toml`, `netlify/`) until cutover.

Both serve the same build, which keeps `https://queeromaha.net` as its canonical URL.

### Via CI

`.github/workflows/ci.yml` validates with voidflow's `site-ci.yml`, then:

- pushes to `main` deploy the Worker to production (GitHub environment `prod`)
- non-draft pull requests get a Worker Preview named `pr-<number>`, linked in a PR comment and deleted when the PR closes (GitHub environment `preview`)

Deploy tokens are scoped per Worker and minted by voidflow's `cf-tokens` from the fleet config in `taraxvoid/infra` (`cf-tokens.ts`): `prod` gets an environment secret `CLOUDFLARE_API_TOKEN`, Previews a repository secret of the same name. Both need a `CLOUDFLARE_ACCOUNT_ID` variable; `prod` also needs a `FORMS_TO` secret (the verified Email Routing address that form submissions go to). The Netlify GitHub app still deploys queeromaha.net and its own PR previews.

### Manually

```
# authenticate (or set CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID)
bunx wrangler login

# build the site (dist/, which the Worker serves as assets)
bun run build

# run the Worker locally against dist/
bun run preview:worker

# validate, then deploy production
bun run deploy:dry-run
bun run deploy
```

### Lint and Tests

Pull Requests must pass lint and include relevant unit/end-to-end tests. 

Accessibility for motion-sensitivity, color, fonts, reduced scrolling, tapping affordances, "go to top" are table stakes.

This project uses [lefthook](https://lefthook.dev) git hooks (shared config from `taraxvoid/voidflow`) to automatically lint and test on pre-commit and pre-push. `mise install` provides the binary and `bun install` wires the hooks.

Upgrading from the old Husky setup? Run `git config --unset core.hooksPath && lefthook install` once.

You can run lint (via biome) manually

```
bun run lint # check formatting
bun run format # auto-fix formatting
```

You must add/update unit tests for code changes. 

End-to-end tests are strongly recommended for commits that touch the frontend.

```
bun run test:unit # vitest
bun run test:e2e # Playwright mobile/ desktop browsers
bun run test:e2e:a11y # Accessibility via axe
bun run test:lighthouse # Lighthouse audit (SEO, perf)
```

## Conventional Commits & Changelog

This project follows [Conventional Commits](https://www.conventionalcommits.org) for all new commits.

### Format

```
<type>[optional scope]: <short description>

[optional body]

[optional footer(s)]
```

Common types used here:

| Type | When to use |
|---|---|
| `feat` | New feature or content addition |
| `fix` | Bug fix |
| `chore` | Maintenance, deps, config (no production change) |
| `docs` | Documentation only |
| `refactor` | Code restructure, no behavior change |
| `style` | Formatting, whitespace |
| `test` | Adding or updating tests |
| `perf` | Performance improvement |
| `ci` | CI/CD config |
| `revert` | Reverting a previous commit |

Examples:

```
feat(ical): add end_time support to recurring events
fix: correct slug collision on renamed items
chore(deps): bump astro to 5.x
docs: document git-cliff setup in README
```

### Enforcement

The `commit-msg` hook checks every commit message against this format. It is **advisory only** - it prints a friendly hint but never blocks a commit. History before this convention was adopted is left as-is.

### AI-assisted commit messages

`bun run commit` runs [opencommit](https://github.com/di-sukharev/opencommit) (`bunx oco`) to draft a Conventional Commit message from the staged diff. One-time setup:

```bash
bunx oco config set OCO_AI_PROVIDER=<provider> OCO_API_KEY=<key>
```

### Changelog (git-cliff)

The changelog is generated from git history by [git-cliff](https://git-cliff.org), configured in `cliff.toml`. Commits that don't parse as Conventional Commits are silently excluded.

**Install git-cliff** (standalone binary, not an npm package):

```bash
brew install git-cliff
```

**Regenerate `CHANGELOG.md`** from the full git history:

```bash
bun run changelog
```

**Preview unreleased entries** (commits since the last tag, no file write):

```bash
bun run changelog:unreleased
```

**How `cliff.toml` works:**

- `conventional_commits = true` - parses the standard `type(scope): message` format
- `filter_unconventional = true` - silently drops non-conventional commits instead of erroring
- `commit_parsers` - maps types to emoji-prefixed groups (Features, Bug Fixes, etc.) and sets sort order via `<!-- N -->` prefixes
- `commit_preprocessors` - rewrites `(#123)` issue references into GitHub links
- `postprocessors` - replaces the `<REPO>` placeholder with the actual GitHub URL
- `topo_order_commits = true` - orders commits topologically within each release

#### Link Checker

`bun run check:links` parses the built `dist/` HTML and markdown for external
links, tests them against the live web, and reports failures. It runs in CI on
every PR and weekly via the [Check Links workflow](.github/workflows/check-links.yml).

Run it locally:

```
bun run build && bun run check:links
```
