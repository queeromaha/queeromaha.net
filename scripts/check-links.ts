#!/usr/bin/env bun

/**
 * Local link checker - parses dist/ HTML and markdown for external links,
 * tests them against the live web, and reports failures.
 *
 * Policy: 404/410 = gone (dead), 401/403 = private/restricted (inaccessible),
 * DNS resolution failure = dns-failed. 405/429 and 5xx are treated as OK
 * (temporary/method). Redirects are not followed (SSRF guard). .linkcheckignore
 * patterns are skipped. Private/internal addresses are blocked.
 *
 * Two softer labels never affect the exit code but are reported (and written
 * to the --json report) for triage: `moved` (a 3xx that changes site or goes
 * to a parking host) and `suspect` (a 200 whose page looks parked, expired or
 * like a hosting provider's own 404). Rules live in helpers/linkHeuristics.ts.
 *
 * Usage: bun scripts/check-links.ts [--json <path>]
 */

import { lookup } from 'node:dns/promises'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import {
    BODY_SAMPLE_BYTES,
    classifyRedirect,
    detectSignals,
} from './helpers/linkHeuristics.ts'

const DIST_DIR = 'dist'
const MD_LINK_RE = /\[[^\]]*\]\((https?:\/\/[^)]+)\)/g
const HTML_HREF_RE = /<a\s[^>]*href="(https?:\/\/[^"]+)"/g
const IGNORE_RE: RegExp[] = loadIgnorePatterns()

const DEAD_STATUS = new Set([404, 410])
const INACCESSIBLE_STATUS = new Set([401, 403])

const CONCURRENCY = 16
const TIMEOUT_MS = 15_000
const MAX_RETRIES = 2

interface LinkResult {
    url: string
    source: string
    status: number | null
    error: string | null
    /** Location header of a 3xx response */
    location: string | null
    /** Soft-failure signals found in a 200 response body */
    signals: string[]
}

interface Finding {
    url: string
    label: 'dead' | 'inaccessible' | 'dns-failed' | 'moved' | 'suspect'
    status: number | null
    /** Why this was flagged, for soft labels */
    reason: string | null
    location: string | null
    sources: string[]
}

function loadIgnorePatterns(): RegExp[] {
    try {
        const content = readFileSync('.linkcheckignore', 'utf8')
        return content
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('#'))
            .map((pattern) => {
                const cleaned = pattern.replace(/\s.*$/, '')
                try {
                    return new RegExp(cleaned)
                } catch {
                    return null
                }
            })
            .filter((r): r is RegExp => r !== null)
    } catch {
        return []
    }
}

function shouldIgnore(url: string): boolean {
    return IGNORE_RE.some((re) => re.test(url))
}

function* walkDir(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            yield* walkDir(full)
        } else if (entry.name.endsWith('.html') || entry.name.endsWith('.md')) {
            yield full
        }
    }
}

function extractLinks(content: string, isMarkdown: boolean): string[] {
    const re = isMarkdown ? MD_LINK_RE : HTML_HREF_RE
    const links: string[] = []
    let match = re.exec(content)
    while (match !== null) {
        links.push(match[1])
        match = re.exec(content)
    }
    return links
}

function getExternalLinks(): Map<string, Set<string>> {
    const urls = new Map<string, Set<string>>()

    for (const file of walkDir(DIST_DIR)) {
        const content = readFileSync(file, 'utf8')
        const isMarkdown = file.endsWith('.md')
        const links = extractLinks(content, isMarkdown)

        for (const raw of links) {
            // hrefs are HTML-escaped in dist/; fetch (and report) the real URL
            const url = raw.replace(/\\n$/, '').replace(/&amp;/g, '&').trim()
            if (!url.startsWith('http')) continue
            if (shouldIgnore(url)) continue

            const relPath = relative(process.cwd(), file)
            const existing = urls.get(url)
            if (!existing) {
                urls.set(url, new Set([relPath]))
            } else {
                existing.add(relPath)
            }
        }
    }

    return urls
}

const PRIVATE_NETS = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
    /^0\.0\.0\.0$/,
]

function isPrivateIP(ip: string): boolean {
    return PRIVATE_NETS.some((re) => re.test(ip))
}

export async function isInternalURL(url: string): Promise<boolean> {
    try {
        const { hostname } = new URL(url)
        if (hostname === 'localhost' || hostname.endsWith('.local')) {
            return true
        }
        if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
            return isPrivateIP(hostname)
        }
        const addresses = await lookup(hostname, { all: true })
        return addresses.some((a) => isPrivateIP(a.address))
    } catch {
        return false
    }
}

type CheckOutcome = Pick<
    LinkResult,
    'status' | 'error' | 'location' | 'signals'
>

