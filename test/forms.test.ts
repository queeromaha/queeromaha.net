import { describe, expect, test, vi } from 'vitest'
import {
    buildMessage,
    FORMS_FROM,
    type FormsEnv,
    handleForm,
    parseSubmission,
} from '../worker/forms.ts'

const form = (fields: Record<string, string>) => new URLSearchParams(fields)

describe('parseSubmission', () => {
    test('accepts a suggestion', () => {
        expect(
            parseSubmission(form({ 'form-name': 'suggest', message: ' hi ' })),
        ).toEqual({
            ok: true,
            submission: { form: 'suggest', message: 'hi' },
        })
    })
    test('rejects a suggestion over the 140-character input limit', () => {
        const message = 'x'.repeat(141)
        expect(
            parseSubmission(form({ 'form-name': 'suggest', message })),
        ).toEqual({ ok: false, error: 'message too long' })
    })
    test('accepts a contact message', () => {
        expect(
            parseSubmission(
                form({
                    'form-name': 'contact',
                    email: 'a@example.com',
                    message: 'hello',
                }),
            ),
        ).toEqual({
            ok: true,
            submission: {
                form: 'contact',
                email: 'a@example.com',
                message: 'hello',
            },
        })
    })
    test('rejects a contact email that could break headers', () => {
        expect(
            parseSubmission(
                form({
                    'form-name': 'contact',
                    email: 'a@example.com\r\nBcc: b@example.com',
                    message: 'hello',
                }),
            ),
        ).toEqual({ ok: false, error: 'invalid email' })
    })
    test('flags a filled honeypot as spam', () => {
        expect(
            parseSubmission(
                form({
                    'form-name': 'suggest',
                    message: 'hi',
                    'bot-field': 'x',
                }),
            ),
        ).toEqual({ ok: true, spam: true })
    })
    test('rejects unknown forms and empty messages', () => {
        expect(
            parseSubmission(form({ 'form-name': 'x', message: 'hi' })),
        ).toEqual({ ok: false, error: 'unknown form' })
        expect(
            parseSubmission(form({ 'form-name': 'suggest', message: '  ' })),
        ).toEqual({ ok: false, error: 'missing message' })
    })
})

describe('buildMessage', () => {
    const meta = {
        id: 'abc',
        date: new Date('2026-10-29T12:00:00Z'),
        page: '/friends/',
    }

    test('sets Reply-To for contact messages and encodes the body', () => {
        const raw = buildMessage(
            { form: 'contact', email: 'a@example.com', message: 'héllo' },
            'admin@example.com',
            meta,
        )
        const [head, body] = raw.split('\r\n\r\n')
        expect(head).toContain(`From: Queer Omaha forms <${FORMS_FROM}>`)
        expect(head).toContain('To: admin@example.com')
        expect(head).toContain('Reply-To: a@example.com')
        expect(head).toContain('Message-ID: <abc@queeromaha.dev>')
        const text = new TextDecoder().decode(
            Uint8Array.from(atob(body.replace(/\r\n/g, '')), (c) =>
                c.charCodeAt(0),
            ),
        )
        expect(text).toContain('héllo')
        expect(text).toContain('Page: /friends/')
    })

    test('has no Reply-To for suggestions', () => {
        const raw = buildMessage(
            { form: 'suggest', message: 'hi' },
            'admin@example.com',
            meta,
        )
        expect(raw).not.toContain('Reply-To')
        expect(raw).toContain('Subject: [queeromaha] Suggestion Box')
    })
})

describe('handleForm', () => {
    const env = (overrides: Partial<FormsEnv> = {}): FormsEnv => ({
        FORMS_TO: 'admin@example.com',
        FORMS_RATE_LIMIT: { limit: async () => ({ success: true }) },
        ...overrides,
    })
    const post = (body: string, accept = '*/*') =>
        new Request('https://queeromaha.dev/friends/', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                accept,
                'cf-connecting-ip': '192.0.2.1',
            },
            body,
        })

    test('emails a valid suggestion', async () => {
        const send = vi.fn(async () => {})
        const res = await handleForm(
            post('form-name=suggest&message=hi'),
            env(),
            send,
        )
        expect(res.status).toBe(200)
        expect(send).toHaveBeenCalledWith(
            FORMS_FROM,
            'admin@example.com',
            expect.stringContaining('Suggestion Box'),
        )
    })

    test('answers a honeypot hit with 200 and sends nothing', async () => {
        const send = vi.fn(async () => {})
        const res = await handleForm(
            post('form-name=suggest&message=hi&bot-field=x'),
            env(),
            send,
        )
        expect(res.status).toBe(200)
        expect(send).not.toHaveBeenCalled()
    })

    test('returns 400 for an invalid submission', async () => {
        const res = await handleForm(
            post('form-name=suggest&message='),
            env(),
            vi.fn(),
        )
        expect(res.status).toBe(400)
    })

    test('returns 429 when rate limited', async () => {
        const send = vi.fn()
        const res = await handleForm(
            post('form-name=suggest&message=hi'),
            env({
                FORMS_RATE_LIMIT: { limit: async () => ({ success: false }) },
            }),
            send,
        )
        expect(res.status).toBe(429)
        expect(send).not.toHaveBeenCalled()
    })

    test('returns 503 when no destination is configured', async () => {
        const res = await handleForm(
            post('form-name=suggest&message=hi'),
            env({ FORMS_TO: undefined }),
            vi.fn(),
        )
        expect(res.status).toBe(503)
    })

    test('returns 502 when sending fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const res = await handleForm(
            post('form-name=suggest&message=hi'),
            env(),
            async () => {
                throw new Error('nope')
            },
        )
        expect(res.status).toBe(502)
    })

    test('answers a no-JS submit with an HTML page', async () => {
        const res = await handleForm(
            post('form-name=suggest&message=hi', 'text/html'),
            env(),
            async () => {},
        )
        expect(res.headers.get('content-type')).toContain('text/html')
        expect(await res.text()).toContain('href="/friends/"')
    })

    test('rejects other encodings', async () => {
        const req = new Request('https://queeromaha.dev/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
        })
        expect((await handleForm(req, env(), vi.fn())).status).toBe(415)
    })
})
