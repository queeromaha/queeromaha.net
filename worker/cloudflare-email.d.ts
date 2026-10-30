// The one Workers runtime module the Worker imports. Declared here so
// `astro check` (and vitest) don't need the generated runtime types.
declare module 'cloudflare:email' {
    export class EmailMessage {
        constructor(from: string, to: string, raw: string)
        readonly from: string
        readonly to: string
    }
}
