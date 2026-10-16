import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'

export default defineConfig({
    site: 'https://queeromaha.net',
    integrations: [sitemap()],
    output: 'static',
    prefetch: true,
})
