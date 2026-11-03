#!/usr/bin/env bun

/**
 * Gathers evidence about the links check-links.ts flagged, so the triage
 * agent (.github/workflows/check-links.md) can decide what to do without
 * network access of its own. Runs on the runner, outside the agent sandbox.
 *
 * For each finding: the redirect chain and what the final page says, whether
 * the site root is alive (path died vs. whole site died), DNS state, the
 * closest Wayback Machine snapshot, and which YAML item(s) contain the URL.
 *
 * Everything fetched from the web is untrusted: snippets are short, stripped
 * of control characters, and only ever stored as JSON strings.
 *
 * Usage: bun scripts/link-evidence.ts <report.json> <evidence.json>
 */

import { lookup, resolveNs } from 'node:dns/promises'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse } from 'yaml'
import { isInternalURL, readSample } from './check-links.ts'
import {
    detectSignals,
    extractTitle,
    stripControl,
    visibleText,
} from './helpers/linkHeuristics.ts'

const PAGES_DIR = 'src/content/pages'
const MAX_FINDINGS = 40
const MAX_HOPS = 6
const TIMEOUT_MS = 15_000
const CONCURRENCY = 8
/** If this share of tested links is dead/unresolvable, blame the runner. */
const NETWORK_SUSPECT_RATIO = 0.25

interface Hop {
    url: string
    status: number | null
    location: string | null
    error: string | null
}

interface Landing {
    url: string
    status: number
    title: string
    text: string
    signals: string[]
}

interface Probe {
    chain: Hop[]
    landing: Landing | null
}

interface ReportFinding {
    url: string
    label: string
    status: number | null
    reason: string | null
    location: string | null
    sources: string[]
}

interface YamlMatch {
    file: string
    index: number
    name: string
    public: boolean
    path: string
    linkCount: number
    otherLinks: { label: string; url: string }[]
}

function clean(s: string | null | undefined, max = 300): string {
    return stripControl(s ?? '').slice(0, max)
}

