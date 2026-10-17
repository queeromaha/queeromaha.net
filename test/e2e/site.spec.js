import { expect, test } from '@playwright/test'

const pages = [
    { path: '/friends/', titleContains: 'Queer' },
    // filter slug pages all share the directory title
    { path: '/music/', titleContains: 'Queer' },
    { path: '/cafes/', titleContains: 'Queer' },
    { path: '/art/', titleContains: 'Queer' },
    { path: '/spiritual/', titleContains: 'Queer' },
    { path: '/makers/', titleContains: 'Queer' },
]

for (const { path, titleContains } of pages) {
    test(`${path} loads and has expected title`, async ({ page }) => {
        const response = await page.goto(path)
        expect(response.status()).toBe(200)
        await expect(page).toHaveTitle(new RegExp(titleContains, 'i'))
    })
}

test('home page renders expected chrome with no console errors', async ({
    page,
}) => {
    const errors = []
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/friends/')

    const nav = page.locator('nav.main-nav')
    await expect(nav).toBeVisible()
    expect(await nav.locator('a').count()).toBeGreaterThan(0)

    await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main')
    await expect(page.getByRole('contentinfo')).toBeVisible()
    expect(await page.locator('.filter-pill').count()).toBeGreaterThan(0)

    expect(errors).toHaveLength(0)
})

test('content pages render wa-card items', async ({ page }) => {
    for (const path of ['/cafes/', '/music/', '/art/', '/makers/']) {
        await page.goto(path)
        const cards = page.locator('wa-card.item')
        expect(await cards.count(), `no cards on ${path}`).toBeGreaterThan(0)
    }
})

test('external links have rel=noopener', async ({ page }) => {
    await page.goto('/cafes/')
    const links = page.locator('wa-card .entry-links a[href^="http"]')
    const count = await links.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
        const rel = await links.nth(i).getAttribute('rel')
        // Noopener required for security
        expect(rel).toContain('noopener')
        // Avoid noreferrer to allow this site to appear in others' analytics
        expect(rel).not.toContain('noreferrer')
    }
})

test('/spiritual pre-activates the spiritual filter pill', async ({ page }) => {
    await page.goto('/spiritual/')
    const pill = page.locator('[data-filter="spiritual"]')
    await expect(pill).toHaveAttribute('aria-current', 'page')
    await expect(pill).toHaveAttribute('data-filter-match', 'true')
})

test('switching top-level category clears active tags', async ({ page }) => {
    await page.goto('/art/')
    const tag = page.locator('[data-filter="neutral-bathrooms"]')

    await tag.click()
    await expect(tag).toHaveAttribute('aria-pressed', 'true')

    await page.locator('[data-filter="cafes"]').click()
    await expect(page).toHaveURL(/\/cafes\/?$/)
    await expect(
        page.locator('[data-filter="neutral-bathrooms"]'),
    ).not.toHaveAttribute('aria-pressed', 'true')
})

test('calendar and suggestion box stay on the same row on mobile', async ({
    page,
}) => {
    // Regression test: Web Awesome's native.css puts a margin-bottom: 24px
    // on every <details>. .calendar-box resets it via `margin: 0`, but
    // .suggestion-box previously reset it with the `margin: 0 auto`
    // shorthand -- swapping that for a lone `margin-left: auto` (see
    // theme.css) would let the 24px bottom margin leak back in, which
    // align-items: center on the footer turns into a ~12px vertical
    // offset between the two pills instead of a clean single row.
    await page.setViewportSize({ width: 412, height: 839 })
    await page.goto('/friends/')

    const calBox = await page.locator('.calendar-box summary').boundingBox()
    const navBox = await page.locator('#suggestionBox summary').boundingBox()
    expect(calBox.y).toBeCloseTo(navBox.y, 0)
})

