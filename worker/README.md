# ankibot tutor proxy (Cloudflare Worker)

A tiny, **stateless** Worker whose only job is to hold the Anthropic API key so it
never ships in the frontend bundle. The browser POSTs a chat request; the Worker
adds the key + required Anthropic headers, calls the Messages API with streaming
on, and **pipes the SSE stream straight back** to the browser.

It stores no user data and no progress. The proper monthly spend cap and BYO-key
support come in phase 7; this Worker has only a **minimal abuse guard** (origin
allow-list + best-effort per-IP rate limit + model/param allow-listing).

## Cardinal rule

The `ANTHROPIC_API_KEY` lives **only** as a Worker secret. It is never in this
repo, never in `wrangler.toml`, never in the frontend bundle.

## One-time setup (Ryan)

```sh
# 1. Install deps
cd worker
npm install

# 2. Authenticate Wrangler with your Cloudflare account
npx wrangler login

# 3. Set the API key as a SECRET (prompts for the value; not stored in the repo)
npx wrangler secret put ANTHROPIC_API_KEY

# 4. Deploy and note the printed URL (https://ankibot-tutor.<subdomain>.workers.dev)
npm run deploy
```

Then point the frontend at it: set `VITE_TUTOR_WORKER_URL` to the deployed URL
(see the repo root `.env.example`) and rebuild the app.

## Local development

```sh
cp .dev.vars.example .dev.vars   # paste your key into .dev.vars (gitignored)
npm run dev                      # serves on http://localhost:8787
```

Run the frontend with `VITE_TUTOR_WORKER_URL=http://localhost:8787` to test
end to end against the local Worker.

## CORS allow-list

`ALLOWED_ORIGINS` in `wrangler.toml` lists the origins permitted to call the
Worker (prod domain + localhost dev). The Worker also handles the `OPTIONS`
preflight. If the app's live origin changes, update this list (or set it in the
Cloudflare dashboard) so the browser's cross-origin requests aren't rejected.

## Request contract

```
POST /
Content-Type: application/json
{ "system": "<tutor system prompt>", "messages": [ {"role":"user","content":"..."} ], "model": "claude-haiku-4-5-20251001" }
```

Response: an `text/event-stream` of Anthropic SSE events (`content_block_delta`
with `text_delta`, etc.), streamed token-by-token. `model` is optional and is
clamped to an allow-list; `max_tokens` and `stream` are fixed by the Worker.