async function probe(start: string): Promise<Probe> {
    const chain: Hop[] = []
    let url = start
    for (let i = 0; i < MAX_HOPS; i++) {
        if (!/^https?:\/\//.test(url)) break
        if (await isInternalURL(url)) {
            chain.push({
                url,
                status: null,
                location: null,
                error: 'skipped: private/internal address',
            })
            break
        }
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
        try {
            const res = await fetch(url, {
                signal: controller.signal,
                redirect: 'manual',
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (compatible; link-checker/1.0; +https://github.com/taraxvoid/queeromaha)',
                    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
                },
            })
            const location = res.headers.get('location')
            chain.push({ url, status: res.status, location, error: null })
            if (res.status >= 300 && res.status < 400 && location) {
                await res.body?.cancel().catch(() => {})
                url = new URL(location, url).toString()
                continue
            }
            const isHtml = (res.headers.get('content-type') ?? '').includes(
                'html',
            )
            const html = isHtml ? await readSample(res) : ''
            await res.body?.cancel().catch(() => {})
            return {
                chain,
                landing: {
                    url,
                    status: res.status,
                    title: clean(extractTitle(html), 200),
                    text: clean(visibleText(html, 300)),
                    signals: detectSignals(html),
                },
            }
        } catch (e) {
            chain.push({
                url,
                status: null,
                location: null,
                error: clean(e instanceof Error ? e.message : String(e), 200),
            })
            break
        } finally {
            clearTimeout(timer)
        }
    }
    return { chain, landing: null }
}

async function dnsState(host: string) {
    const result: { resolves: boolean; code: string | null; ns: string[] } = {
        resolves: false,
        code: null,
        ns: [],
    }
    try {
        await lookup(host)
        result.resolves = true
    } catch (e) {
        result.code = (e as NodeJS.ErrnoException).code ?? 'ERROR'
    }
    try {
        result.ns = await resolveNs(host)
    } catch {
        // no NS records is itself a signal; leave empty
    }
    return result
}

async function wayback(url: string) {
    try {
        const res = await fetch(
            `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
            { signal: AbortSignal.timeout(10_000) },
        )
        const data = (await res.json()) as {
            archived_snapshots?: {
                closest?: { url: string; timestamp: string; status: string }
            }
        }
        const closest = data.archived_snapshots?.closest
        return closest
            ? {
                  url: closest.url,
                  timestamp: closest.timestamp,
                  status: closest.status,
              }
            : null
    } catch {
        return null
    }
}

/** Finds every item in the content YAML that contains this exact URL. */
function locate(url: string): YamlMatch[] {
    const matches: YamlMatch[] = []
    for (const file of readdirSync(PAGES_DIR).filter((f) =>
        f.endsWith('.yaml'),
    )) {
        const path = join(PAGES_DIR, file)
        const doc = parse(readFileSync(path, 'utf8')) as {
            items?: Record<string, unknown>[]
        } | null
        for (const [index, item] of (doc?.items ?? []).entries()) {
            const found = findString(item, url, '')
            if (!found) continue
            const links = Array.isArray(item.links)
                ? (item.links as { label?: string; url?: string }[])
                : []
            matches.push({
                file: path,
                index,
                name: String(item.name ?? ''),
                public: item.public !== false,
                path: found,
                linkCount: links.length,
                otherLinks: links
                    .filter((l) => l.url && l.url !== url)
                    .map((l) => ({
                        label: String(l.label ?? ''),
                        url: String(l.url),
                    })),
            })
        }
    }
    return matches
}

function findString(
    node: unknown,
    needle: string,
    path: string,
): string | null {
    if (typeof node === 'string') return node === needle ? path : null
    if (Array.isArray(node)) {
        for (const [i, v] of node.entries()) {
            const hit = findString(v, needle, `${path}[${i}]`)
            if (hit) return hit
        }
    } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
            const hit = findString(v, needle, path ? `${path}.${k}` : k)
            if (hit) return hit
        }
    }
    return null
}

async function mapPool<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const out: R[] = new Array(items.length)
    let next = 0
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (next < items.length) {
                const i = next++
                out[i] = await fn(items[i])
            }
        }),
    )
    return out
}

async function evidenceFor(f: ReportFinding) {
    const { hostname, origin } = new URL(f.url)
    const root = `${origin}/`
    const [followed, rootProbe, dns, snapshot] = await Promise.all([
        probe(f.url),
        f.url === root ? Promise.resolve(null) : probe(root),
        dnsState(hostname),
        wayback(f.url),
    ])
    return {
        url: f.url,
        label: f.label,
        status: f.status,
        reason: f.reason,
        sources: f.sources.slice(0, 5),
        yaml: locate(f.url),
        chain: followed.chain,
        landing: followed.landing,
        siteRoot: rootProbe
            ? {
                  chain: rootProbe.chain,
                  landing: rootProbe.landing,
              }
            : null,
        dns,
        wayback: snapshot,
    }
}

async function main() {
    const [reportPath, outPath] = process.argv.slice(2)
    if (!reportPath || !outPath) {
        console.error(
            'usage: bun scripts/link-evidence.ts <report.json> <evidence.json>',
        )
        process.exit(2)
    }

    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        tested: number
        findings: ReportFinding[]
        unreachable: unknown[]
    }

    const broken = report.findings.filter(
        (f) => f.label === 'dead' || f.label === 'dns-failed',
    ).length
    const networkSuspect =
        report.tested > 0 &&
        (broken + report.unreachable.length) / report.tested >
            NETWORK_SUSPECT_RATIO

    const selected = report.findings.slice(0, MAX_FINDINGS)
    const items = networkSuspect
        ? []
        : await mapPool(selected, CONCURRENCY, evidenceFor)

    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(
        outPath,
        `${JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                tested: report.tested,
                totalFindings: report.findings.length,
                truncated: report.findings.length > selected.length,
                networkSuspect,
                items,
            },
            null,
            2,
        )}\n`,
    )
    console.log(
        `Wrote evidence for ${items.length}/${report.findings.length} findings to ${outPath}` +
            (networkSuspect ? ' (network suspect: skipped)' : ''),
    )
}

if (import.meta.main) {
    main()
}
