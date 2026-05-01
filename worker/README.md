# Drifting Atelier — Share Backend

A tiny Cloudflare Worker that lets visitors share their custom memory canvases (with photos and notes) by URL. Without this deployed, sharing still works — but only for very small canvases that fit in a URL fragment. With it deployed, you can share any canvas with up to ~5 photos, all hosted for free.

**Cost:** $0 at any reasonable scale. Cloudflare's free tier is generous:
- Workers: 100K requests/day
- R2 storage: 10 GB, 1M reads/month, **$0 egress**
- KV: 100K reads/day, 1K writes/day

That's enough for ~500 canvases shared per day.

---

## One-time setup (~5 minutes)

You'll do this once on your machine.

### 1. Sign up for Cloudflare (if you haven't)

https://dash.cloudflare.com/sign-up — free, no credit card required for what we use.

### 2. Install wrangler (Cloudflare's CLI)

```bash
npm install -g wrangler
wrangler login
```

It opens a browser tab to authorize. Click allow, come back to the terminal.

### 3. Create the R2 bucket (for image storage)

```bash
wrangler r2 bucket create drifting-atelier-images
```

If this is your first time using R2, Cloudflare will ask you to enable it — say yes (still free).

### 4. Create the KV namespace (for canvas data)

```bash
wrangler kv namespace create DRIFTING_CANVASES
```

It prints something like:
```
🌀 Creating namespace with title "drifting-atelier-share-DRIFTING_CANVASES"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "MEMORY_KV", id = "f3a91d8c4e5b4a2197b8e6c1f0a5d4b9" }
```

**Copy that `id` string.**

### 5. Paste the KV id into `wrangler.toml`

Open `wrangler.toml` in this folder and replace `REPLACE_WITH_KV_NAMESPACE_ID` with the id from step 4.

### 6. Deploy

```bash
cd worker
npm install
npm run deploy
```

You'll see:
```
Total Upload: 8.42 KiB / gzip: 3.21 KiB
Uploaded drifting-atelier-share (xx ms)
Published drifting-atelier-share (xx sec)
  https://drifting-atelier-share.<your-subdomain>.workers.dev
```

**Copy that worker URL.** That's your backend.

### 7. Tell the frontend about the worker

Open `index.html` in the project root and add this line just before `<script type="module" src="/src/main.js">`:

```html
<script>window.__DRIFTING_WORKER_URL__ = 'https://drifting-atelier-share.YOUR-SUBDOMAIN.workers.dev';</script>
```

(Replace with your actual URL from step 6.)

Commit + push — GH Pages will redeploy in ~30 seconds, and the share button will start using your worker.

---

## How it works

### Three endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/upload` | Upload an image. multipart/form-data with a `file` field. Returns `{ url }` pointing to the hosted image. |
| `POST` | `/canvas` | Save a canvas's JSON state. Returns `{ id }` (8-char short ID). |
| `GET` | `/canvas/:id` | Fetch the canvas JSON. |
| `GET` | `/i/:filename` | Serves an uploaded image with year-long caching. |

### Limits per request
- **Upload:** 1.5 MB per image
- **Canvas:** 64 KB JSON (lots of pieces is fine; the JSON is tiny)
- **Canvas TTL:** 1 year (then auto-deleted unless re-saved)

### CORS

The worker only allows requests from:
- `https://razee4315.github.io` (production)
- `http://localhost:5173` (dev)
- `http://localhost:4173` (vite preview)

Edit `ALLOWED_ORIGINS` in `src/worker.js` if you fork or change domains.

### Local dev

```bash
npm run dev
```

Runs the worker locally at `http://localhost:8787`. To point the frontend at it during development, set:

```html
<script>window.__DRIFTING_WORKER_URL__ = 'http://localhost:8787';</script>
```

### Live logs

```bash
npm run tail
```

Streams real-time logs from the deployed worker. Handy when something fails.

---

## Tearing it down

If you ever want to remove everything:

```bash
wrangler delete drifting-atelier-share
wrangler r2 bucket delete drifting-atelier-images
wrangler kv namespace delete --binding MEMORY_KV
```