const REGRESSION_VIEWPORTS = [
    { width: 320, height: 700 },
    { width: 375, height: 812 },
    { width: 412, height: 839 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
]

// The [open] "pressed" look (shared with .filter-pill.active) applies
// transform: translateY(1px) to the toggle pill for tactile feedback --
// a deliberate 1px vertical shift, not the reflow bug this suite guards
// against. X must stay pixel-exact; Y gets that 1px plus a little slack
// for device-pixel rounding under mobile-chrome's Pixel 7 emulation
// (deviceScaleFactor 2.625, confirmed via manual inspection: the real
// shift is exactly 1 CSS px, but device-pixel snapping on a fractional
// scale factor can round the reported box by another px on top of it).
function expectToggleDidNotJump(closedBox, openBox, label) {
    expect(openBox.x, `x at ${label}`).toBe(closedBox.x)
    expect(
        Math.abs(openBox.y - closedBox.y),
        `y at ${label}`,
    ).toBeLessThanOrEqual(2)
}

test('no footer toggle moves when opened, at any viewport width', async ({
    page,
}) => {
    // Regression test for the footer's original bug: opening a footer
    // accordion used to reflow the whole row (flex order/margin tricks
    // trying to keep the toggle "roughly" in place), so the toggle's exact
    // position depended on how much free space sibling-hiding freed up at
    // that specific width. Panels are now position: absolute overlays
    // anchored to their own toggle's box, which never changes size open or
    // closed -- so the toggle's position must stay put, at every width,
    // not just "close." Covers all three boxes per viewport in one
    // navigation rather than three (they share a native <details
    // name="footer-accordion"> group, so only one can be open at a time
    // anyway -- checking them back-to-back after a single goto is
    // equivalent to checking them in isolation).
    for (const viewport of REGRESSION_VIEWPORTS) {
        await page.setViewportSize(viewport)
        await page.goto('/friends/')

        for (const [box, summarySelector, panelSelector] of [
            ['calendar', '.calendar-box summary', '.calendar-box-panel-wrap'],
            [
                'suggestion',
                '#suggestionBox summary',
                '.suggestion-box-panel-wrap',
            ],
            ['utility', '#utilityBox summary', '.utility-box-panel'],
        ]) {
            const summary = page.locator(summarySelector)
            const closedBox = await summary.boundingBox()

            await summary.click()
            await expect(page.locator(panelSelector)).toBeVisible()
            const openBox = await summary.boundingBox()

            expectToggleDidNotJump(
                closedBox,
                openBox,
                `${box} box at ${viewport.width}px`,
            )

            await summary.click()
        }
    }
})

test('none of the three footer panels stretch to the full footer width', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/friends/')
    // Scoped to the site footer specifically -- wa-card renders its own
    // light-DOM <footer part="footer">, so an unscoped `footer` locator
    // matches every card on the page too.
    const footerWidth = (await page.getByRole('contentinfo').boundingBox())
        .width

    for (const [toggle, panel] of [
        ['.calendar-box summary', '.calendar-box-panel-wrap'],
        ['#suggestionBox summary', '.suggestion-box-panel-wrap'],
        ['#utilityBox summary', '.utility-box-panel'],
    ]) {
        await page.locator(toggle).click()
        const panelBox = await page.locator(panel).boundingBox()
        expect(panelBox.width).toBeLessThan(footerWidth * 0.5)
        await page.locator(toggle).click()
    }
})

test('calendar panel grows rightward from its own left edge; suggestion panel grows leftward from its own right edge', async ({
    page,
}) => {
    await page.setViewportSize({ width: 412, height: 839 })
    await page.goto('/friends/')

    const calSummary = page.locator('.calendar-box summary')
    const calSummaryBox = await calSummary.boundingBox()
    await calSummary.click()
    const calPanelBox = await page
        .locator('.calendar-box-panel-wrap')
        .boundingBox()
    expect(calPanelBox.x).toBe(calSummaryBox.x)
    await calSummary.click()

    const suggSummary = page.locator('#suggestionBox summary')
    const suggSummaryBox = await suggSummary.boundingBox()
    await suggSummary.click()
    const suggPanelBox = await page
        .locator('.suggestion-box-panel-wrap')
        .boundingBox()
    expect(suggPanelBox.x + suggPanelBox.width).toBe(
        suggSummaryBox.x + suggSummaryBox.width,
    )
})

