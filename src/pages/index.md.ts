import { GET as filtersGET } from './[...filters].md'

// Astro emits the empty-param route of `[...filters].md.ts` as the dotfile
// `dist/.md`, which isn't served as a page. This gives the root a real
// `dist/index.md` for markdown negotiation (worker/index.ts, and the Netlify
// edge function until cutover) to serve.
export const GET = () => filtersGET({ params: {} })
