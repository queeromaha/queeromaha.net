// Deliberately not America/Chicago: dtstart values are always Chicago
// wall-clock, so running the suite under a different system timezone
// catches any code that (bug-prone) reads the visitor's own local time
// instead of converting through the IANA tz database.
process.env.TZ = 'America/Los_Angeles'

import { RRule } from 'rrule'
import { describe, expect, test } from 'vitest'
import {
    fakeUtc,
    getUpcomingEvents,
    parseEvents,
} from '#utils/eventsPreview.ts'
import { generateFeedICS } from '#utils/ical.ts'

// Builds a real UTC instant from a wall-clock time expressed in
// America/Chicago (matching how dtstart is always specified), regardless
// of the test runner's system timezone.
function chicagoNow(wallClock: string): Date {
    // Treat the wall-clock as UTC, then shift by Chicago's offset at that
    // point; the second pass corrects guesses that straddle a DST change.
    const target = new Date(`${wallClock}Z`).getTime()
    let instant = target
    for (let i = 0; i < 2; i++) {
        instant += target - fakeUtc(new Date(instant)).getTime()
    }
    return new Date(instant)
}

const baseEvent = {
    summary: 'Test Event',
    rrule: 'FREQ=WEEKLY;BYDAY=WE',
    dtstart: '20250101',
    time: '18:00',
    location: 'Test Location',
}

describe('parseEvents', () => {
    test('parses uid, summary, location, dtstart, and rrule from generated ICS', () => {
        const ics = generateFeedICS([{ uid: 'test-0', event: baseEvent }])
        const events = parseEvents(ics)

        expect(events).toHaveLength(1)
        expect(events[0]).toEqual({
            uid: 'test-0@queeromaha.net',
            summary: 'Test Event',
            location: 'Test Location',
            dtstart: { year: 2025, month: 1, day: 1, hour: 18, minute: 0 },
            rrule: 'FREQ=WEEKLY;BYDAY=WE',
        })
    })

    test('parses multiple VEVENT blocks', () => {
        const ics = generateFeedICS([
            { uid: 'a', event: { ...baseEvent, summary: 'Event A' } },
            { uid: 'b', event: { ...baseEvent, summary: 'Event B' } },
        ])
        const events = parseEvents(ics)
        expect(events.map((e) => e.summary)).toEqual(['Event A', 'Event B'])
    })

    test('event with no LOCATION parses with location undefined', () => {
        const { location, ...withoutLocation } = baseEvent
        const ics = generateFeedICS([{ uid: 'u', event: withoutLocation }])
        const events = parseEvents(ics)
        expect(events[0].location).toBeUndefined()
    })

    test('malformed ICS text returns an empty array instead of throwing', () => {
        expect(parseEvents('not an ics file at all')).toEqual([])
    })

    test('empty VCALENDAR returns an empty array', () => {
        expect(parseEvents(generateFeedICS([]))).toEqual([])
    })
})