test('suggestion box pill is tucked against the right separator, next to the utility gear icon', async ({
    page,
}) => {
    await page.goto('/friends/')

    const suggestionBox = await page.locator('.suggestion-box').boundingBox()
    const separatorRight = await page
        .locator('.footer-separator-right')
        .boundingBox()
    const footerNav = await page.locator('.footer-nav').boundingBox()

    // Tucked against the right separator, not centered in the leftover
    // space between it and .calendar-box: the gaps on both sides of the
    // separator should be small, tight margins, not a wide evenly-split
    // gap.
    expect(
        separatorRight.x - (suggestionBox.x + suggestionBox.width),
    ).toBeLessThan(20)
    expect(
        footerNav.x - (separatorRight.x + separatorRight.width),
    ).toBeLessThan(20)
})

test('a separator divides the calendar and suggestion box pills, even on narrow mobile', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/friends/')

    const separator = page.locator('.footer-separator-left')
    await expect(separator).toBeVisible()

    const calBox = await page.locator('.calendar-box summary').boundingBox()
    const sepBox = await separator.boundingBox()
    const suggBox = await page.locator('#suggestionBox summary').boundingBox()

    // separator sits horizontally between the two pills
    expect(sepBox.x).toBeGreaterThanOrEqual(calBox.x + calBox.width)
    expect(suggBox.x).toBeGreaterThanOrEqual(sepBox.x + sepBox.width)

    // both pills stay on one row (no wrap) at this narrow width -- the
    // separator itself isn't compared here since align-self: stretch
    // deliberately makes it taller than the pills, so its top edge
    // legitimately sits higher than theirs even on the same row
    expect(suggBox.y).toBeCloseTo(calBox.y, 0)
})

test('item cards with a location show a location-dot icon', async ({
    page,
}) => {
    await page.goto('/cafes/')
    const locations = page.locator('.item-location')
    const count = await locations.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
        await expect(
            locations.nth(i).locator('svg[data-icon*="location-dot"]'),
        ).toHaveCount(1)
    }
})

test('suggestion box expands in place without navigating', async ({ page }) => {
    await page.goto('/friends/')
    const startUrl = page.url()

    await page.locator('#suggestionBox summary').click()

    await expect(page.locator('#suggestionMessage')).toBeVisible()
    expect(page.url()).toBe(startUrl)
})

test('suggestion box re-tapping toggles it open and closed', async ({
    page,
}) => {
    await page.goto('/friends/')

    const closedBox = await page.locator('#suggestionBox summary').boundingBox()

    await page.locator('#suggestionBox summary').click()

    await expect(page.locator('#suggestionBox')).toHaveAttribute('open', '')

    await page.locator('#suggestionBox summary').click()

    await expect(page.locator('#suggestionBox')).not.toHaveAttribute('open', '')
    await expect
        .poll(async () => {
            const box = await page
                .locator('#suggestionBox summary')
                .boundingBox()
            return box.x
        })
        .toBe(closedBox.x)
})

test('calendar box expands in place, offers Google and webcal links, and re-tapping closes it', async ({
    page,
}) => {
    await page.goto('/friends/')
    const startUrl = page.url()

    await page.locator('.calendar-box summary').click()

    const google = page.locator('.calendar-option').nth(0)
    const ics = page.locator('.calendar-option').nth(1)
    await expect(google).toBeVisible()
    await expect(ics).toBeVisible()
    await expect(google).toHaveAttribute('href', /calendar\.google\.com/)
    await expect(ics).toHaveAttribute(
        'href',
        'webcal://queeromaha.net/events.ics',
    )
    await expect(google).toHaveAccessibleName(/Google Calendar/)
    await expect(ics).toHaveAccessibleName(/Apple Calendar/)
    expect(page.url()).toBe(startUrl)
    await expect(page.locator('#calendarBox')).toHaveAttribute('open', '')

    await page.locator('.calendar-box summary').click()

    await expect(page.locator('#calendarBox')).not.toHaveAttribute('open', '')
})

