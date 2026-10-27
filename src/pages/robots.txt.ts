// robots.txt for queeromaha.net.
//
// Uses Content Signals (https://contentsignals.org/) to declare use-permissions
// for crawler content:
//   - search=yes  -> indexing & search results (allowed)
//   - ai-input=yes -> grounding / RAG answers (allowed)
//   - ai-train=no  -> training & fine-tuning of AI models (NOT allowed)
// Access rules (Allow/Disallow) are independent of signals; they enforce the
// ai-train=no reservation for bots that honor robots.txt. Signal semantics:
// https://contentsignals.org/
export async function GET() {
    const body = `# Queer Omaha robots.txt - content-use signals:
#   search=yes, ai-input=yes (allowed) - ai-train=no (not allowed)
# See https://contentsignals.org/ for signal semantics.
User-agent: *
Content-Signal: ai-train=no, search=yes, ai-input=yes
Allow: /

# AI *training* crawlers: disallowed to enforce ai-train=no. This does not
# affect Search - Google Search uses Googlebot, not Google-Extended.
User-agent: GPTBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: Anthropic-AI
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /

# *Use/search* crawlers: allowed (search=yes, ai-input=yes).
User-agent: PerplexityBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: DuckAssistBot
Allow: /

Sitemap: https://queeromaha.net/sitemap.xml
`
    return new Response(body, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
}
