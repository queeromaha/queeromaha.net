// Handles the contact and Suggestion Box form POSTs that Netlify Forms used
// to take: same endpoint (any path, `form-name` field picks the form), same
// `bot-field` honeypot. A valid submission is emailed to FORMS_TO through the
// zone's Email Routing. The client scripts fetch with `Accept: */*` and only
// read the status; a no-JS submit asks for HTML and gets a small page back.

export const FORMS_FROM = 'forms@queeromaha.dev'

const SUGGESTION_MAX = 140
const MESSAGE_MAX = 5000
const EMAIL_MAX = 254
// One address, no whitespace or header-breaking characters. Deliberately
// loose: the input is type=email, this only keeps the Reply-To header sane.
const EMAIL_RE = /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]+$/

export type Submission =
    | { form: 'contact'; email: string; message: string }
    | { form: 'suggest'; message: string }

export type Parsed =
    | { ok: true; submission: Submission }
    | { ok: true; spam: true }
    | { ok: false; error: string }

export function parseSubmission(data: URLSearchParams): Parsed {
    if (data.get('bot-field')) return { ok: true, spam: true }
    const message = (data.get('message') ?? '').trim()
    if (!message) return { ok: false, error: 'missing message' }
    switch (data.get('form-name')) {
        case 'suggest':
            if (message.length > SUGGESTION_MAX)
                return { ok: false, error: 'message too long' }
            return { ok: true, submission: { form: 'suggest', message } }
        case 'contact': {
            const email = (data.get('email') ?? '').trim()
            if (email.length > EMAIL_MAX || !EMAIL_RE.test(email))
                return { ok: false, error: 'invalid email' }
            if (message.length > MESSAGE_MAX)
                return { ok: false, error: 'message too long' }
            return {
                ok: true,
                submission: { form: 'contact', email, message },
            }
        }
        default:
            return { ok: false, error: 'unknown form' }
    }
}

/** Base64 of UTF-8 text, wrapped at 76 columns (RFC 2045). */
function base64Lines(text: string): string {
    const bytes = new TextEncoder().encode(text)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return (btoa(bin).match(/.{1,76}/g) ?? []).join('\r\n')
}

/** A plain-text RFC 5322 message for the Email Routing send binding. */
export function buildMessage(
    submission: Submission,
    to: string,
    meta: { id: string; date: Date; page: string },
): string {
    const subject =
        submission.form === 'contact'
            ? `[queeromaha] Contact from ${submission.email}`
            : '[queeromaha] Suggestion Box'
    const body = [
        submission.message,
        '',
        '--',
        `Form: ${submission.form}`,
        `Page: ${meta.page}`,
        ...(submission.form === 'contact'
            ? [`Reply to: ${submission.email}`]
            : []),
    ].join('\n')
    const headers = [
        `From: Queer Omaha forms <${FORMS_FROM}>`,
        `To: ${to}`,
        ...(submission.form === 'contact'
            ? [`Reply-To: ${submission.email}`]
            : []),
        `Subject: ${subject}`,
        `Date: ${meta.date.toUTCString()}`,
        `Message-ID: <${meta.id}@queeromaha.dev>`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
    ]
    return `${headers.join('\r\n')}\r\n\r\n${base64Lines(body)}\r\n`
}

export type FormsEnv = {
    FORMS_TO?: string
    FORMS_RATE_LIMIT: {
        limit(options: { key: string }): Promise<{ success: boolean }>
    }
}

/** Sends a raw message; the Worker wraps `cloudflare:email`'s EmailMessage. */
export type Send = (from: string, to: string, raw: string) => Promise<void>

function wantsHtml(request: Request): boolean {
    return (request.headers.get('accept') ?? '').includes('text/html')
}

function reply(request: Request, status: number, text: string): Response {
    if (!wantsHtml(request)) {
        return new Response(text, {
            status,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
    }
    const back = new URL(request.url).pathname
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Queer Omaha</title><p>${text}</p><p><a href="${back}">Go back</a></p></html>`
    return new Response(html, {
        status,
        headers: { 'content-type': 'text/html; charset=utf-8' },
    })
}

export async function handleForm(
    request: Request,
    env: FormsEnv,
    send: Send,
): Promise<Response> {
    const type = request.headers.get('content-type') ?? ''
    if (!type.startsWith('application/x-www-form-urlencoded')) {
        return reply(request, 415, 'Unsupported form encoding.')
    }
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
    const { success } = await env.FORMS_RATE_LIMIT.limit({ key: ip })
    if (!success) {
        return reply(request, 429, 'Too many submissions. Try again soon.')
    }
    const parsed = parseSubmission(new URLSearchParams(await request.text()))
    if (!parsed.ok) return reply(request, 400, 'Something was missing.')
    // Bots that fill the honeypot get the same answer as people.
    if ('spam' in parsed) return reply(request, 200, 'Thanks!')
    // Unset on Worker Previews, which get no deploy secrets.
    if (!env.FORMS_TO) {
        console.error('FORMS_TO is not set; form submission dropped')
        return reply(request, 503, 'Forms are not set up here yet.')
    }

    const raw = buildMessage(parsed.submission, env.FORMS_TO, {
        id: crypto.randomUUID(),
        date: new Date(),
        page: new URL(request.url).pathname,
    })
    try {
        await send(FORMS_FROM, env.FORMS_TO, raw)
    } catch (e) {
        console.error('form email failed', e)
        return reply(request, 502, 'Something went wrong. Try again later.')
    }
    return reply(request, 200, 'Thanks! We got your message.')
}
