import { prefersReducedMotion } from '#utils/motion.ts'

function initFilters() {
    const cards = document.querySelectorAll<HTMLElement>('[data-category]')
    const pills = document.querySelectorAll<HTMLButtonElement>(
        'button[data-filter]',
    )

    if (cards.length === 0) return
    const activeTags = new Set<string>()
    const activeCategories = new Set<string>()

    function cardMatches(
        card: HTMLElement,
        cats: Set<string>,
        tags: Set<string>,
    ) {
        const cardTags = (card.dataset.tags || '').split(' ').filter(Boolean)
        const cardCat = card.dataset.category || ''
        const tagMatch =
            tags.size === 0 || [...tags].every((t) => cardTags.includes(t))
        const catMatch = cats.size === 0 || cats.has(cardCat)
        return tagMatch && catMatch
    }

    function applyFilters() {
        cards.forEach((card) => {
            card.classList.toggle(
                'is-hidden',
                !cardMatches(card, activeCategories, activeTags),
            )
        })
        document
            .querySelectorAll<HTMLElement>('[data-category-heading]')
            .forEach((heading) => {
                const cat = heading.dataset.categoryHeading || ''
                heading.classList.toggle(
                    'is-hidden',
                    ![...cards].some(
                        (c) =>
                            c.dataset.category === cat &&
                            !c.classList.contains('is-hidden'),
                    ),
                )
            })
        updatePillAvailability()
    }

    function wouldHaveResults(slug: string, type: string) {
        // Build the hypothetical filter state if `slug` were chosen, rather
        // than relying on the card's current is-hidden state (which reflects
        // the *current* selection and would wrongly veto switching category
        // when the current combination has zero matches).
        const testCats = new Set(activeCategories)
        const testTags = new Set(activeTags)
        if (type === 'category') {
            // Switching category also clears tags (see setCategory), so
            // availability shouldn't be constrained by them.
            testCats.clear()
            testCats.add(slug)
            testTags.clear()
        } else if (type === 'tag') {
            testTags.add(slug)
        }
        return [...cards].some((card) => cardMatches(card, testCats, testTags))
    }

    function updatePillAvailability() {
        pills.forEach((pill) => {
            // Category pills are client-side toggles over the full card DOM
            // every route ships, so they're never limited by the current
            // selection and should never be disabled.
            if (
                pill.dataset.filterType === 'category' ||
                pill.getAttribute('aria-pressed') === 'true'
            ) {
                pill.disabled = false
                return
            }

            const slug = pill.dataset.filter || ''
            const type = pill.dataset.filterType || ''
            const available = wouldHaveResults(slug, type)
            pill.disabled = !available
        })
    }

    function activateFilter(slug: string) {
        const pill = document.querySelector<
            HTMLAnchorElement | HTMLButtonElement
        >(`[data-filter="${slug}"]`)
        if (!pill) return
        if (pill.dataset.filterType === 'category') {
            activeCategories.add(slug)
        } else if (pill.dataset.filterType === 'tag') {
            activeTags.add(slug)
        }
        if (pill instanceof HTMLButtonElement) {
            pill.setAttribute('aria-pressed', 'true')
        }
        applyFilters()
    }

    function deactivateFilter(slug: string) {
        const pill = document.querySelector<
            HTMLAnchorElement | HTMLButtonElement
        >(`[data-filter="${slug}"]`)
        if (!pill) return
        if (pill.dataset.filterType === 'category') {
            activeCategories.delete(slug)
        } else if (pill.dataset.filterType === 'tag') {
            activeTags.delete(slug)
        }
        if (pill instanceof HTMLButtonElement) {
            pill.setAttribute('aria-pressed', 'false')
        }
        applyFilters()
    }

    function buildUrl() {
        const parts = [...activeCategories]
        return parts.length === 0 ? '/friends' : `/${parts.join('/')}`
    }

    function clearType(type: string, activeSet: Set<string>) {
        activeSet.clear()
        pills.forEach((p) => {
            if (p.dataset.filterType === type) {
                p.setAttribute('aria-pressed', 'false')
            }
        })
    }

    function scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: prefersReducedMotion() ? 'instant' : 'smooth',
        })
    }

    function setCategory(slug: string) {
        clearType('category', activeCategories)
        // Switching category also resets tags, since a filter combo from the
        // old category may not make sense in the new one.
        clearType('tag', activeTags)
        activateFilter(slug)
        scrollToTop()
    }

    pills.forEach((pill) => {
        pill.addEventListener('click', (e) => {
            const slug = pill.dataset.filter || ''
            const type = pill.dataset.filterType || ''
            const isActive = pill.getAttribute('aria-pressed') === 'true'

            e.preventDefault()

            if (type === 'category') {
                // Tapping the already-active category is a no-op.
                if (isActive) return
                // Every static route already ships the full card DOM, so
                // switching category is a local hidden-toggle (instant, no
                // fetch) - the pill's real href is only a JS-off fallback.
                setCategory(slug)
                history.pushState({}, '', buildUrl())
                window.posthog?.capture('category_filter_changed', {
                    filter_slug: slug,
                })
                return
            }

            // Tag pills.
            if (isActive) {
                deactivateFilter(slug)
            } else {
                activateFilter(slug)
            }
            history.pushState({}, '', buildUrl())
            if (!isActive) {
                window.posthog?.capture('filter_applied', {
                    filter_slug: slug,
                    filter_type: type,
                })
            }
        })
    })

    // Activate filters from URL on load
    const initCats = (document.body.dataset.initialCategories || '')
        .split(' ')
        .filter(Boolean)
    const initTags = (document.body.dataset.initialTags || '')
        .split(' ')
        .filter(Boolean)
    if (initCats.length > 0) {
        setCategory(initCats[0])
    }
    initTags.forEach(activateFilter)
    // setCategory/activateFilter above only re-evaluate cards that match the
    // newly-active filter; this unconditional applyFilters() ensures every
    // card and section heading reflects the full current filter state (e.g.
    // a heading whose only visible card was hidden by a tag filter).
    applyFilters()
}

// Category and tag pills both filter client-side in place - there's no soft
// navigation - so init once on normal page load.
if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initFilters)
else initFilters()