/** Reads up to BODY_SAMPLE_BYTES of a response, then abandons the rest. */
export async function readSample(res: Response): Promise<string> {
    if (!res.body) return ''
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    let bytes = 0
    try {
        while (bytes < BODY_SAMPLE_BYTES) {
            const { done, value } = await reader.read()
            if (done) break
            bytes += value.byteLength
            text += decoder.decode(value, { stream: true })
        }
    } finally {
        await reader.cancel().catch(() => {})
    }
    return text
}

async function checkUrl(url: string): Promise<CheckOutcome> {
    if (await isInternalURL(url)) {
        return {
            status: null,
            error: 'skipped: private/internal address',
            location: null,
            signals: [],
        }
    }

    let lastError: string | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
        try {
            const res = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (compatible; link-checker/1.0; +https://github.com/taraxvoid/queeromaha)',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                redirect: 'manual',
            })

            let signals: string[] = []
            if (
                res.status === 200 &&
                (res.headers.get('content-type') ?? '').includes('html')
            ) {
                signals = detectSignals(await readSample(res))
            } else {
                await res.body?.cancel().catch(() => {})
            }
            return {
                status: res.status,
                error: null,
                location: res.headers.get('location'),
                signals,
            }
        } catch (e) {
            lastError = e instanceof Error ? e.message : String(e)
            if (attempt < MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
            }
        } finally {
            clearTimeout(timer)
        }
    }

    return { status: null, error: lastError, location: null, signals: [] }
}

async function checkAllLinks(
    urls: Map<string, Set<string>>,
): Promise<LinkResult[]> {
    const entries = [...urls.entries()]
    const results: LinkResult[] = []
    let completed = 0
    const total = entries.length

    async function worker() {
        while (entries.length > 0) {
            const entry = entries.shift()
            if (!entry) break
            const [url, sources] = entry
            const outcome = await checkUrl(url)
            for (const source of sources) {
                results.push({ url, source, ...outcome })
            }
            completed++
            process.stdout.write(`\r  Testing links: ${completed}/${total}`)
        }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => worker())
    await Promise.all(workers)
    process.stdout.write('\n')

    return results
}

interface Report {
    tested: number
    findings: Finding[]
    unreachable: { url: string; error: string; sources: string[] }[]
}

/** `--json <path>`: also write the findings as machine-readable JSON. */
function writeReport(report: Report) {
    const flag = process.argv.indexOf('--json')
    const path = flag === -1 ? undefined : process.argv[flag + 1]
    if (!path) return
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
}

