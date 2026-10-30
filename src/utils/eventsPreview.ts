import type { RRule } from 'rrule'

export interface ParsedEvent {
    uid: string
    summary: string
    location?: string
    dtstart: {
        year: number
        month: number
        day: number
        hour: number
        minute: number
    }
    rrule: string
}

export interface NextEvent {
    uid: string
    summary: string
    location?: string
    // Deliberately built from Date.UTC() on wall-clock (America/Chicago)
    // components, not a real instant - see getUpcomingEvents below.
    // Read this back only via getUTC* accessors, never local getters.
    start: Date
}

function parseDtstart(value: string): ParsedEvent['dtstart'] | null {
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value)
    if (!match) return null
    const [, year, month, day, hour, minute] = match
    return {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
    }
}

export function parseEvents(icsText: string): ParsedEvent[] {
    const events: ParsedEvent[] = []
    const blocks = icsText.split('BEGIN:VEVENT').slice(1)

    for (const block of blocks) {
        const body = block.split('END:VEVENT')[0]

        const uid = /UID:(.+)/.exec(body)?.[1]?.trim()
        const dtstartRaw = /DTSTART;TZID=America\/Chicago:(\S+)/.exec(body)?.[1]
        const rrule = /RRULE:(.+)/.exec(body)?.[1]?.trim()
        const summary = /SUMMARY:(.+)/.exec(body)?.[1]?.trim()
        const location = /LOCATION:(.+)/.exec(body)?.[1]?.trim()

        if (!uid || !dtstartRaw || !rrule || !summary) continue
        const dtstart = parseDtstart(dtstartRaw)
        if (!dtstart) continue

        events.push({ uid, summary, location, dtstart, rrule })
    }

    return events
}

const chicagoParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
})

// Converts a real instant into the America/Chicago wall-clock time,
// represented as a fake-UTC Date (read back only via getUTC* accessors) -
// this must go through the IANA tz database rather than the visitor's own
// system timezone, since dtstart values are always Chicago wall-clock.
export function fakeUtc(date: Date): Date {
    const p: Record<string, number> = {}
    for (const { type, value } of chicagoParts.formatToParts(date)) {
        p[type] = Number(value)
    }
    // Chicago's offset is whole minutes, so milliseconds carry over as-is.
    return new Date(
        Date.UTC(
            p.year,
            p.month - 1,
            p.day,
            p.hour,
            p.minute,
            p.second,
            date.getUTCMilliseconds(),
        ),
    )
}

export function getUpcomingEvents(
    events: ParsedEvent[],
    now: Date,
    RRuleCtor: typeof RRule,
    count: number,
): NextEvent[] {
    const nowFaked = fakeUtc(now)
    const candidates: NextEvent[] = []

    for (const event of events) {
        const { year, month, day, hour, minute } = event.dtstart
        const dtstartFaked = new Date(
            Date.UTC(year, month - 1, day, hour, minute),
        )

        let rule: InstanceType<typeof RRuleCtor>
        try {
            rule = new RRuleCtor({
                ...RRuleCtor.parseString(event.rrule),
                dtstart: dtstartFaked,
            })
        } catch {
            continue
        }

        // Collect up to `count` occurrences per event - the same
        // recurring event can legitimately fill more than one of the
        // final slots if it's genuinely the next-soonest thing coming
        // up more than once (e.g. a weekly meetup happening twice
        // before anything else does).
        let cursor = nowFaked
        let inclusive = true
        for (let i = 0; i < count; i++) {
            const occurrence = rule.after(cursor, inclusive)
            if (!occurrence) break
            candidates.push({
                uid: event.uid,
                summary: event.summary,
                location: event.location,
                start: occurrence,
            })
            cursor = occurrence
            inclusive = false
        }
    }

    candidates.sort((a, b) => a.start.getTime() - b.start.getTime())
    return candidates.slice(0, count)
}