test('gear info box opens to reveal Privacy and Contact links, and re-tapping closes it', async ({
    page,
}) => {
    await page.goto('/friends/')

    await page.locator('#utilityBox summary').click()

    const privacyLink = page.locator('.utility-option', { hasText: 'Privacy' })
    const contactLink = page.locator('.utility-option', { hasText: 'Contact' })
    const githubLink = page.locator('.utility-option', { hasText: 'GitHub' })
    await expect(privacyLink).toBeVisible()
    await expect(contactLink).toBeVisible()
    await expect(githubLink).toBeVisible()
    await expect(privacyLink).toHaveAttribute('href', '/privacy')
    await expect(contactLink).toHaveAttribute('href', '/contact')
    await expect(githubLink).toHaveAttribute(
        'href',
        'https://github.com/taraxvoid/queeromaha',
    )
    await expect(page.locator('#utilityBox')).toHaveAttribute('open', '')

    await page.locator('#utilityBox summary').click()

    await expect(page.locator('#utilityBox')).not.toHaveAttribute('open', '')
})

for (const [name, detailsSelector] of [
    ['suggestion box', '#suggestionBox'],
    ['calendar box', '#calendarBox'],
    ['utility box', '#utilityBox'],
]) {
    test(`clicking outside or pressing Escape closes the ${name}`, async ({
        page,
    }) => {
        await page.goto('/friends/')
        const details = page.locator(detailsSelector)

        await details.locator('summary').click()
        await expect(details).toHaveAttribute('open', '')

        await page.locator('main').click({ position: { x: 10, y: 10 } })
        await expect(details).not.toHaveAttribute('open', '')

        await details.locator('summary').click()
        await expect(details).toHaveAttribute('open', '')

        await page.keyboard.press('Escape')
        await expect(details).not.toHaveAttribute('open', '')
        await expect(details.locator('summary')).toBeFocused()
    })
}

const PREVIEW_FIXTURE_ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QueerOmaha//Queer Omaha Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Queer Omaha Events',
    'X-WR-TIMEZONE:America/Chicago',
    'BEGIN:VEVENT',
    'UID:fixture-support-group@queeromaha.net',
    'DTSTAMP:20250101T000000Z',
    'DTSTART;TZID=America/Chicago:20250101T180000',
    'RRULE:FREQ=WEEKLY;BYDAY=WE',
    'DURATION:PT1H30M',
    'SUMMARY:Support Group (19+)',
    'LOCATION:OmahaForUs',
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:fixture-game-night@queeromaha.net',
    'DTSTAMP:20250101T000000Z',
    'DTSTART;TZID=America/Chicago:20250102T170000',
    'RRULE:FREQ=WEEKLY;BYDAY=TH',
    'DURATION:PT3H',
    'SUMMARY:Game Night',
    'LOCATION:OmahaForUs',
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:fixture-drum-circle@queeromaha.net',
    'DTSTAMP:20250101T000000Z',
    'DTSTART;TZID=America/Chicago:20250117T190000',
    'RRULE:FREQ=MONTHLY;BYDAY=3FR',
    'DURATION:PT2H',
    'SUMMARY:Drum Circle',
    'LOCATION:Whole Rejuvenation House',
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n')

test('calendar box preview shows the next 3 upcoming events from the live feed, in order', async ({
    page,
}) => {
    // 2026-01-14 is a Wednesday. Chronologically next: Support Group same
    // day 6pm, Game Night the following day (Thu) 5pm, Drum Circle the
    // 3rd Friday of January (Jan 16) 7pm.
    await page.clock.setFixedTime(new Date('2026-01-14T10:00:00'))
    await page.route('**/events.ics', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'text/calendar; charset=utf-8',
            body: PREVIEW_FIXTURE_ICS,
        }),
    )

    await page.goto('/friends/')
    await page.locator('.calendar-box summary').click()

    const rows = page.locator('.calendar-preview-row')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toHaveText(/Wed.*6:00\s?PM.*Support Group/)
    await expect(rows.nth(1)).toHaveText(/Thu.*5:00\s?PM.*Game Night/)
    await expect(rows.nth(2)).toHaveText(/Fri.*7:00\s?PM.*Drum Circle/)
})

