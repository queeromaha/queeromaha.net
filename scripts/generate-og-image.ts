#!/usr/bin/env bun
// Renders the default link-preview card (public/og-image.png, 1200x630).
// The PNG is committed; re-run this only when the design changes.
import { readFileSync, writeFileSync } from 'node:fs'
import satori from 'satori'
import sharp from 'sharp'

const WIDTH = 1200
const HEIGHT = 630
const dest = './public/og-image.png'
// Real logo (same source art as favicon.svg), shown full-bleed on the left
const logo = `data:image/png;base64,${readFileSync('./public/apple-touch-icon-1024x1024.png').toString('base64')}`

const font = (pkg: string, file: string) =>
    readFileSync(`./node_modules/@fontsource/${pkg}/files/${file}`)

type Node = { type: string; props: Record<string, unknown> }
const h = (
    type: string,
    style: Record<string, unknown>,
    children?: (Node | string)[] | Node | string,
    attrs: Record<string, unknown> = {},
): Node => ({ type, props: { ...attrs, style, children } })

const panel = h('img', { width: HEIGHT, height: HEIGHT }, undefined, {
    src: logo,
    width: HEIGHT,
    height: HEIGHT,
})

const text = h(
    'div',
    {
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 56px',
        gap: 24,
    },
    [
        h(
            'div',
            {
                fontFamily: 'Space Grotesk',
                fontWeight: 700,
                fontSize: 66,
                lineHeight: 1,
                color: '#4c3170',
            },
            'Queer Omaha',
        ),
        h(
            'div',
            {
                fontFamily: 'Karla',
                fontSize: 30,
                lineHeight: 1.3,
                color: '#222',
            },
            'Community-maintained directory of queer groups, spaces, and resources in Omaha, Nebraska.',
        ),
        h(
            'div',
            {
                fontFamily: 'Space Grotesk',
                fontWeight: 500,
                fontSize: 26,
                color: '#6d28d9',
            },
            'queeromaha.net',
        ),
    ],
)

const svg = await satori(
    h(
        'div',
        {
            display: 'flex',
            width: WIDTH,
            height: HEIGHT,
            background: '#f6f0fa',
        },
        [panel, text],
        // satori takes React-shaped element objects; no React needed
    ) as unknown as Parameters<typeof satori>[0],
    {
        width: WIDTH,
        height: HEIGHT,
        fonts: [
            {
                name: 'Space Grotesk',
                weight: 700,
                data: font(
                    'space-grotesk',
                    'space-grotesk-latin-700-normal.woff',
                ),
            },
            {
                name: 'Space Grotesk',
                weight: 500,
                data: font(
                    'space-grotesk',
                    'space-grotesk-latin-500-normal.woff',
                ),
            },
            {
                name: 'Karla',
                weight: 400,
                data: font('karla', 'karla-latin-400-normal.woff'),
            },
        ],
    },
)

const png = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer()
writeFileSync(dest, png)
console.log(`wrote ${dest} (${(png.length / 1024).toFixed(1)} KiB)`)
