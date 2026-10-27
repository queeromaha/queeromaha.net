#!/usr/bin/env bun
// Canonicalizes src/content/pages/*.yaml formatting.
//
// Check mode: bun scripts/format-yaml.ts --check
//   Exits 1 and lists files that would change, without writing.
// Write mode: bun scripts/format-yaml.ts
//   Rewrites any file that isn't already canonical.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalize } from './helpers/yaml.helper'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONTENT_DIR = join(ROOT, 'src', 'content', 'pages')

const CHECK_MODE = process.argv.includes('--check')

const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.yaml'))

const errors: string[] = []
const changed: string[] = []

for (const file of files) {
    const path = join(CONTENT_DIR, file)
    const src = readFileSync(path, 'utf8')
    const result = canonicalize(src)

    if ('error' in result) {
        errors.push(`  ${file}: ${result.error}`)
        continue
    }

    if (result.canonical === src) continue

    changed.push(file)
    if (!CHECK_MODE) writeFileSync(path, result.canonical)
}

if (errors.length > 0) {
    console.error('YAML parse error(s) - fix before committing:')
    for (const msg of errors) console.error(msg)
    process.exit(1)
}

if (changed.length === 0) {
    process.exit(0)
}

if (CHECK_MODE) {
    console.error('Not canonically formatted:')
    for (const file of changed) console.error(`  ${file}`)
    console.error('Run `bun run format` to fix.')
    process.exit(1)
}

console.log('Formatted:')
for (const file of changed) console.log(`  ${file}`)
