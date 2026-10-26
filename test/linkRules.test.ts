import { describe, expect, test } from 'vitest'
import { matchRule, resolveLink } from '#utils/linkRules.ts'

describe('resolveLink', () => {
    test('unmatched links fall back to a generic link icon', () => {
        const link = { label: 'Something Else', url: 'https://example.com' }
        expect(matchRule(link.url, link.label.toLowerCase())).toBeNull()
        expect(resolveLink(link).icon).toEqual({ name: 'fa7-solid:link' })
    })

    test('bespoke booking links get the register icon', () => {
        const link = {
            label: 'PWYC Mad Folx class',
            url: 'https://anandaomaha.as.me/schedule/80efeafb/',
        }
        expect(resolveLink(link).icon).toEqual({
            name: 'fa7-solid:square-check',
        })
    })

    test('bare as.me host also gets the register icon', () => {
        const link = { label: 'Book', url: 'https://anandaomaha.as.me' }
        expect(resolveLink(link).icon).toEqual({
            name: 'fa7-solid:square-check',
        })
    })

    test('radio and bowl match whole words only', () => {
        const fallback = { name: 'fa7-solid:link' }
        const url = 'https://example.com'
        expect(resolveLink({ label: 'Radiology', url }).icon).toEqual(fallback)
        expect(resolveLink({ label: 'Superbowl', url }).icon).toEqual(fallback)
        expect(resolveLink({ label: 'Radio', url }).icon).toEqual({
            name: 'fa7-solid:radio',
        })
        expect(resolveLink({ label: 'Bowling', url }).icon).toEqual({
            name: 'fa7-solid:bowling-ball',
        })
    })

    test('canonical kinds keep their rank', () => {
        expect(
            resolveLink({
                label: 'Events',
                url: 'https://example.com/events',
            }).rank,
        ).toBe(0)
        expect(
            resolveLink({ label: 'Other', url: 'https://example.com' }).rank,
        ).toBe(5)
    })
})
