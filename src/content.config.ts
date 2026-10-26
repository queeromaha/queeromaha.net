import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'zod'
import tagMap from '#data/tagMap.json'

export const tagEnum = z.enum(Object.keys(tagMap) as [string, ...string[]])

// Hand-edited YAML sometimes leaves an optional key with no value (e.g.
// `description:`), which parses to `null` rather than being omitted. Zod's
// `.optional()`/`.default()` only accept `undefined`, so normalize `null` to
// `undefined` before validating to avoid a hard content-collection crash.
const stripNull = (v: unknown) => (v === null ? undefined : v)
const optionalString = () => z.preprocess(stripNull, z.string().optional())
const optionalCoercedString = () =>
    z.preprocess(stripNull, z.coerce.string().optional())
const optionalUrl = () => z.preprocess(stripNull, z.url().optional())
const optionalBoolean = () => z.preprocess(stripNull, z.boolean().optional())

export const recurringEventSchema = z.object({
    summary: z.string(),
    rrule: z.string(),
    dtstart: z.string(),
    time: z.string(),
    end_time: optionalString(),
    duration: optionalString(),
    location: optionalString(),
    description: optionalString(),
    url: optionalUrl(),
})

export const locationSchema = z.object({
    street: optionalCoercedString(),
    city: optionalCoercedString(),
    state: optionalCoercedString(),
    zip: optionalCoercedString(),
    neighborhood: optionalCoercedString(),
    google_maps_url: optionalUrl(),
})

export const itemSchema = z.object({
    name: z.string(),
    public: optionalBoolean(),
    // Pins the item's permalink slug (/<category>/<vanity_slug>) so it
    // survives future renames of `name`. Falls back to a slug derived from
    // `name` when unset.
    vanity_slug: optionalString(),
    description: optionalString(),
    tags: z.array(tagEnum).optional(),
    links: z
        .array(
            z.object({
                label: z.string(),
                url: z.url(),
            }),
        )
        .optional(),
    notes: optionalString(),
    location: locationSchema.optional(),
    recurring_events: z.array(recurringEventSchema).optional(),
})

// Directory pages: structured yaml, no markdown body
export const directoryPageSchema = z.object({
    title: z.string(),
    description: optionalString(),
    public: z.preprocess(stripNull, z.boolean().default(true)),
    items: z.array(itemSchema).optional(),
})

export const collections = {
    directory: defineCollection({
        loader: glob({ pattern: '*.yaml', base: './src/content/pages' }),
        schema: directoryPageSchema,
    }),
}
