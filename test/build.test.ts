import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

describe('link preview meta', () => {
    const distDir = join(ROOT, 'dist')
    const imageUrl = 'https://queeromaha.net/og-image.png'
    const meta = (html: string, attr: string, key: string) =>
        html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1]

    test.each(['index.html', 'art/index.html', 'contact/index.html'])(
        '%s has og:image and twitter card tags',
        (page) => {
            const html = readFileSync(join(distDir, page), 'utf8')
            expect(meta(html, 'property', 'og:image')).toBe(imageUrl)
            expect(meta(html, 'property', 'og:image:width')).toBe('1200')
            expect(meta(html, 'property', 'og:image:height')).toBe('630')
            expect(meta(html, 'property', 'og:image:type')).toBe('image/png')
            expect(meta(html, 'property', 'og:image:alt')).toBeTruthy()
            expect(meta(html, 'name', 'twitter:card')).toBe(
                'summary_large_image',
            )
            expect(meta(html, 'name', 'twitter:image')).toBe(imageUrl)
            expect(meta(html, 'name', 'twitter:image:alt')).toBeTruthy()
            expect(meta(html, 'name', 'twitter:title')).toBe(
                meta(html, 'property', 'og:title'),
            )
        },
    )

    test('item permalinks have og:image', () => {
        const dir = join(distDir, 'art')
        const slug = readdirSync(dir, { withFileTypes: true }).find((d) =>
            d.isDirectory(),
        )?.name
        expect(slug, 'no item permalink under dist/art').toBeDefined()
        const html = readFileSync(join(dir, `${slug}`, 'index.html'), 'utf8')
        expect(meta(html, 'property', 'og:image')).toBe(imageUrl)
    })

    test('og-image.png is a 1200x630 PNG', () => {
        const buf = readFileSync(join(distDir, 'og-image.png'))
        expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
        expect(buf.readUInt32BE(16)).toBe(1200)
        expect(buf.readUInt32BE(20)).toBe(630)
    })
})

