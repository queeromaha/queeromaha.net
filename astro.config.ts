import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import og from 'astro-og'

export default defineConfig({
    site: 'https://queeromaha.net',
    // astro-og: dev toolbar preview of link-preview cards (dev server only)
    integrations: [sitemap(), og()],
    output: 'static',
    prefetch: true,
})
