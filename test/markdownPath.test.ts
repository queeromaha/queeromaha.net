import { describe, expect, test } from 'vitest'
import { markdownPathFor, wantsMarkdown } from '../worker/markdownPath.ts'

describe('markdownPathFor', () => {
    test('maps root to index.md, not the unservable /.md', () => {
        expect(markdownPathFor('/')).toBe('/index.md')
    })
    test('appends .md to category and item paths', () => {
        expect(markdownPathFor('/art')).toBe('/art.md')
        expect(markdownPathFor('/art/bemis-center')).toBe(
            '/art/bemis-center.md',
        )
    })
    test('ignores a trailing slash', () => {
        expect(markdownPathFor('/art/')).toBe('/art.md')
        expect(markdownPathFor('/art/bemis-center/')).toBe(
            '/art/bemis-center.md',
        )
    })
})

describe('wantsMarkdown', () => {
    const req = (path: string, accept?: string) =>
        new Request(`https://queeromaha.dev${path}`, {
            headers: accept ? { accept } : {},
        })
    test('negotiates extensionless pages that accept markdown', () => {
        expect(wantsMarkdown(req('/art/', 'text/markdown'))).toBe(true)
        expect(wantsMarkdown(req('/', 'text/html, text/markdown'))).toBe(true)
    })
    test('leaves HTML-only requests and file paths alone', () => {
        expect(wantsMarkdown(req('/art/', 'text/html'))).toBe(false)
        expect(wantsMarkdown(req('/art/'))).toBe(false)
        expect(wantsMarkdown(req('/og-image.png', 'text/markdown'))).toBe(false)
        expect(wantsMarkdown(req('/art.md', 'text/markdown'))).toBe(false)
    })
})