describe('astro build', () => {
    test('produces dist/', () => {
        const distDir = join(ROOT, 'dist')
        expect(
            existsSync(distDir),
            'dist/ not found — run `bun run build` before this test',
        ).toBe(true)
        expect(readdirSync(distDir).length).toBeGreaterThan(0)
    })

    test('dist contains index and filter slug pages', () => {
        const distDir = join(ROOT, 'dist')
        for (const file of [
            'art/index.html',
            'cafes/index.html',
            'music/index.html',
            'makers/index.html',
            'friends/index.html',
            'spiritual/index.html',
            'robots.txt',
            'sitemap.xml',
            'llms.txt',
            '_headers',
            '404.html',
            'privacy/index.html',
            'contact/index.html',
        ]) {
            expect(existsSync(join(distDir, file)), `missing: ${file}`).toBe(
                true,
            )
        }
    })

    test('dist does not contain an about page', () => {
        const distDir = join(ROOT, 'dist')
        expect(existsSync(join(distDir, 'about', 'index.html'))).toBe(false)
    })

    test('404.html contains a link back to the directory', () => {
        const html = readFileSync(join(ROOT, 'dist', '404.html'), 'utf8')
        expect(html).toContain('data-notfound-link')
        expect(html).toContain('href="/friends"')
    })

    test('_redirects has legacy redirects', () => {
        const redirects = readFileSync(
            join(ROOT, 'public', '_redirects'),
            'utf8',
        )
        expect(redirects).toMatch(/^\/\s+\/friends/m)
        expect(redirects).toMatch(/\/social\s+\/friends/)
        expect(redirects).toMatch(/\/community\s+\/friends/)
    })

    test('privacy/index.html has a back-to-directory link', () => {
        const html = readFileSync(
            join(ROOT, 'dist', 'privacy', 'index.html'),
            'utf8',
        )
        expect(html).toContain('back-link')
        expect(html).toContain('href="/friends"')
    })

    test('contact/index.html has a Netlify form and a back-to-directory link', () => {
        const html = readFileSync(
            join(ROOT, 'dist', 'contact', 'index.html'),
            'utf8',
        )
        expect(html).toContain('name="contact"')
        expect(html).toContain('data-netlify="true"')
        expect(html).toContain('back-link')
        expect(html).toContain('href="/friends"')
    })

    test('llms.txt lists the privacy and contact pages', () => {
        const llmsTxt = readFileSync(join(ROOT, 'dist', 'llms.txt'), 'utf8')
        expect(llmsTxt).toContain('/privacy')
        expect(llmsTxt).toContain('/contact')
    })

    test('dist/_redirects redirects the OmahaForUs auto-slug to its vanity_slug', () => {
        const redirects = readFileSync(join(ROOT, 'dist', '_redirects'), 'utf8')
        expect(redirects).toMatch(
            /\/friends\/omaha-for-us\s+\/friends\/o4us\s+301/,
        )
    })

    test('dist contains the OmahaForUs item permalink page', () => {
        const itemPage = join(ROOT, 'dist', 'friends', 'o4us', 'index.html')
        expect(existsSync(itemPage)).toBe(true)
        const html = readFileSync(itemPage, 'utf8')
        expect(html).toContain('data-initial-item-slug="o4us"')
        expect(html).toContain('id="friends-o4us"')
    })

    // robots.txt / llms.txt content details (bot allowlist, content-signal,
    // title/URL fields) are unit tested directly against their route
    // handlers in test/pages/robots-txt.test.ts and llms-txt.test.ts; this
    // file only needs to confirm the build actually emits them (above).

    test('_header has appropriate fields', () => {
        const headers = readFileSync(join(ROOT, 'public', '_headers'), 'utf8')
        expect(headers).toContain('sitemap.xml')
        expect(headers).toContain('llms.txt')
        expect(headers).toContain('service-doc')
    })

    test('friends/index.html contains filter pills and wa-card items', () => {
        const html = readFileSync(
            join(ROOT, 'dist', 'friends', 'index.html'),
            'utf8',
        )
        expect(html).toContain('filter-pill')
        expect(html).toContain('wa-card')
        expect(html).toContain('data-category')
    })

    test('friends/index.html has data-initial-categories="friends"', () => {
        const html = readFileSync(
            join(ROOT, 'dist', 'friends', 'index.html'),
            'utf8',
        )
        expect(html).toContain('data-initial-categories="friends"')
    })

    test('category pages only ship their own category cards', () => {
        const html = readFileSync(
            join(ROOT, 'dist', 'cafes', 'index.html'),
            'utf8',
        )
        const categories = new Set(
            [...html.matchAll(/data-category="([^"]+)"/g)].map((m) => m[1]),
        )
        expect([...categories]).toEqual(['cafes'])
    })

    test('dist contains events.ics', () => {
        expect(existsSync(join(ROOT, 'dist', 'events.ics'))).toBe(true)
    })

    test('events.ics is a valid VCALENDAR', () => {
        const ics = readFileSync(join(ROOT, 'dist', 'events.ics'), 'utf8')
        expect(ics).toContain('BEGIN:VCALENDAR')
        expect(ics).toContain('END:VCALENDAR')
        expect(ics).toContain('VERSION:2.0')
        expect(ics).toContain('X-WR-CALNAME:Queer Omaha Events')
    })

    test('events.ics contains seeded OmahaForUs recurring events', () => {
        const ics = readFileSync(join(ROOT, 'dist', 'events.ics'), 'utf8')
        expect(ics).toContain('RRULE:')
        expect(ics).toContain('Support Group')
        expect(ics).toContain('Game Night')
    })

    test('friends/index.html contains footer calendar subscribe link', () => {
        const html = readFileSync(
            join(ROOT, 'dist', 'friends', 'index.html'),
            'utf8',
        )
        expect(html).toContain('calendar.google.com')
        expect(html).toContain('calendar-box')
        expect(html).toContain('webcal://queeromaha.net/events.ics')
    })

    test('friends/index.html has calendar autodiscovery link', () => {
        const html = readFileSync(
            join(ROOT, 'dist', 'friends', 'index.html'),
            'utf8',
        )
        expect(html).toContain('rel="alternate"')
        expect(html).toContain('type="text/calendar"')
        expect(html).toContain('/events.ics')
    })

    test('dist contains markdown counterparts for the root, category, and item pages', () => {
        const distDir = join(ROOT, 'dist')
        for (const file of ['.md', 'friends.md', 'friends/o4us.md']) {
            expect(existsSync(join(distDir, file)), `missing: ${file}`).toBe(
                true,
            )
        }
    })

    test('friends/index.html contains an ItemList JSON-LD tying the visible items together', () => {
        const html = readFileSync(
            join(ROOT, 'dist', 'friends', 'index.html'),
            'utf8',
        )
        expect(html).toContain('"@type":"ItemList"')
        expect(html).toContain('https://queeromaha.net/friends/o4us')
    })

    // Critical font preload hrefs are hardcoded in HeadMeta.astro with
    // content-hashed filenames (see the comment there). These asserts keep
    // the hardcoded hashes in sync with the build output: a font version bump
    // that rotates a hash fails here instead of leaking a 404 preload request.
    const criticalFonts = [
        'karla-latin-wght-normal.C3-ma4ov.woff2',
        'space-grotesk-latin-wght-normal.BhU9QXUp.woff2',
    ]
    for (const name of criticalFonts) {
        test(`dist/_astro contains the preloaded critical font "${name}"`, () => {
            expect(
                existsSync(join(ROOT, 'dist', '_astro', name)),
                `missing preloaded font: ${name}`,
            ).toBe(true)
        })
    }

    test('friends/index.html preloads the critical body and display fonts', () => {
        const html = readFileSync(
            join(ROOT, 'dist', 'friends', 'index.html'),
            'utf8',
        )
        for (const name of criticalFonts) {
            // Grab the whole <link ...> tag for this preload target so we can
            // inspect its attributes individually (the page also contains a
            // preconnect link that *does* use crossorigin, so we can't assert
            // on the HTML as a whole).
            const match = html.match(
                new RegExp(`<link[^>]*rel="preload"[^>]*${name}[^>]*>`),
            )
            expect(match, `preload <link> for ${name} not found`).toBeTruthy()
            const tag = match?.[0]
            expect(tag).toContain('rel="preload"')
            expect(tag).toContain('as="font"')
            expect(tag).toContain('type="font/woff2"')
            expect(tag).toContain('crossorigin')
        }
    })
})
