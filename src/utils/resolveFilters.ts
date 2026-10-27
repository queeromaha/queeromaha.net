import { type CollectionEntry, getCollection } from 'astro:content'
import categoryMapJson from '#data/categoryMap.json'
import { computeItemSlugs } from './itemSlug'

export const categoryMap = categoryMapJson as Record<
    string,
    { icon: string; label: string; descriptor: string }
>
export const categorySlugs = Object.keys(categoryMap)

// Every `filters` value the [...filters] route family (HTML + markdown)
// should statically generate: the root ('' / undefined), each category, and
// each category/item-slug permalink.
export async function getFilterStaticPaths(): Promise<(string | undefined)[]> {
    const collectionEntries = await getCollection('directory')
    const paths: (string | undefined)[] = [undefined]

    for (const s of categorySlugs) {
        paths.push(s)
        const entry = collectionEntries.find((e) => e.id === s)
        const publicItems = (entry?.data.items ?? []).filter(
            (i) => i.public !== false,
        )
        for (const { canonical } of computeItemSlugs(publicItems)) {
            paths.push(`${s}/${canonical}`)
        }
    }

    return paths
}

// Shared resolution of a `filters` route param into the active
// category/item and the visibility state every category should render
// with - used by both the HTML page and its markdown counterpart so they
// always agree on what's "visible" for a given URL.
export async function resolveFilters(filters = '') {
    const filterSlugs = filters.split('/').filter(Boolean)
    const effectiveFilterSlugs =
        filterSlugs.length === 0 ? ['friends'] : filterSlugs
    const initialCategories = effectiveFilterSlugs.filter((s) =>
        categorySlugs.includes(s),
    )

    const entries = await getCollection('directory')
    entries.sort(
        (a, b) => categorySlugs.indexOf(a.id) - categorySlugs.indexOf(b.id),
    )

    // Mirrors cardMatches() in scripts/filter.ts (category only - tags are
    // never part of a static route). This lets the server render the same
    // hidden state filter.ts would apply on load, so there's no flash of the
    // full unfiltered directory before JS hides it (a major CLS source).
    function matchesInitial(catId: string) {
        return (
            initialCategories.length === 0 || initialCategories.includes(catId)
        )
    }

    const activeCategory = initialCategories[0]
    const activeEntry = entries.find((e) => e.id === activeCategory)
    const activeCategoryHasFilters =
        !activeCategory ||
        (activeEntry?.data.items ?? []).some(
            (item) => item.public !== false && (item.tags?.length ?? 0) > 0,
        )

    // A permalink request is exactly `<category>/<item-slug>` - a trailing
    // segment beyond that (or one that doesn't match a known category first)
    // never resolves to an item deep link.
    const activePublicItems = (activeEntry?.data.items ?? []).filter(
        (i) => i.public !== false,
    )
    const activeItemSlugs = computeItemSlugs(activePublicItems)
    const trailingSlug =
        activeCategory &&
        effectiveFilterSlugs.length === 2 &&
        effectiveFilterSlugs[0] === activeCategory
            ? effectiveFilterSlugs[1]
            : undefined
    const activeItemIndex = trailingSlug
        ? activeItemSlugs.findIndex((s) => s.canonical === trailingSlug)
        : -1
    const activeItem =
        activeItemIndex >= 0 ? activePublicItems[activeItemIndex] : undefined
    const initialItemSlug = activeItem ? trailingSlug : undefined

    const categoryPart = activeCategory
        ? (categoryMap[activeCategory]?.descriptor ??
          categoryMap.friends.descriptor)
        : categoryMap.friends.descriptor
    const pageTitle = activeItem
        ? `${activeItem.name} | ${categoryPart}`
        : categoryPart
    const pageDescription = activeItem
        ? (activeItem.description ??
          `${activeItem.name} - ${categoryPart} in Omaha, Nebraska.`)
        : `${categoryPart} in Omaha, Nebraska - part of Queer Omaha's community-maintained directory.`

    return {
        entries,
        initialCategories,
        matchesInitial,
        activeCategory,
        activeEntry,
        activeCategoryHasFilters,
        activeItem,
        initialItemSlug,
        pageTitle,
        pageDescription,
    }
}

export type ResolvedFilters = Awaited<ReturnType<typeof resolveFilters>>
export type DirectoryEntry = CollectionEntry<'directory'>