test('calendar box preview rows stay empty when the feed request fails', async ({
    page,
}) => {
    await page.route('**/events.ics', (route) => route.fulfill({ status: 500 }))

    await page.goto('/friends/')
    const feedResponse = page.waitForResponse('**/events.ics')
    await page.locator('.calendar-box summary').click()
    await feedResponse

    const google = page.locator('.calendar-option').nth(0)
    const ics = page.locator('.calendar-option').nth(1)
    await expect(google).toBeVisible()
    await expect(ics).toBeVisible()

    const rows = page.locator('.calendar-preview-row')
    await expect(rows).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
        await expect(rows.nth(i)).toHaveText('')
    }
})

test('opening the suggestion box also hides the back-to-top button', async ({
    page,
}) => {
    await page.goto('/friends/')
    await page.evaluate(() => window.scrollTo(0, 2000))
    await expect(page.locator('#backToTop')).toBeVisible()

    await page.locator('#suggestionBox summary').click()
    await expect(page.locator('#backToTop')).toBeHidden()

    await page.locator('#suggestionBox summary').click()
    await expect(page.locator('#backToTop')).toBeVisible()
})

test('suggestion form shows inline confirmation without navigating', async ({
    page,
}) => {
    await page.goto('/friends/')
    await page.locator('#suggestionBox summary').click()

    // Netlify intercepts the real POST; mock it so the test is self-contained
    await page.route('/', async (route) => {
        if (route.request().method() === 'POST') {
            await route.fulfill({ status: 200 })
        } else {
            await route.continue()
        }
    })

    await page.fill('#suggestionMessage', 'Test suggestion')
    await page.click('.suggestion-submit')

    // Should stay on the same page
    expect(page.url()).toContain('/friends')

    // Form replaced by confirmation message
    await expect(page.locator('.suggestion-thanks')).toBeVisible()
    await expect(page.locator('form[name="suggest"]')).not.toBeAttached()
    // Send lives outside the form (associated via the form= attribute)
    // so it needs its own explicit removal on success
    await expect(page.locator('.suggestion-submit')).not.toBeAttached()
})

test('suggestion form shows an error message on a failed submission', async ({
    page,
}) => {
    await page.goto('/friends/')
    await page.locator('#suggestionBox summary').click()

    await page.route('/', async (route) => {
        if (route.request().method() === 'POST') {
            await route.fulfill({ status: 500 })
        } else {
            await route.continue()
        }
    })

    await page.fill('#suggestionMessage', 'Test suggestion')
    await page.click('.suggestion-submit')

    await expect(page.locator('.suggestion-error')).toBeVisible()
    await expect(page.locator('.suggestion-error')).toContainText('Try again')
    await expect(page.locator('form[name="suggest"]')).toBeAttached()
})

test('suggestion form shows a connection error message on a network failure', async ({
    page,
}) => {
    await page.goto('/friends/')
    await page.locator('#suggestionBox summary').click()

    await page.route('/', async (route) => {
        if (route.request().method() === 'POST') {
            await route.abort()
        } else {
            await route.continue()
        }
    })

    await page.fill('#suggestionMessage', 'Test suggestion')
    await page.click('.suggestion-submit')

    await expect(page.locator('.suggestion-error')).toBeVisible()
    await expect(page.locator('.suggestion-error')).toContainText('connection')
})

test('suggestion box character counter updates as the user types', async ({
    page,
}) => {
    await page.goto('/friends/')
    await page.locator('#suggestionBox summary').click()

    await page.fill('#suggestionMessage', 'a'.repeat(10))
    await expect(page.locator('#suggestionHint')).toContainText('130')
})

