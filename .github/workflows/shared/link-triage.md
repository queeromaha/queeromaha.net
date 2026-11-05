---
# Shared by check-links-claude.md and check-links-copilot.md (A/B).
permissions:
  contents: read

# The agent works only from the evidence files prepared below, so it needs no
# network beyond the engine's own. Evidence-gathering runs outside the sandbox.
network: defaults

tools:
  bash:
    - "cat"
    - "ls"
    - "grep"
    - "git diff"
    - "git status"
    - "bun run test:data"
    - "bun run format"
    - "bun run lint"

steps:
  - name: Setup Bun
    uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0

  - name: Install dependencies
    uses: taraxvoid/voidflow/actions/bun-install@3f6252e4ab9000744b46d9d4d1a0172ee65cf992 # v0.13.1

  - name: Build site
    run: bun run build

  - name: Check links
    # exit 1 just means "found failures"; triage decides what that means
    run: bun scripts/check-links.ts --json /tmp/gh-aw/link-report.json || true

  - name: Gather evidence
    run: |
      bun scripts/link-evidence.ts /tmp/gh-aw/link-report.json /tmp/gh-aw/agent/link-evidence.json
      count=$(jq '.items | length' /tmp/gh-aw/agent/link-evidence.json)
      suspect=$(jq '.networkSuspect' /tmp/gh-aw/agent/link-evidence.json)
      if [ "$suspect" = "true" ]; then
        echo '{"type":"noop","message":"Most links failed at once; the runner network is the likelier culprit than the links. Not triaging."}' >> "$GH_AW_SAFE_OUTPUTS"
      elif [ "$count" -eq 0 ]; then
        echo '{"type":"noop","message":"All links healthy; nothing to triage."}' >> "$GH_AW_SAFE_OUTPUTS"
      fi
---

Shared configuration for the link-triage workflows. The prompt is in
`.github/shared/link-triage-prompt.md`.
