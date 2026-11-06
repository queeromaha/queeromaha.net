import { definePreviewConfig } from '@taraxvoid/voidflow/playwright'

const config = definePreviewConfig({ ciPort: 4242 })

// `bun run preview` is the Worker now; e2e stays on the static server.
if (config.webServer) {
    const { port } = new URL(config.use.baseURL)
    config.webServer.command = `bunx astro preview --port ${port}`
}

export default config
