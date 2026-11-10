/**
 * Heuristics for links that still answer but are no longer the page they were.
 *
 * Plain status codes miss most real-world link rot: an expired domain serves a
 * 200 "for sale" page, a deleted site on a hosting provider serves that
 * provider's own 404 page (often with a 200), and a rebrand is a 301 to a new
 * domain. Extend these lists as new cases turn up, and add a test case in
 * test/linkHeuristics.test.ts for every entry.
 */

/** Hosts that only exist to park or sell a lapsed domain. */
export const PARKING_HOST_RE =
    /(^|\.)(sedoparking\.com|sedo\.com|parkingcrew\.net|bodis\.com|hugedomains\.com|dan\.com|afternic\.com|above\.com|domainsponsor\.com|parklogic\.com|undeveloped\.com|parkingpage\.namecheap\.com)$/i

/** Phrases that mean "this is not the page you linked to", by signal name. */
export const BODY_SIGNALS: { id: string; re: RegExp }[] = [
    {
        id: 'for-sale',
        re: /(this domain (name )?(is|may be) for sale|domain (name )?is for sale|buy this domain|make an offer on this domain|this domain is available for purchase)/i,
    },
    {
        id: 'parked',
        re: /(domain (is )?(currently )?parked|parked (free|domain)|parking page)/i,
    },
    {
        id: 'expired',
        re: /(this (domain|site) (has )?expired|domain (has )?expired)/i,
    },
    {
        id: 'suspended',
        re: /(account (has been )?suspended|this site (has been|is) (suspended|disabled)|bandwidth limit exceeded)/i,
    },
    {
        // hosting providers' own "nothing here" pages, frequently served as 200
        id: 'provider-404',
        re: /(there isn'?t a github pages site here|no such app|DEPLOYMENT_NOT_FOUND|the deployment could not be found|sorry, this shop is currently unavailable|site not found|domain not configured)/i,
    },
]

/** A <title> that says the page is missing, whatever the status code said. */
export const SOFT_404_TITLE_RE =
    /(^|\W)(404|not found|page (does ?n[o']t|doesn['’]t) exist)(\W|$)/i

/** Bytes of response body worth reading; parked/error pages are tiny. */
export const BODY_SAMPLE_BYTES = 32 * 1024

export function extractTitle(html: string): string {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
    return match ? collapse(decodeEntities(match[1])) : ''
}

/** Visible text, truncated: enough for a human or agent to recognise the page. */
export function visibleText(html: string, max = 300): string {
    const text = html
        .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    return collapse(decodeEntities(text)).slice(0, max)
}

/** Names of the soft-failure signals present in a page, if any. */
export function detectSignals(html: string): string[] {
    const found: string[] = []
    const text = visibleText(html, 4000)
    for (const { id, re } of BODY_SIGNALS) {
        if (re.test(text)) found.push(id)
    }
    if (SOFT_404_TITLE_RE.test(extractTitle(html))) found.push('soft-404-title')
    return found
}

/**
 * Why a 3xx response deserves a human (or agent) look, or null if it is an
 * ordinary redirect. Only permanent redirects that change site, redirects
 * that drop a deep link to the root, and redirects into parking are flagged.
 */
export function classifyRedirect(
    from: string,
    status: number,
    location: string | null,
): string | null {
    if (!location || status < 300 || status >= 400) return null
    let source: URL
    let target: URL
    try {
        source = new URL(from)
        target = new URL(location, source)
    } catch {
        return null
    }
    if (PARKING_HOST_RE.test(target.hostname)) {
        return `redirects to parking host ${target.hostname}`
    }
    if (status !== 301 && status !== 308) return null

    const bare = (h: string) => h.toLowerCase().replace(/^www\./, '')
    if (bare(target.hostname) !== bare(source.hostname)) {
        return `moved permanently to ${target.hostname}`
    }
    const depth = (p: string) => p.split('/').filter(Boolean).length
    if (depth(source.pathname) > 0 && depth(target.pathname) === 0) {
        return 'permanent redirect drops the path to the site root'
    }
    return null
}

/** Replaces control characters (page content is untrusted) with spaces. */
export function stripControl(s: string): string {
    let out = ''
    for (const ch of s) {
        const code = ch.charCodeAt(0)
        out += code < 0x20 || code === 0x7f ? ' ' : ch
    }
    return out
}

function collapse(s: string): string {
    return stripControl(s).replace(/\s+/g, ' ').trim()
}

function decodeEntities(s: string): string {
    return s
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;|&apos;/gi, "'")
        .replace(/&rsquo;/gi, '’')
}