async function main() {
    const start = Date.now()

    console.log('Scanning dist/ for external links...\n')

    const links = getExternalLinks()
    if (links.size === 0) {
        console.log('  No external links found.')
        writeReport({ tested: 0, findings: [], unreachable: [] })
        process.exit(0)
    }

    console.log(`  Found ${links.size} unique external links\n`)

    const results = await checkAllLinks(links)

    const isDNSError = (error: string | null): boolean => {
        return error?.includes('ENOTFOUND') ?? false
    }

    const failures = results.filter((r) => {
        if (r.error?.includes('abort')) return false
        if (r.error?.includes('skipped:')) return false
        if (r.status === null) return isDNSError(r.error)
        return DEAD_STATUS.has(r.status) || INACCESSIBLE_STATUS.has(r.status)
    })

    const networkErrors = results.filter(
        (r) =>
            r.error !== null &&
            !r.error.includes('skipped:') &&
            !isDNSError(r.error) &&
            r.status === null,
    )

    const failureMap = new Map<
        string,
        { status: number | null; label: string; sources: string[] }
    >()
    for (const f of failures) {
        if (f.status === null && !isDNSError(f.error)) continue
        const label = isDNSError(f.error)
            ? 'dns-failed'
            : f.status !== null && DEAD_STATUS.has(f.status)
              ? 'dead'
              : 'inaccessible'
        const existing = failureMap.get(f.url)
        if (existing) {
            existing.sources.push(f.source)
        } else {
            failureMap.set(f.url, {
                status: f.status,
                label,
                sources: [f.source],
            })
        }
    }

    const errorMap = new Map<string, { error: string; sources: string[] }>()
    for (const f of networkErrors) {
        if (!f.error) continue
        const existing = errorMap.get(f.url)
        if (existing) {
            existing.sources.push(f.source)
        } else {
            errorMap.set(f.url, {
                error: f.error,
                sources: [f.source],
            })
        }
    }

    const uniqueFailures = [...failureMap.entries()].map(
        ([url, { status, label, sources }]) => ({
            url,
            status,
            label,
            sources: [...new Set(sources)],
        }),
    )

    const softMap = new Map<string, Finding>()
    for (const r of results) {
        let label: Finding['label'] | null = null
        let reason: string | null = null
        if (r.status !== null && r.status >= 300 && r.status < 400) {
            reason = classifyRedirect(r.url, r.status, r.location)
            label = 'moved'
        } else if (r.status === 200 && r.signals.length > 0) {
            reason = `page looks gone or parked (${r.signals.join(', ')})`
            label = 'suspect'
        }
        if (!label || !reason) continue
        const existing = softMap.get(r.url)
        if (existing) {
            existing.sources.push(r.source)
        } else {
            softMap.set(r.url, {
                url: r.url,
                label,
                status: r.status,
                reason,
                location: r.location,
                sources: [r.source],
            })
        }
    }
    const softFindings = [...softMap.values()].map((f) => ({
        ...f,
        sources: [...new Set(f.sources)],
    }))

    const skippedUrls = new Set(
        results.filter((r) => r.error?.includes('skipped:')).map((r) => r.url),
    )

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)

    const RED = '\x1b[31m'
    const YELLOW = '\x1b[33m'
    const DIM = '\x1b[2m'
    const BOLD = '\x1b[1m'
    const RESET = '\x1b[0m'

    const labelColor: Record<string, string> = {
        dead: RED,
        inaccessible: YELLOW,
        'dns-failed': RED,
    }

    const printSources = (sources: string[]) => {
        const shown = sources.slice(0, 8)
        for (const s of shown) {
            console.log(`      ${DIM}${s}${RESET}`)
        }
        if (sources.length > shown.length) {
            console.log(
                `      ${DIM}...and ${sources.length - shown.length} more${RESET}`,
            )
        }
    }

    if (uniqueFailures.length > 0) {
        const byLabel: Record<string, typeof uniqueFailures> = {}
        for (const f of uniqueFailures) {
            if (!byLabel[f.label]) byLabel[f.label] = []
            byLabel[f.label].push(f)
        }

        console.log(`${BOLD}Failed links:${RESET}\n`)

        for (const label of ['dead', 'inaccessible', 'dns-failed']) {
            const items = byLabel[label]
            if (!items || items.length === 0) continue
            const color = labelColor[label] ?? ''
            console.log(`  ${color}${BOLD}${items.length} ${label}${RESET}`)
            for (const f of items) {
                const code = f.status ?? 'DNS'
                console.log(
                    `\n    ${color}[${code}]${RESET} ${BOLD}${f.url}${RESET}`,
                )
                console.log(
                    `    ${DIM}${f.sources.length} page${f.sources.length === 1 ? '' : 's'}:${RESET}`,
                )
                printSources(f.sources)
            }
            console.log()
        }
    }

    if (softFindings.length > 0) {
        console.log(`${BOLD}Worth a look (does not fail the check):${RESET}\n`)
        for (const f of softFindings) {
            console.log(
                `  ${YELLOW}[${f.label}]${RESET} ${BOLD}${f.url}${RESET}`,
            )
            console.log(`    ${f.reason}`)
            printSources(f.sources)
            console.log()
        }
    }

    if (errorMap.size > 0) {
        console.log(`${BOLD}Unreachable (skipped):${RESET}\n`)
        for (const [url, { error, sources }] of errorMap) {
            console.log(`  ${DIM}${url}${RESET}`)
            console.log(`    ${error}`)
            console.log(
                `    ${DIM}${sources.length} page${sources.length === 1 ? '' : 's'}:${RESET}`,
            )
            printSources(sources)
            console.log()
        }
    }

    const deadCount = uniqueFailures.filter((f) => f.label === 'dead').length
    const inaccessibleCount = uniqueFailures.filter(
        (f) => f.label === 'inaccessible',
    ).length
    const dnsCount = uniqueFailures.filter(
        (f) => f.label === 'dns-failed',
    ).length

    console.log(`${BOLD}Summary${RESET}`)
    console.log(
        `  ${DIM}Tested:${RESET} ${links.size} unique URLs in ${elapsed}s`,
    )
    if (deadCount > 0) console.log(`  ${RED}Dead:${RESET} ${deadCount}`)
    if (inaccessibleCount > 0)
        console.log(`  ${YELLOW}Inaccessible:${RESET} ${inaccessibleCount}`)
    if (dnsCount > 0) console.log(`  ${RED}DNS failed:${RESET} ${dnsCount}`)
    if (errorMap.size > 0)
        console.log(`  ${DIM}Unreachable:${RESET} ${errorMap.size}`)
    if (skippedUrls.size > 0)
        console.log(`  ${DIM}Blocked (private IP):${RESET} ${skippedUrls.size}`)
    if (uniqueFailures.length === 0 && errorMap.size === 0)
        console.log(`  ${DIM}All links passed.${RESET}`)

    if (softFindings.length > 0)
        console.log(`  ${YELLOW}Worth a look:${RESET} ${softFindings.length}`)

    writeReport({
        tested: links.size,
        findings: [
            ...uniqueFailures.map(
                (f): Finding => ({
                    ...f,
                    label: f.label as Finding['label'],
                    reason: null,
                    location: null,
                }),
            ),
            ...softFindings,
        ],
        unreachable: [...errorMap].map(([url, { error, sources }]) => ({
            url,
            error,
            sources: [...new Set(sources)],
        })),
    })

    process.exit(uniqueFailures.length > 0 ? 1 : 0)
}

if (import.meta.main) {
    main()
}
