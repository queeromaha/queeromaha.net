import { describe, expect, test } from 'vitest'
import {
    classifyRedirect,
    detectSignals,
    extractTitle,
    visibleText,
} from '../scripts/helpers/linkHeuristics.ts'

describe('classifyRedirect', () => {
    test('flags a permanent move to another domain', () => {
        expect(
            classifyRedirect(
                'https://old.example/a',
                301,
                'https://new.example/a',
            ),
        ).toBe('moved permanently to new.example')
        expect(
            classifyRedirect(
                'https://old.example/',
                308,
                'https://new.example/',
            ),
        ).toBe('moved permanently to new.example')
    })

    test('ignores http to https and www normalisation', () => {
        expect(
            classifyRedirect(
                'http://example.com/a',
                301,
                'https://example.com/a',
            ),
        ).toBeNull()
        expect(
            classifyRedirect(
                'https://example.com/a',
                301,
                'https://www.example.com/a',
            ),
        ).toBeNull()
        expect(
            classifyRedirect('https://www.example.com/a', 301, '/a/'),
        ).toBeNull()
    })

    test('flags a permanent redirect that drops a deep link to the root', () => {
        expect(
            classifyRedirect('https://example.com/shows/2019', 301, '/'),
        ).toBe('permanent redirect drops the path to the site root')
    })

    test('ignores temporary cross-domain redirects', () => {
        expect(
            classifyRedirect('https://a.example/', 302, 'https://b.example/'),
        ).toBeNull()
    })

    test('flags any redirect into a parking host', () => {
        expect(
            classifyRedirect(
                'https://a.example/',
                302,
                'https://x.sedoparking.com/y',
            ),
        ).toBe('redirects to parking host x.sedoparking.com')
    })

    test('ignores non-redirects and unparseable locations', () => {
        expect(classifyRedirect('https://a.example/', 200, null)).toBeNull()
        expect(classifyRedirect('https://a.example/', 301, null)).toBeNull()
        expect(
            classifyRedirect('not a url', 301, 'https://b.example'),
        ).toBeNull()
    })
})

describe('detectSignals', () => {
    test('detects parked and for-sale domains', () => {
        expect(
            detectSignals(
                '<title>example.com</title><h1>This domain is for sale</h1>',
            ),
        ).toContain('for-sale')
        expect(
            detectSignals('<p>This domain is currently parked</p>'),
        ).toContain('parked')
    })

    test('detects hosting-provider shadow 404s', () => {
        expect(
            detectSignals(
                "<h1>404</h1><p>There isn't a GitHub Pages site here.</p>",
            ),
        ).toContain('provider-404')
        expect(
            detectSignals('<p>Sorry, this shop is currently unavailable.</p>'),
        ).toContain('provider-404')
    })

    test('detects a soft-404 title but not a title that merely contains digits', () => {
        expect(detectSignals('<title>Page Not Found | Foo</title>')).toContain(
            'soft-404-title',
        )
        expect(detectSignals('<title>Shows 2024 - Foo</title>')).toEqual([])
    })

    test('ignores scripts and returns nothing for ordinary pages', () => {
        expect(
            detectSignals(
                '<title>Cafe</title><script>var a="domain is for sale"</script><p>Open daily</p>',
            ),
        ).toEqual([])
    })
})

describe('text extraction', () => {
    test('extractTitle collapses whitespace and decodes entities', () => {
        expect(extractTitle('<title>\n Fish &amp;  Chips </title>')).toBe(
            'Fish & Chips',
        )
        expect(extractTitle('<p>no title</p>')).toBe('')
    })

    test('visibleText strips tags, scripts and control characters, and truncates', () => {
        const html =
            '<style>p{}</style><p>Hello\u0007 <b>world</b></p><script>x()</script>'
        expect(visibleText(html)).toBe('Hello world')
        expect(visibleText('<p>abcdef</p>', 3)).toBe('abc')
    })
})
