import type { Context } from '@netlify/edge-functions'
import { markdownPathFor, wantsMarkdown } from '../../worker/markdownPath.ts'

export default async (request: Request, context: Context) => {
    if (!wantsMarkdown(request)) return context.next()
    const url = new URL(request.url)

    // Every HTML page built by `src/pages/[...filters].astro` has a
    // markdown counterpart pre-built at the same path with `.md` appended
    // (the root page is `/index.md`, see `src/pages/index.md.ts`).
    return new URL(markdownPathFor(url.pathname), url)
}

export const config = { path: '/*' }