test('/events.ics returns a valid calendar feed', async ({ request }) => {
    const response = await request.get('/events.ics')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/calendar')

    const body = await response.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('BEGIN:VEVENT')
    expect(body).toContain('SUMMARY:')
})

test('/llms.txt returns plain text with expected content', async ({
    request,
}) => {
    const response = await request.get('/llms.txt')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/plain')
    expect(await response.text()).toContain('# Queer Omaha')
})

test('/robots.txt returns plain text with sitemap and content signals', async ({
    request,
}) => {
    const response = await request.get('/robots.txt')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/plain')
    const body = await response.text()
    expect(body).toContain('Sitemap:')
    expect(body).toContain('Content-Signal:')
})

test('item cards emit valid Organization JSON-LD', async ({ page }) => {
    await page.goto('/cafes/')
    // ItemCard.astro emits the <script> as a preceding sibling of its
    // <wa-card>, not a child, so scope by adjacency rather than nesting.
    const scripts = page.locator(
        'script[type="application/ld+json"]:has(+ wa-card.item)',
    )
    const rawScripts = await scripts.evaluateAll((els) =>
        els.map((el) => el.innerHTML),
    )
    expect(rawScripts.length).toBeGreaterThan(0)
    for (const raw of rawScripts) {
        const data = JSON.parse(raw)
        expect(data['@type']).toBe('Organization')
        expect(typeof data.name).toBe('string')
        expect(data.name.length).toBeGreaterThan(0)
    }
})

test('links are ordered calendar > instagram > discord > website > facebook', async ({
    page,
}) => {
    // Search a few card-heavy categories for an entry with both an
    // instagram and a facebook link, rather than hardcoding a specific
    // business — content changes independently of this test.
    let found = false
    for (const path of ['/music/', '/makers/', '/friends/', '/cafes/']) {
        await page.goto(path)
        const lists = page.locator('ul.entry-links')
        const listCount = await lists.count()
        for (let i = 0; i < listCount; i++) {
            const list = lists.nth(i)
            const instaIndex = await list
                .locator('li:has(svg[data-icon*="instagram"])')
                .count()
            const fbIndex = await list
                .locator('li:has(svg[data-icon*="facebook"])')
                .count()
            if (instaIndex === 0 || fbIndex === 0) continue

            const iconNames = await list
                .locator('li svg[data-icon]')
                .evaluateAll((els) => els.map((el) => el.dataset.icon ?? ''))
            const instaPos = iconNames.findIndex((i) => i.includes('instagram'))
            const fbPos = iconNames.findIndex((i) => i.includes('facebook'))
            expect(instaPos).toBeGreaterThanOrEqual(0)
            expect(fbPos).toBeGreaterThan(instaPos)
            found = true
            break
        }
        if (found) break
    }
    expect(
        found,
        'no card with both an instagram and a facebook link was found to test ordering against',
    ).toBe(true)
})

test('an unavailable tag pill is disabled and marked unavailable', async ({
    page,
}) => {
    await page.goto('/art/')

    const visibleCards = page.locator('wa-card.item:not(.is-hidden)')
    const cardCount = await visibleCards.count()
    expect(cardCount).toBeGreaterThan(0)

    const presentTags = new Set()
    for (let i = 0; i < cardCount; i++) {
        const tags = (await visibleCards.nth(i).getAttribute('data-tags')) || ''
        for (const t of tags.split(' ').filter(Boolean)) presentTags.add(t)
    }

    const tagPills = page.locator('.filter-pill[data-filter-type="tag"]')
    const pillCount = await tagPills.count()
    let unavailableSlug = null
    for (let i = 0; i < pillCount; i++) {
        const slug = await tagPills.nth(i).getAttribute('data-filter')
        if (slug && !presentTags.has(slug)) {
            unavailableSlug = slug
            break
        }
    }
    expect(
        unavailableSlug,
        'no absent tag found on /art/ to test unavailability against',
    ).not.toBeNull()

    const pill = page.locator(`[data-filter="${unavailableSlug}"]`)
    await expect(pill).toBeDisabled()
})