describe('getUpcomingEvents', () => {
    test('simple weekly rule returns the next matching weekday', () => {
        const ics = generateFeedICS([{ uid: 'u', event: baseEvent }])
        const events = parseEvents(ics)
        // 2025-01-01 is a Wednesday; ask from the following Monday.
        const now = chicagoNow('2025-01-06T00:00:00')
        const [next] = getUpcomingEvents(events, now, RRule, 1)

        expect(next?.summary).toBe('Test Event')
        expect(next?.location).toBe('Test Location')
        // Wed 2025-01-08, read back via UTC getters (fake-UTC convention).
        expect(next?.start.getUTCFullYear()).toBe(2025)
        expect(next?.start.getUTCMonth()).toBe(0)
        expect(next?.start.getUTCDate()).toBe(8)
        expect(next?.start.getUTCDay()).toBe(3)
        expect(next?.start.getUTCHours()).toBe(18)
    })

    test('monthly nth-weekday rule (1st/3rd Tuesday) picks the correct date', () => {
        const ics = generateFeedICS([
            {
                uid: 'u',
                event: {
                    ...baseEvent,
                    rrule: 'FREQ=MONTHLY;BYDAY=1TU,3TU',
                    dtstart: '20250107',
                },
            },
        ])
        const events = parseEvents(ics)
        // Just after the 1st Tuesday of Jan 2025 (Jan 7) — next should be
        // the 3rd Tuesday (Jan 21).
        const now = chicagoNow('2025-01-08T00:00:00')
        const [next] = getUpcomingEvents(events, now, RRule, 1)

        expect(next?.start.getUTCFullYear()).toBe(2025)
        expect(next?.start.getUTCMonth()).toBe(0)
        expect(next?.start.getUTCDate()).toBe(21)
        expect(next?.start.getUTCDay()).toBe(2)
    })

    test('monthly last-weekday rule (-1SA) picks the last Saturday of the month', () => {
        const ics = generateFeedICS([
            {
                uid: 'u',
                event: {
                    ...baseEvent,
                    rrule: 'FREQ=MONTHLY;BYDAY=-1SA',
                    dtstart: '20250125',
                },
            },
        ])
        const events = parseEvents(ics)
        const now = chicagoNow('2025-01-01T00:00:00')
        const [next] = getUpcomingEvents(events, now, RRule, 1)

        // Last Saturday of January 2025 is the 25th.
        expect(next?.start.getUTCFullYear()).toBe(2025)
        expect(next?.start.getUTCMonth()).toBe(0)
        expect(next?.start.getUTCDate()).toBe(25)
        expect(next?.start.getUTCDay()).toBe(6)
    })

    test('event with only past occurrences is excluded', () => {
        const ics = generateFeedICS([
            {
                uid: 'u',
                event: {
                    ...baseEvent,
                    rrule: 'FREQ=WEEKLY;BYDAY=WE;UNTIL=20250102T000000Z',
                    dtstart: '20250101',
                },
            },
        ])
        const events = parseEvents(ics)
        const now = chicagoNow('2026-01-01T00:00:00')
        expect(getUpcomingEvents(events, now, RRule, 3)).toEqual([])
    })

    test('sorts occurrences from multiple events chronologically', () => {
        const ics = generateFeedICS([
            {
                uid: 'later',
                event: {
                    ...baseEvent,
                    summary: 'Later Event',
                    rrule: 'FREQ=MONTHLY;BYDAY=-1SA',
                    dtstart: '20250125',
                },
            },
            {
                uid: 'sooner',
                event: {
                    ...baseEvent,
                    summary: 'Sooner Event',
                    location: 'Sooner Location',
                    rrule: 'FREQ=WEEKLY;BYDAY=WE',
                    dtstart: '20250101',
                },
            },
        ])
        const events = parseEvents(ics)
        // Just before Sooner Event's Jan 22 occurrence, and before Later
        // Event's Jan 25 (last Saturday of January) occurrence.
        const now = chicagoNow('2025-01-20T00:00:00')
        const upcoming = getUpcomingEvents(events, now, RRule, 3)

        // Interleaved: Sooner (Jan 22), Later (Jan 25), Sooner (Jan 29).
        expect(upcoming.map((e) => e.summary)).toEqual([
            'Sooner Event',
            'Later Event',
            'Sooner Event',
        ])
        expect(upcoming[0].location).toBe('Sooner Location')
    })

    test('a single event can fill more than one slot when it is genuinely the soonest repeatedly', () => {
        const ics = generateFeedICS([{ uid: 'u', event: baseEvent }])
        const events = parseEvents(ics)
        const now = chicagoNow('2025-01-06T00:00:00')
        const upcoming = getUpcomingEvents(events, now, RRule, 3)

        expect(upcoming).toHaveLength(3)
        expect(upcoming.every((e) => e.summary === 'Test Event')).toBe(true)
        // Each occurrence one week after the previous.
        expect(upcoming[1].start.getTime() - upcoming[0].start.getTime()).toBe(
            7 * 24 * 60 * 60 * 1000,
        )
        expect(upcoming[2].start.getTime() - upcoming[1].start.getTime()).toBe(
            7 * 24 * 60 * 60 * 1000,
        )
    })

    test('returns fewer than count when fewer occurrences remain', () => {
        const ics = generateFeedICS([
            {
                uid: 'u',
                event: {
                    ...baseEvent,
                    rrule: 'FREQ=WEEKLY;BYDAY=WE;UNTIL=20250108T235959Z',
                    dtstart: '20250101',
                },
            },
        ])
        const events = parseEvents(ics)
        const now = chicagoNow('2025-01-06T00:00:00')
        const upcoming = getUpcomingEvents(events, now, RRule, 3)

        expect(upcoming).toHaveLength(1)
    })

    test('no events at all returns an empty array', () => {
        expect(getUpcomingEvents([], new Date(), RRule, 3)).toEqual([])
    })

    test('treats "now" as Chicago wall-clock time, not the runtime\'s local time', () => {
        // Weekly Wednesday event at 23:00 Chicago. dtstart 2025-01-01 is a
        // Wednesday.
        const ics = generateFeedICS([
            {
                uid: 'u',
                event: { ...baseEvent, time: '23:00' },
            },
        ])
        const events = parseEvents(ics)

        // A real instant that is 23:30 Wednesday in Chicago (CST, UTC-6) —
        // half an hour *after* that day's occurrence — but only 21:30 in
        // this suite's system timezone, America/Los_Angeles (PST, UTC-8),
        // i.e. still *before* the naive local reading of that occurrence.
        // An implementation that reads "now" via the runtime's own local
        // getters (instead of converting through the Chicago tz database)
        // would incorrectly still consider Jan 8 23:00 upcoming and return
        // it; the correct behavior skips it as already past and returns
        // the following Wednesday instead.
        const now = new Date(Date.UTC(2025, 0, 9, 5, 30, 0))
        const [next] = getUpcomingEvents(events, now, RRule, 1)

        expect(next?.start.getUTCFullYear()).toBe(2025)
        expect(next?.start.getUTCMonth()).toBe(0)
        expect(next?.start.getUTCDate()).toBe(15)
        expect(next?.start.getUTCHours()).toBe(23)
    })

    test('still returns an occurrence hours away on the same Chicago day', () => {
        // Weekly Wednesday event at 18:00 Chicago. At noon Chicago on
        // Wed 2025-01-08 it is 6h away and must be the next occurrence.
        // Guards against the Chicago wall-clock "now" being re-read through
        // the runtime's local zone (this suite runs in America/Los_Angeles,
        // 2h behind Chicago), which shifts "now" ~8h late and skips the
        // same-day occurrence in favor of the following week's.
        const ics = generateFeedICS([{ uid: 'u', event: baseEvent }])
        const events = parseEvents(ics)

        const now = chicagoNow('2025-01-08T12:00:00')
        const [next] = getUpcomingEvents(events, now, RRule, 1)

        expect(next?.start.getUTCDate()).toBe(8)
        expect(next?.start.getUTCHours()).toBe(18)
    })
})

describe('fakeUtc', () => {
    test('uses CST in winter and CDT in summer', () => {
        expect(fakeUtc(new Date('2025-01-15T18:00:00Z')).toISOString()).toBe(
            '2025-01-15T12:00:00.000Z',
        )
        expect(fakeUtc(new Date('2025-07-15T18:00:00Z')).toISOString()).toBe(
            '2025-07-15T13:00:00.000Z',
        )
    })

    test('rolls over midnight into the previous Chicago day', () => {
        expect(fakeUtc(new Date('2025-03-01T03:30:00Z')).toISOString()).toBe(
            '2025-02-28T21:30:00.000Z',
        )
    })
})
