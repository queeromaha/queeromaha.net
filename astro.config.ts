import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import icon from 'astro-icon'

export default defineConfig({
    site: 'https://queeromaha.net',
    integrations: [
        sitemap({
            serialize: (item) => ({
                ...item,
                url: item.url.replace(/(.)\/$/, '$1'),
            }),
        }),
        icon(),
    ],
    output: 'static',
    prefetch: true,
})
