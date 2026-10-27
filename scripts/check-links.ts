#!/usr/bin/env bun

/**
 * Local link checker - parses dist/ HTML and markdown for external links,
 * tests them against the live web, and reports failures.
 *
 * Policy: 404/410 = gone (dead), 401/403 = private/restricted (inaccessible),
 * DNS resolution failure = dns-failed. 405/429 and 5xx are treated as OK
 * (temporary/method). Redirects are not followed (SSRF guard). .linkcheckignore
 * patterns are skipped. Private/internal addresses are blocked.
 */

import { lookup } from 'node:dns/promises'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

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
            const url = raw.replace(/\\n$/, '').trim()
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

async function isInternalURL(url: string): Promise<boolean> {
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

async function checkUrl(
    url: string,
): Promise<{ status: number | null; error: string | null }> {
    if (await isInternalURL(url)) {
        return { status: null, error: 'skipped: private/internal address' }
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

            return { status: res.status, error: null }
        } catch (e) {
            lastError = e instanceof Error ? e.message : String(e)
            if (attempt < MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
            }
        } finally {
            clearTimeout(timer)
        }
    }

    return { status: null, error: lastError }
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
            const { status, error } = await checkUrl(url)
            for (const source of sources) {
                results.push({ url, source, status, error })
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

async function main() {
    const start = Date.now()

    console.log('Scanning dist/ for external links...\n')

    const links = getExternalLinks()
    if (links.size === 0) {
        console.log('  No external links found.')
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

    process.exit(uniqueFailures.length > 0 ? 1 : 0)
}

main()
