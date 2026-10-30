// The site is static assets (dist/); this Worker runs in front of them
// (`run_worker_first` in wrangler.jsonc) for the two things Netlify
// used to do at the edge: form POSTs and `Accept: text/markdown`
// negotiation. Everything else goes straight to the assets, which apply
// `_headers` and `_redirects`.
import { EmailMessage } from 'cloudflare:email'
import { type FormsEnv, handleForm } from './forms.ts'
import {
    HAS_EXTENSION,
    markdownPathFor,
    wantsMarkdown,
} from './markdownPath.ts'

type Env = FormsEnv & {
    ASSETS: { fetch(request: Request | URL | string): Promise<Response> }
    FORMS_EMAIL: { send(message: EmailMessage): Promise<unknown> }
}

function withVary(response: Response): Response {
    const out = new Response(response.body, response)
    out.headers.append('vary', 'Accept')
    return out
}

async function negotiate(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (HAS_EXTENSION.test(url.pathname)) return env.ASSETS.fetch(request)

    if (wantsMarkdown(request)) {
        const md = new URL(markdownPathFor(url.pathname), url)
        const res = await env.ASSETS.fetch(new Request(md, request))
        // A 304 is the markdown validator matching, not a missing twin.
        if (res.ok || res.status === 304) {
            const out = withVary(res)
            out.headers.set('content-type', 'text/markdown; charset=utf-8')
            return out
        }
    }
    return withVary(await env.ASSETS.fetch(request))
}

export default {
    async fetch(request, env) {
        if (request.method === 'POST') {
            return handleForm(request, env, async (from, to, raw) => {
                await env.FORMS_EMAIL.send(new EmailMessage(from, to, raw))
            })
        }
        if (request.method === 'GET' || request.method === 'HEAD') {
            return negotiate(request, env)
        }
        return env.ASSETS.fetch(request)
    },
} satisfies { fetch(request: Request, env: Env): Promise<Response> }
