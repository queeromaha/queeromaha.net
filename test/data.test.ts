import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { parse as parseYaml } from 'yaml'
import tagMap from '#data/tagMap.json' with { type: 'json' }
import { canonicalize } from '../scripts/helpers/yaml.helper'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONTENT_DIR = join(ROOT, 'src', 'content', 'pages')

// ---------------------------------------------------------------------------
// Fancy filter icons
// ---------------------------------------------------------------------------

describe('tagMap.json', () => {
    test('is a non-empty object', () => {
        expect(typeof tagMap).toBe('object')
        expect(tagMap).not.toBeNull()
        expect(Object.keys(tagMap).length).toBeGreaterThan(0)
    })

    test('every value has icon and label strings', () => {
        for (const [key, value] of Object.entries(tagMap)) {
            expect(typeof value.icon, `${key} missing icon`).toBe('string')
            expect(value.icon.length).toBeGreaterThan(0)
            expect(typeof value.label, `${key} missing label`).toBe('string')
            expect(value.label.length).toBeGreaterThan(0)
        }
    })
})

// ---------------------------------------------------------------------------
//  YAML source files
// ---------------------------------------------------------------------------

describe('yaml source files', () => {
    const validTags = new Set(Object.keys(tagMap))

    const yamlFiles = readdirSync(CONTENT_DIR).filter((f) =>
        f.endsWith('.yaml'),
    )

    test('there is at least one yaml file', () => {
        expect(yamlFiles.length).toBeGreaterThan(0)
    })

    for (const file of yamlFiles) {
        const raw = readFileSync(join(CONTENT_DIR, file), 'utf8')
        const data = parseYaml(raw)

        describe(file, () => {
            test('is canonically formatted', () => {
                const result = canonicalize(raw)
                if ('error' in result) throw new Error(result.error)
                expect(
                    result.canonical,
                    'not canonically formatted - run `bun run format`',
                ).toBe(raw)
            })

            test('has a title', () => {
                expect(typeof data.title).toBe('string')
                expect(data.title.length).toBeGreaterThan(0)
            })

            if (!data.items) return

            test('all items have a name', () => {
                for (const item of data.items) {
                    expect(typeof item.name, 'item missing name').toBe('string')
                    expect(item.name.length).toBeGreaterThan(0)
                }
            })

            test('tags reference known tagMap keys', () => {
                for (const item of data.items) {
                    if (!item.tags) continue
                    for (const tag of item.tags) {
                        expect(
                            validTags.has(tag),
                            `"${item.name}" uses unknown tag: ${tag}`,
                        ).toBe(true)
                    }
                }
            })

            test('links have label and parseable url', () => {
                for (const item of data.items) {
                    if (!item.links) continue
                    for (const link of item.links) {
                        expect(
                            typeof link.label,
                            `link in "${item.name}" missing label`,
                        ).toBe('string')
                        expect(link.label.length).toBeGreaterThan(0)
                        expect(
                            typeof link.url,
                            `link in "${item.name}" missing url`,
                        ).toBe('string')
                        expect(() => new URL(link.url)).not.toThrow(
                            `"${item.name}" > "${link.label}" has unparseable URL: ${link.url}`,
                        )
                    }
                }
            })

            test('location google_maps_url is parseable when present', () => {
                for (const item of data.items) {
                    if (!item.location?.google_maps_url) continue
                    expect(
                        () => new URL(item.location.google_maps_url),
                    ).not.toThrow(
                        `"${item.name}" has unparseable google_maps_url: ${item.location.google_maps_url}`,
                    )
                }
            })

            test('no duplicate item names', () => {
                const seen = new Set()
                for (const item of data.items) {
                    expect(
                        seen.has(item.name),
                        `duplicate item name: "${item.name}"`,
                    ).toBe(false)
                    seen.add(item.name)
                }
            })

            test('recurring_events have required fields and valid formats', () => {
                for (const item of data.items) {
                    if (!item.recurring_events) continue
                    for (const evt of item.recurring_events) {
                        const ctx = `"${item.name}" recurring event "${evt.summary}"`
                        expect(
                            typeof evt.summary,
                            `${ctx}: missing summary`,
                        ).toBe('string')
                        expect(evt.summary.length).toBeGreaterThan(0)
                        expect(typeof evt.rrule, `${ctx}: missing rrule`).toBe(
                            'string',
                        )
                        expect(evt.rrule.length).toBeGreaterThan(0)
                        expect(
                            typeof evt.dtstart,
                            `${ctx}: missing dtstart`,
                        ).toBe('string')
                        expect(
                            evt.dtstart,
                            `${ctx}: dtstart must be YYYYMMDD`,
                        ).toMatch(/^\d{8}$/)
                        expect(typeof evt.time, `${ctx}: missing time`).toBe(
                            'string',
                        )
                        expect(evt.time, `${ctx}: time must be HH:MM`).toMatch(
                            /^\d{1,2}:\d{2}$/,
                        )
                        if (evt.end_time !== undefined) {
                            expect(
                                evt.end_time,
                                `${ctx}: end_time must be HH:MM`,
                            ).toMatch(/^\d{1,2}:\d{2}$/)
                        }
                        if (evt.url !== undefined) {
                            expect(() => new URL(evt.url)).not.toThrow(
                                `${ctx}: unparseable url`,
                            )
                        }
                    }
                }
            })
        })
    }
})
