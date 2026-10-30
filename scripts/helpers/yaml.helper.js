// @ts-check
import { parseDocument } from 'yaml'

/**
 * Parses and re-serializes yaml source into its canonical form.
 *
 * Uses `parseDocument` rather than `parse` so that comments survive the
 * round-trip (`yaml`'s `parse()` discards comments). `toString` accepts the
 * same `lineWidth: 0` option, so there is no line wrapping - matching the
 * content style of long, single-line `description:`/etc. fields.
 *
 * Note: Biome does not format YAML (see biomejs/biome#2365 - it is explicitly
 * deferred to community volunteers), so this file is the canonical YAML
 * formatter for the content directory.
 *
 * @param {string} src
 * @returns {{ canonical: string } | { error: string }}
 */
export function canonicalize(src) {
    try {
        const doc = parseDocument(src)
        if (doc.errors.length > 0) {
            return {
                error: doc.errors.map((e) => e.message).join('; '),
            }
        }
        return { canonical: doc.toString({ lineWidth: 0 }) }
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
    }
}
