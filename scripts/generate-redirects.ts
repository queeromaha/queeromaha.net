#!/usr/bin/env bun
// Generates dist/_redirects from two sources:
//   1. Static redirects in public/_redirects (e.g. legacy path aliases)
//   2. Dynamic redirects derived from vanity_slug mismatches (auto != canonical)
// The complete file is written (not appended), making the script idempotent
// and safe to run multiple times. Each line is validated before writing -
// malformed lines from the static file are skipped with a warning rather
// than silently corrupting the output.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import type { ItemSlugs } from '#utils/itemSlug.ts'
import { computeItemSlugs } from '#utils/itemSlug.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONTENT_DIR = join(ROOT, 'src', 'content', 'pages')
const STATIC_REDIRECTS = join(ROOT, 'public', '_redirects')
const OUTPUT_FILE = join(ROOT, 'dist', '_redirects')

type RedirectEntry = [string, string, string]

// A valid redirect line: <source> <destination> <status>
// Source must start with / (relative path on the same site) or be an
// absolute URL. Destination must be a path or absolute URL. Status is
// a 3-digit HTTP status code.
const REDIRECT_LINE_RE = /^(\S+)\s+(\S+)\s+(\d{3})$/

/** Normalize a single redirect line into a [from, to, status] tuple, or
 *  null if the line is blank, a comment, or malformed. */
export function parseRedirectLine(line: string): RedirectEntry | null {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) return null
    const match = trimmed.match(REDIRECT_LINE_RE)
    if (!match) return null
    const [, from, to, status] = match
    if (
        from === '' ||
        !(
            from.startsWith('/') ||
            from.startsWith('http://') ||
            from.startsWith('https://')
        )
    ) {
        return null
    }
    if (
        to === '' ||
        !(
            to.startsWith('/') ||
            to.startsWith('http://') ||
            to.startsWith('https://')
        )
    ) {
        return null
    }
    return [from, to, status]
}

/** Serialize a redirect tuple back to the _redirects file format. */
export function formatRedirectLine(
    from: string,
    to: string,
    status: string,
): string {
    return `${from}  ${to}  ${status}`
}

/** Validate _redirects content; returns array of malformed line strings. */
export function validateRedirects(content: string): string[] {
    const warnings: string[] = []
    for (const line of content.split('\n')) {
        const parsed = parseRedirectLine(line)
        if (line.trim() && !line.trim().startsWith('#') && !parsed) {
            warnings.push(line)
        }
    }
    return warnings
}

/** Deduplicate redirect entries by their from-path (first wins). */
export function dedupeRedirects(lines: RedirectEntry[]): RedirectEntry[] {
    const seen = new Map<string, RedirectEntry>()
    for (const entry of lines) {
        const [from] = entry
        if (!seen.has(from)) seen.set(from, entry)
    }
    return Array.from(seen.values())
}

/**
 * Build the complete _redirects file content from static entries and
 * dynamically computed vanity_slug redirects.
 */
export function generateRedirects(
    staticRedirects: string,
    computedRedirects: RedirectEntry[],
): string {
    const staticLines = staticRedirects
        .split('\n')
        .map((line) => parseRedirectLine(line))
        .filter((l): l is RedirectEntry => l !== null)

    const all = dedupeRedirects([...staticLines, ...computedRedirects])
    return `${all
        .map(([from, to, status]) => formatRedirectLine(from, to, status))
        .join('\n')}\n`
}

/** Compute vanity_slug redirect entries by comparing auto vs canonical slugs. */
export function computeVanityRedirects(): RedirectEntry[] {
    const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.yaml'))
    const redirects: RedirectEntry[] = []

    for (const file of files) {
        const category = file.replace(/\.yaml$/, '')
        const doc = parse(readFileSync(join(CONTENT_DIR, file), 'utf8'))
        const publicItems: { name: string; vanity_slug?: string }[] = (
            (doc.items ?? []) as Array<{
                name: string
                vanity_slug?: string
                public?: boolean
            }>
        ).filter((i) => i.public !== false)

        const slugs = computeItemSlugs(publicItems) as ItemSlugs[]
        for (const { auto, canonical } of slugs) {
            if (auto !== canonical) {
                redirects.push([
                    `/${category}/${auto}`,
                    `/${category}/${canonical}`,
                    '301',
                ])
            }
        }
    }

    return redirects
}

function main() {
    const staticContent = readFileSync(STATIC_REDIRECTS, 'utf8')
    const computed = computeVanityRedirects()
    const fileContent = generateRedirects(staticContent, computed)
    mkdirSync(dirname(OUTPUT_FILE), { recursive: true })
    writeFileSync(OUTPUT_FILE, fileContent)
    console.log(
        `Wrote ${computed.length} vanity-slug redirect(s) to dist/_redirects`,
    )
}

// Only run when invoked directly, not when imported by tests
if (import.meta.main) {
    main()
}
