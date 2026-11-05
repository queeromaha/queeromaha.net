---
description: >-
  Weekly dead-link check with agentic triage (Claude arm of the engine A/B).
  The deterministic checker (scripts/check-links.ts) finds the problems; the
  agent decides whether a link moved, died or is just blocking bots, and fixes
  the content YAML. Shared logic and prompt: shared/link-triage.md.
on:
  schedule: weekly on monday
  workflow_dispatch:

permissions:
  contents: read

engine: claude

timeout-minutes: 30

imports:
  - shared/link-triage.md

safe-outputs:
  create-pull-request:
    title-prefix: "fix(links) [claude]: "
    labels: [links, links-claude]
    draft: false
    max: 1
    if-no-changes: ignore
    fallback-as-issue: true
    # content edits only; the checker, workflows and config are off limits
    allowed-files:
      - "src/content/pages/*.yaml"
  create-issue:
    title-prefix: "links [claude]: "
    labels: [links, links-claude]
    max: 2
    close-older-issues: true
---

{{#runtime-import .github/shared/link-triage-prompt.md}}
