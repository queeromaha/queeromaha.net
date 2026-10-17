// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest'

// filter.ts runs `initFilters()` immediately on import (DOM-ready listener),
// so the DOM fixture must exist before each dynamic import, and modules must
// be reset between tests so it re-runs against the fresh fixture.
async function loadFilters() {
    vi.resetModules()
    await import('../src/scripts/filter.ts')
}

function setBody(html: string) {
    document.body.innerHTML = html
}

const CATEGORY_PILLS = `
  <a data-filter="art" data-filter-type="category">Art</a>
  <a data-filter="cafes" data-filter-type="category">Cafes</a>
`

const TAG_PILLS = `
  <button class="filter-pill" data-filter="wifi" data-filter-type="tag" aria-pressed="false">WiFi</button>
  <button class="filter-pill" data-filter="seating" data-filter-type="tag" aria-pressed="false">Seating</button>
`

function cards() {
    return `
      <h2 data-category-heading="art">Art</h2>
      <wa-card data-category="art" data-tags="wifi"></wa-card>
      <wa-card data-category="art" data-tags="seating"></wa-card>
      <h2 data-category-heading="cafes">Cafes</h2>
      <wa-card data-category="cafes" data-tags="wifi seating"></wa-card>
    `
}

describe('initFilters', () => {
    beforeEach(() => {
        document.body.removeAttribute('data-initial-categories')
        document.body.removeAttribute('data-initial-tags')
        setBody(`${CATEGORY_PILLS}${TAG_PILLS}${cards()}`)
    })

    test('does nothing when there are no cards on the page', async () => {
        setBody(CATEGORY_PILLS + TAG_PILLS)
        await loadFilters()
        // No throw, and pills are left untouched.
        const pill = document.querySelector<HTMLButtonElement>(
            '[data-filter="wifi"]',
        )
        expect(pill?.getAttribute('aria-pressed')).toBe('false')
    })

    test('clicking a tag pill hides cards that lack the tag', async () => {
        await loadFilters()
        const wifiPill = document.querySelector<HTMLButtonElement>(
            '[data-filter="wifi"]',
        )
        wifiPill?.click()

        const cardEls = document.querySelectorAll<HTMLElement>('wa-card')
        expect(cardEls[0].classList.contains('is-hidden')).toBe(false) // art, wifi
        expect(cardEls[1].classList.contains('is-hidden')).toBe(true) // art, seating only
        expect(cardEls[2].classList.contains('is-hidden')).toBe(false) // cafes, wifi+seating
    })

    test('tag pills AND-match: two active tags only match cards with both', async () => {
        await loadFilters()
        document
            .querySelector<HTMLButtonElement>('[data-filter="wifi"]')
            ?.click()
        document
            .querySelector<HTMLButtonElement>('[data-filter="seating"]')
            ?.click()

        const cardEls = document.querySelectorAll<HTMLElement>('wa-card')
        expect(cardEls[0].classList.contains('is-hidden')).toBe(true) // wifi only
        expect(cardEls[1].classList.contains('is-hidden')).toBe(true) // seating only
        expect(cardEls[2].classList.contains('is-hidden')).toBe(false) // wifi+seating
    })

    test('tag pill becomes disabled/unavailable when it would produce zero results', async () => {
        setBody(
            `${TAG_PILLS}<wa-card data-category="art" data-tags="wifi"></wa-card>`,
        )
        await loadFilters()
        document
            .querySelector<HTMLButtonElement>('[data-filter="wifi"]')
            ?.click()

        const seatingPill = document.querySelector<HTMLButtonElement>(
            '[data-filter="seating"]',
        )
        expect(seatingPill?.disabled).toBe(true)
    })

    test('data-initial-categories hides other categories and their headings', async () => {
        document.body.dataset.initialCategories = 'cafes'
        await loadFilters()

        const cardEls = document.querySelectorAll<HTMLElement>('wa-card')
        expect(cardEls[0].classList.contains('is-hidden')).toBe(true) // art
        expect(cardEls[1].classList.contains('is-hidden')).toBe(true) // art
        expect(cardEls[2].classList.contains('is-hidden')).toBe(false) // cafes
        const headings = document.querySelectorAll<HTMLElement>(
            '[data-category-heading]',
        )
        expect(headings[0].classList.contains('is-hidden')).toBe(true)
        expect(headings[1].classList.contains('is-hidden')).toBe(false)
    })

    test('data-initial-tags activates the tag pill and filters cards', async () => {
        document.body.dataset.initialTags = 'seating'
        await loadFilters()

        const pill = document.querySelector<HTMLButtonElement>(
            '[data-filter="seating"]',
        )
        expect(pill?.getAttribute('aria-pressed')).toBe('true')
        const cardEls = document.querySelectorAll<HTMLElement>('wa-card')
        expect(cardEls[0].classList.contains('is-hidden')).toBe(true) // wifi only
        expect(cardEls[1].classList.contains('is-hidden')).toBe(false)
        expect(cardEls[2].classList.contains('is-hidden')).toBe(false)
    })

    test('a heading hides when the active tag filters out all its cards', async () => {
        setBody(`${TAG_PILLS}
          <h2 data-category-heading="art">Art</h2>
          <wa-card data-category="art" data-tags="wifi"></wa-card>
          <h2 data-category-heading="cafes">Cafes</h2>
          <wa-card data-category="cafes" data-tags="seating"></wa-card>`)
        await loadFilters()
        document
            .querySelector<HTMLButtonElement>('[data-filter="seating"]')
            ?.click()

        const headings = document.querySelectorAll<HTMLElement>(
            '[data-category-heading]',
        )
        expect(headings[0].classList.contains('is-hidden')).toBe(true)
        expect(headings[1].classList.contains('is-hidden')).toBe(false)
    })

    test('clicking an active tag pill toggles it off and restores cards', async () => {
        await loadFilters()
        const pill = document.querySelector<HTMLButtonElement>(
            '[data-filter="wifi"]',
        )
        pill?.click()
        pill?.click()

        expect(pill?.getAttribute('aria-pressed')).toBe('false')
        for (const c of document.querySelectorAll<HTMLElement>('wa-card')) {
            expect(c.classList.contains('is-hidden')).toBe(false)
        }
    })

    test('tag pills push a slashless category URL', async () => {
        document.body.dataset.initialCategories = 'cafes'
        await loadFilters()
        document
            .querySelector<HTMLButtonElement>('[data-filter="wifi"]')
            ?.click()
        expect(location.pathname).toBe('/cafes')
    })
})
