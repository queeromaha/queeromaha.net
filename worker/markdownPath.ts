// Maps an HTML page path to its pre-built markdown counterpart. The root
// page can't use `${pathname}.md` (that's the dotfile `/.md`, which isn't
// served as a page), so it gets an explicit `index.md`. Directory-style
// paths (`/art/`, which static assets serve with a trailing slash) map to
// the same file as `/art`.
export function markdownPathFor(pathname: string): string {
    const trimmed = pathname.replace(/\/+$/, '')
    return trimmed === '' ? '/index.md' : `${trimmed}.md`
}
