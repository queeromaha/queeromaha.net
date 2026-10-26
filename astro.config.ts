import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import icon from 'astro-icon'

export default defineConfig({
    site: 'https://queeromaha.net',
    integrations: [sitemap(), icon()],
    output: 'static',
    prefetch: true,
})
