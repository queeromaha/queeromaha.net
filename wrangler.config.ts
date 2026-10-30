// Build settings for `cf`'s Wrangler bundler (experimental during the cf
// beta). The Worker itself is configured in cloudflare.config.ts.
import { defineWranglerConfig } from 'wrangler/experimental-config'

export default defineWranglerConfig({
    // Astro's output, including the generated _redirects; `bun run build`
    // must run before `cf build`.
    assetsDirectory: './dist',
    types: { generate: false },
})