test('re-clicking the active category pill is a no-op', async ({ page }) => {
    await page.goto('/spiritual/')
    const tag = page.locator('[data-filter="neutral-bathrooms"]')
    await tag.click()
    await expect(tag).toHaveAttribute('aria-pressed', 'true')

    await page.locator('[data-filter="spiritual"]').click()

    await expect(page).toHaveURL(/\/spiritual\/?$/)
    await expect(tag).toHaveAttribute('aria-pressed', 'true')
})

test('back-to-top button appears on scroll and returns to the top', async ({
    page,
}) => {
    await page.goto('/friends/')
    const button = page.locator('#backToTop')

    await page.evaluate(() => window.scrollTo(0, 2000))
    await expect(button).toHaveClass(/show/)

    await button.click()
    await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeLessThan(50)
})

test('tapping a card rewrites the URL to its permalink and marks it active', async ({
    page,
}) => {
    await page.goto('/friends/')
    const card = page.locator('#friends-o4us')
    await card.locator('.item-tap-target').click()

    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe('/friends/o4us')
    await expect(card).toHaveClass(/item-active/)
    await expect(card.locator('.item-tap-target')).toHaveAttribute(
        'aria-pressed',
        'true',
    )
})

test('tapping an active card again reverts to the category URL', async ({
    page,
}) => {
    await page.goto('/friends/')
    const card = page.locator('#friends-o4us')
    await card.locator('.item-tap-target').click()
    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe('/friends/o4us')

    await card.locator('.item-tap-target').click()

    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe('/friends')
    await expect(card).not.toHaveClass(/item-active/)
    await expect(card.locator('.item-tap-target')).toHaveAttribute(
        'aria-pressed',
        'false',
    )
})

test('clicking a link inside an unselected card navigates and also selects it', async ({
    page,
    context,
}) => {
    await page.goto('/friends/')
    const card = page.locator('#friends-o4us')
    const link = card.getByRole('link', { name: /Events Calendar/ })

    const [popup] = await Promise.all([
        context.waitForEvent('page'),
        link.click(),
    ])
    await popup.close()

    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe('/friends/o4us')
    await expect(card).toHaveClass(/item-active/)
    await expect(card.locator('.item-tap-target')).toHaveAttribute(
        'aria-pressed',
        'true',
    )
})

test('clicking a link inside an already-selected card leaves it selected', async ({
    page,
    context,
}) => {
    await page.goto('/friends/')
    const card = page.locator('#friends-o4us')
    await card.locator('.item-tap-target').click()
    await expect(card).toHaveClass(/item-active/)

    const link = card.getByRole('link', { name: /Events Calendar/ })
    const [popup] = await Promise.all([
        context.waitForEvent('page'),
        link.click(),
    ])
    await popup.close()

    await expect(card).toHaveClass(/item-active/)
    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe('/friends/o4us')
})

test('activating a card via keyboard (Enter) toggles it the same as a click', async ({
    page,
}) => {
    await page.goto('/friends/')
    const card = page.locator('#friends-o4us')
    const tapTarget = card.locator('.item-tap-target')
    await tapTarget.focus()
    await tapTarget.press('Enter')

    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe('/friends/o4us')
    await expect(card).toHaveClass(/item-active/)

    await tapTarget.press(' ')

    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe('/friends')
    await expect(card).not.toHaveClass(/item-active/)
})

test('clicking a different card while one is active switches directly', async ({
    page,
}) => {
    await page.goto('/friends/')
    const first = page.locator('#friends-o4us')
    await first.locator('.item-tap-target').click()
    await expect(first).toHaveClass(/item-active/)

    const other = page
        .locator('wa-card.item[data-category="friends"]:not(#friends-o4us)')
        .first()
    await other.locator('.item-tap-target').click()

    await expect(first).not.toHaveClass(/item-active/)
    await expect(other).toHaveClass(/item-active/)
    const otherSlug = await other.getAttribute('data-slug')
    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe(`/friends/${otherSlug}`)
})

