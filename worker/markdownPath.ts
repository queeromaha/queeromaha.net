// When and where an HTML page request is answered with its pre-built
// markdown counterpart; shared by the Worker and the Netlify edge function
// so both edges negotiate the same way during the blue/green cutover.

// Paths ending in a real file extension (images, .xml, .txt, the .md files
// themselves) are served as-is; only the extensionless HTML pages have a
// markdown twin.
export const HAS_EXTENSION = /\.[a-zA-Z0-9]+$/

/** An extensionless page request whose Accept header names text/markdown. */
export function wantsMarkdown(request: Request): boolean {
    if (HAS_EXTENSION.test(new URL(request.url).pathname)) return false
    return (request.headers.get('accept') ?? '').includes('text/markdown')
}

// Maps an HTML page path to its pre-built markdown counterpart. The root
// page can't use `${pathname}.md` (that's the dotfile `/.md`, which isn't
// served as a page), so it gets an explicit `index.md`. Directory-style
// paths (`/art/`, which static assets serve with a trailing slash) map to
// the same file as `/art`.
export function markdownPathFor(pathname: string): string {
    const trimmed = pathname.replace(/\/+$/, '')
    return trimmed === '' ? '/index.md' : `${trimmed}.md`
}
