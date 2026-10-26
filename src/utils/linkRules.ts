interface LinkRule {
    kind: string
    icon: { name: string }
    match: (url: string, label: string) => boolean
}

/**
 * Canonical, fixed footer display order: calendar/events/schedule, Instagram,
 * Discord, Website, FB. Everything else keeps its original YAML order,
 * appended after (see canonicalRank / resolveLink below).
 */
const linkRules: LinkRule[] = [
    {
        kind: 'calendar',
        icon: { name: 'fa7-solid:calendar' },
        match: (_u, l) =>
            l.includes('event') ||
            l.includes('calendar') ||
            l.includes('show') ||
            l.includes('flyer') ||
            l.includes('schedule'),
    },
    {
        kind: 'instagram',
        icon: { name: 'fa7-brands:instagram' },
        match: (u) => u.includes('instagram.com'),
    },
    {
        kind: 'discord',
        icon: { name: 'fa7-brands:discord' },
        match: (u) => u.includes('discord.com') || u.includes('discord.gg'),
    },
    {
        kind: 'website',
        icon: { name: 'fa7-solid:earth-africa' },
        match: (_u, l) => l.includes('website'),
    },
    {
        kind: 'facebook',
        icon: { name: 'fa7-brands:facebook' },
        match: (u) => u.includes('facebook.com'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-solid:rectangle-list' },
        match: (u) => u.includes('carrd.co'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-solid:spa' },
        match: (_u, l) => l.includes('zen'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-brands:linktree' },
        match: (_u, l) => l.includes('linktree'),
    },
    {
        kind: 'underground',
        icon: { name: 'fa7-solid:music' },
        match: (_u, l) => l.includes('underground'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-solid:square-check' },
        match: (u, l) =>
            l.includes('register') ||
            l.includes('signup') ||
            u.includes('docs.google.com/forms') ||
            u.includes('forms.gle'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-solid:person-half-dress' },
        match: (_u, l) => l.includes('clothes') || l.includes('closet'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-solid:jar' },
        match: (_u, l) => l.includes('pantry') || l.includes('food'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-solid:child-reaching' },
        match: (_u, l) => l.includes('youth') || l.includes('teen'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-solid:people-group' },
        match: (_u, l) => l.includes('support') || l.includes('mental'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-solid:user-group' },
        match: (u) => u.includes('meetup.com'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-solid:shirt' },
        match: (u, l) =>
            u.includes('threadless.com') || l.includes('threadless'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-solid:palette' },
        match: (u, l) => u.includes('redbubble.com') || l.includes('workshop'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-solid:shop' },
        match: (u) => u.includes('inprnt.com'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-brands:bluesky' },
        match: (u, l) => u.includes('bsky.app') || l.includes('bluesky'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-brands:bandcamp' },
        match: (u) => u.includes('bandcamp.com'),
    },
    {
        kind: 'other',
        icon: { name: 'fa7-brands:substack' },
        match: (u) => u.includes('substack.com'),
    },
]

export function matchRule(url: string, label: string) {
    return linkRules.find((r) => r.match(url, label)) ?? null
}

const canonicalRank: Record<string, number> = {
    calendar: 0,
    instagram: 1,
    discord: 2,
    website: 3,
    facebook: 4,
}

export function resolveLink(link: { url: string; label: string }) {
    const url = link.url.toLowerCase()
    const label = link.label.toLowerCase()
    const rule = matchRule(url, label)
    const kind = rule?.kind ?? 'other'
    return { icon: rule?.icon ?? null, rank: canonicalRank[kind] ?? 5 }
}