test('back-to-top reverts an active card permalink to the category URL', async ({
    page,
}) => {
    await page.goto('/friends/')
    await page.locator('#friends-o4us').locator('.item-tap-target').click()
    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe('/friends/o4us')

    // Scroll deep so #backToTop clears its visibility threshold (see the
    // pre-existing "back-to-top button appears on scroll" test).
    await page.evaluate(() => window.scrollTo(0, 2000))
    const button = page.locator('#backToTop')
    await expect(button).toHaveClass(/show/)
    await button.click()

    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe('/friends')
    await expect(page.locator('#friends-o4us')).not.toHaveClass(/item-active/)
})

test('landing directly on an item permalink scrolls it into view and marks it active', async ({
    page,
}) => {
    await page.goto('/friends/o4us/')
    const card = page.locator('#friends-o4us')

    await expect(card).toHaveClass(/item-active/)
    await expect(card.locator('.item-tap-target')).toHaveAttribute(
        'aria-pressed',
        'true',
    )
    await expect
        .poll(async () => {
            const box = await card.boundingBox()
            return box?.y ?? Number.NaN
        })
        .toBeGreaterThanOrEqual(0)
})

test('item permalink active state still applies under prefers-reduced-motion', async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/friends/o4us/')
    const card = page.locator('#friends-o4us')

    await expect(card).toHaveClass(/item-active/)
})

test('switching category while a card is active clears its active state', async ({
    page,
}) => {
    await page.goto('/friends/')
    const card = page.locator('#friends-o4us')
    await card.locator('.item-tap-target').click()
    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe('/friends/o4us')

    await page.locator('[data-filter="cafes"]').click()

    await expect
        .poll(() => page.evaluate(() => location.pathname))
        .toBe('/cafes')
    await expect(card).toHaveCount(0)
})

test('/privacy loads, links back to the directory, and links to /contact', async ({
    page,
}) => {
    const response = await page.goto('/privacy/')
    expect(response.status()).toBe(200)
    await expect(page).toHaveTitle(/Privacy/)
    const backLink = page.locator('.back-link')
    await expect(backLink).toBeVisible()
    await expect(backLink).toHaveAttribute('href', '/friends')
    await expect(page.locator('a[href="/contact"]').first()).toBeVisible()
})

test('/contact loads, links back to the directory, and links to /privacy', async ({
    page,
}) => {
    const response = await page.goto('/contact/')
    expect(response.status()).toBe(200)
    await expect(page).toHaveTitle(/Contact/)
    const backLink = page.locator('.back-link')
    await expect(backLink).toBeVisible()
    await expect(backLink).toHaveAttribute('href', '/friends')
})

test('contact form shows inline confirmation without navigating', async ({
    page,
}) => {
    await page.goto('/contact/')

    await page.route('/', async (route) => {
        if (route.request().method() === 'POST') {
            await route.fulfill({ status: 200 })
        } else {
            await route.continue()
        }
    })

    await page.fill('#contactEmail', 'test@example.com')
    await page.fill('#contactMessage', 'Hello there')
    await page.click('.contact-submit')

    expect(page.url()).toContain('/contact')
    await expect(page.locator('.contact-thanks')).toBeVisible()
    await expect(page.locator('form[name="contact"]')).not.toBeAttached()
})

test('contact form shows an error message on a failed submission', async ({
    page,
}) => {
    await page.goto('/contact/')

    await page.route('/', async (route) => {
        if (route.request().method() === 'POST') {
            await route.fulfill({ status: 500 })
        } else {
            await route.continue()
        }
    })

    await page.fill('#contactEmail', 'test@example.com')
    await page.fill('#contactMessage', 'Hello there')
    await page.click('.contact-submit')

    await expect(page.locator('.contact-error')).toBeVisible()
    await expect(page.locator('.contact-error')).toContainText('Try again')
    await expect(page.locator('form[name="contact"]')).toBeAttached()
})
