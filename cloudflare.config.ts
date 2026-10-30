// Worker config for the `cf` CLI (cf deploy / cf previews deploy). Build
// settings (the dist/ assets directory) live in wrangler.config.ts; `cf`
// builds this project with Wrangler, since Astro 6+ doesn't build through
// `cf` during its beta. Run `bun run build` first, then `cf build` / `cf deploy`.
//
// Blue/green: production serves queeromaha.dev (green) while Netlify keeps
// serving queeromaha.net (blue). The build still says queeromaha.net
// everywhere (canonical, sitemap, webcal), so cutover is only adding
// queeromaha.net to `domains` once that zone is on Cloudflare.
import { bindings, defineConfig } from 'cf/config'

export default defineConfig({
    worker: {
        name: 'queeromaha',
        compatibilityDate: '2026-10-20',
        entrypoint: './worker/index.ts',
        assets: {
            htmlHandling: 'auto-trailing-slash',
            notFoundHandling: '404-page',
            // The Worker passes asset requests through itself; it only
            // acts on POSTs and markdown-accepting page requests.
            runWorkerFirst: true,
        },
        domains: ['queeromaha.dev'],
        workersDev: false,
        previewUrls: true,
        observability: { enabled: true },
        env: {
            ASSETS: bindings.assets(),
            // Unrestricted destination: Email Routing only delivers to the
            // zone's verified addresses, and the address stays out of git.
            FORMS_EMAIL: bindings.sendEmail({
                allowedSenderAddresses: ['forms@queeromaha.dev'],
            }),
            FORMS_TO: bindings.secret(),
            FORMS_RATE_LIMIT: bindings.rateLimit({
                namespace: '3671',
                simple: { limit: 5, period: 60 },
            }),
        },
    },
})
