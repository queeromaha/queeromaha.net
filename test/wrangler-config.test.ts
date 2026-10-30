import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { unstable_readConfig } from 'wrangler'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = unstable_readConfig({ config: join(ROOT, 'wrangler.jsonc') })

describe('wrangler.jsonc', () => {
    test('serves dist/ through the Worker on queeromaha.dev', () => {
        expect(config.name).toBe('queeromaha-net')
        expect(config.routes).toContainEqual({
            pattern: 'queeromaha.dev',
            custom_domain: true,
        })
        expect(config.assets?.directory).toBe('./dist')
        expect(config.assets?.binding).toBe('ASSETS')
        // Pages and form POSTs reach the Worker; built files skip it.
        expect(config.assets?.run_worker_first).toEqual(
            expect.arrayContaining(['/*', '!/_astro/*', '!/*.png']),
        )
    })

    test('declares the form bindings the Worker reads, in Previews too', () => {
        for (const block of [config, config.previews]) {
            expect(
                block?.send_email?.map((b: { name: string }) => b.name),
            ).toEqual(['FORMS_EMAIL'])
            expect(
                block?.ratelimits?.map((b: { name: string }) => b.name),
            ).toEqual(['FORMS_RATE_LIMIT'])
        }
    })
})
