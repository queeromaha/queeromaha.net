#!/usr/bin/env bun
// Renders the default link-preview card (public/og-image.png, 1200x630).
// The PNG is committed; re-run this only when the design changes.
import { readFileSync, writeFileSync } from 'node:fs'
import satori from 'satori'
import sharp from 'sharp'

const WIDTH = 1200
const HEIGHT = 630
const PANEL = 430
const dest = './public/og-image.png'

const font = (pkg: string, file: string) =>
    readFileSync(`./node_modules/@fontsource/${pkg}/files/${file}`)

// Pastel stripes sampled from the favicon
const stripes = [
    '#fdc4b8',
    '#fddcaa',
    '#fdf1a3',
    '#bff5d2',
    '#b5e3fd',
    '#dccbfd',
]

type Node = { type: string; props: Record<string, unknown> }
const h = (
    type: string,
    style: Record<string, unknown>,
    children?: (Node | string)[] | Node | string,
): Node => ({ type, props: { style, children } })

const arm = (deg: number) =>
    h('div', {
        position: 'absolute',
        top: 0,
        left: 122,
        width: 56,
        height: 300,
        background: '#3b2557',
        transform: `rotate(${deg}deg)`,
    })

const panel = h(
    'div',
    {
        display: 'flex',
        position: 'relative',
        width: PANEL,
        height: HEIGHT,
        flexDirection: 'column',
    },
    [
        ...stripes.map((background) =>
            h('div', { display: 'flex', flex: 1, background }),
        ),
        h(
            'div',
            {
                display: 'flex',
                position: 'absolute',
                top: (HEIGHT - 300) / 2,
                left: (PANEL - 300) / 2,
                width: 300,
                height: 300,
            },
            [arm(0), arm(60), arm(-60)],
        ),
    ],
)

const text = h(
    'div',
    {
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 72px',
        gap: 28,
    },
    [
        h(
            'div',
            {
                fontFamily: 'Space Grotesk',
                fontWeight: 700,
                fontSize: 96,
                lineHeight: 1,
                color: '#4c3170',
            },
            'Queer Omaha',
        ),
        h(
            'div',
            {
                fontFamily: 'Karla',
                fontSize: 38,
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
                fontSize: 32,
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
