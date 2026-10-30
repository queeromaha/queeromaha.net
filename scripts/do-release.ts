#!/usr/bin/env bun

import { execSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import semver from 'semver'

const fail = (msg: string): never => {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
}

const run = (cmd: string, opts?: { silent?: boolean }): string => {
    try {
        const result = execSync(cmd, {
            encoding: 'utf8',
            stdio: opts?.silent ? 'pipe' : 'inherit',
        })
        return result.trim()
    } catch {
        fail(`Command failed: ${cmd}`)
        return ''
    }
}

const runQuiet = (cmd: string) => run(cmd, { silent: true })

// ─── Preflight ───────────────────────────────────────────────────────────────

const currentBranch = runQuiet('git rev-parse --abbrev-ref HEAD')
if (currentBranch !== 'next')
    fail(`Must be on 'next' branch. Current: ${currentBranch}`)

const dirty = runQuiet('git status --porcelain')
if (dirty) fail('Working tree is dirty. Commit or stash changes first.')

run('git fetch origin next live')

const localNext = runQuiet('git rev-parse next')
const remoteNext = runQuiet('git rev-parse origin/next')
if (localNext !== remoteNext)
    fail("Local 'next' has drifted from remote. Pull or rebase first.")

const commits = runQuiet('git log origin/live..origin/next --oneline')
if (!commits)
    fail('No commits to release (origin/live is up to date with origin/next).')

// ─── Version Bump ────────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const currentVersion = pkg.version
const suggested = 'minor'

const bumpPrompt = `Current version: ${currentVersion}
Commits to release:
${commits}

Suggesting minor bump to ${semver.inc(currentVersion, suggested)} - accept? [Y/n/major]`

process.stdout.write(`\n${bumpPrompt}\n\nYour choice: `)

const answer = (await Bun.stdin.text()).trim().toLowerCase()
let bumpType: semver.ReleaseType = 'minor'
if (answer === 'major') bumpType = 'major'
else if (answer === 'n') fail('Aborted by user.')

const newVersion = semver.inc(currentVersion, bumpType)
if (!semver.valid(newVersion)) fail(`Invalid version computed: ${newVersion}`)

process.stdout.write(`\nBumping to ${newVersion}...\n`)

// Edit package.json directly (avoid npm version's unwanted git commit)
pkg.version = newVersion
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`)

// ─── Changelog ───────────────────────────────────────────────────────────────

const commitMessages = runQuiet(
    'git log origin/live..origin/next --pretty=format:%s --no-merges',
).split('\n')

const groups: Record<string, string[]> = {
    Added: [],
    Fixed: [],
    Changed: [],
    Infrastructure: [],
    Other: [],
}
for (const msg of commitMessages) {
    const lower = msg.toLowerCase()
    if (/^(feat|add|new)\b/.test(lower)) groups.Added.push(msg)
    else if (/^(fix|bug|patch)\b/.test(lower)) groups.Fixed.push(msg)
    else if (/^(change|refactor|update|improve)\b/.test(lower))
        groups.Changed.push(msg)
    else if (/^(infra|ci|deps|build)\b/.test(lower))
        groups.Infrastructure.push(msg)
    else groups.Other.push(msg)
}

const today = new Date().toISOString().slice(0, 10)
const lines: string[] = [`## [${newVersion}] - ${today}`]
for (const [section, items] of Object.entries(groups)) {
    if (items.length > 0)
        lines.push(`\n### ${section}\n${items.map((i) => `- ${i}`).join('\n')}`)
}

const changelog = `${lines.join('\n')}\n`

let existing = ''
try {
    existing = readFileSync('CHANGELOG.md', 'utf8')
} catch {}

const newChangelog = `${changelog}\n${existing}`
writeFileSync('CHANGELOG.md', newChangelog)

process.stdout.write(
    `\nGenerated CHANGELOG.md:\n${'─'.repeat(40)}\n${changelog}${'─'.repeat(40)}\n`,
)

process.stdout.write(
    'Review the changelog above. Press Enter to cut the release branch, or Ctrl+C to abort.',
)
await Bun.stdin.text()

// ─── Cut Release ─────────────────────────────────────────────────────────────

const tag = `v${newVersion}`
const branch = `release/${newVersion}`

if (runQuiet(`git branch --list ${branch}`))
    fail(`Branch ${branch} already exists locally.`)
if (runQuiet(`git tag -l ${tag}`)) fail(`Tag ${tag} already exists.`)
if (runQuiet(`git ls-remote --heads origin ${branch}`))
    fail(`Branch ${branch} already exists on remote.`)

run(`git checkout -b ${branch}`)
run('git add package.json CHANGELOG.md')
run(`git commit -m "chore(release): ${newVersion}"`)
run(`git tag ${tag}`)
run(`git push origin ${branch} --tags`)

const prBodyPath = '/tmp/changelog-pr-body.md'
writeFileSync(prBodyPath, changelog)

const prResult = spawnSync(
    'gh',
    [
        'pr',
        'create',
        '--base',
        'live',
        '--head',
        branch,
        '--title',
        `Release ${newVersion}`,
        '--body-file',
        prBodyPath,
        '--draft',
    ],
    { encoding: 'utf8' },
)

if (prResult.status !== 0) fail(`gh pr create failed: ${prResult.stderr}`)

process.stdout.write(`\n✅ Release ${newVersion} cut.\n`)
process.stdout.write(`   Branch: ${branch}\n`)
process.stdout.write(`   Tag: ${tag}\n`)
process.stdout.write(`   PR: ${prResult.stdout.trim()}\n\n`)
process.stdout.write('Next steps:\n')
process.stdout.write('  1. Review and mark the PR as ready for review\n')
process.stdout.write('  2. Wait for prod-checks to pass\n')
process.stdout.write('  3. Merge to live (Netlify deploys automatically)\n')
process.stdout.write(
    `  4. Clean up: git push origin --delete ${branch} && git push origin --delete ${tag}\n`,
)
