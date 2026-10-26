#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { favicons } from 'favicons'

// favicon.svg itself is a plain copy of logo.svg (not generated here)
const source = readFileSync('./public/logo.svg')
const dest = './public'

const response = await favicons(source, {
    path: '/',
    appName: 'Queer Omaha',
    appShortName: 'Queer Omaha',
    appDescription:
        'Community-maintained directory of queer groups, spaces, and resources in Omaha, Nebraska.',
    background: '#f6f0fa',
    theme_color: '#4c3170',
    icons: {
        android: true,
        appleIcon: true,
        appleStartup: false,
        favicons: true,
        windows: false,
        yandex: false,
    },
})

for (const image of response.images) {
    writeFileSync(join(dest, image.name), image.contents)
    console.log('wrote', image.name)
}
for (const file of response.files) {
    // Pretty-print JSON files with 4-space indent to match Biome's formatter
    const content = file.name.endsWith('.webmanifest')
        ? `${JSON.stringify(JSON.parse(file.contents), null, 4)}\n`
        : file.contents
    writeFileSync(join(dest, file.name), content)
    console.log('wrote', file.name)
}
console.log('\nRecommended <head> tags:')
for (const tag of response.html) console.log(tag)
