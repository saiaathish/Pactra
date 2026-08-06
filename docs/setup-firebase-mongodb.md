# Pactra Setup — Firebase + MongoDB Atlas

> ⚠️ **Cloud Storage for Firebase now requires the Blaze (pay-as-you-go)
> plan.** No-cost usage allowances still apply (5 GB storage, 1 GB/day
> downloads, 50k writes/day). This is the only setup dependency that can block
> the stack before coding begins.

## 1. Firebase project

1. https://console.firebase.google.com → **Add project** (`pactra-hackathon`).
2. Upgrade to **Blaze** (Settings → Usage and billing).
3. **Build → Authentication → Sign-in method**:
   - Enable **Google** (provider) and **Email/Password**.
   - Add your test accounts (Authentication → Users, or let them sign up).
4. **Build → Storage → Get started** (Blaze) → default bucket.
5. Deploy the security rules:

   ```bash
   npm i -g firebase-tools          # or use npx firebase-tools
   firebase login                   # browser auth
   firebase deploy --only storage   # uses firebase.json → firebase/storage.rules
   ```

   Verify with `firebase deploy --only storage:rules` output — no public
   wildcards allowed (rules deny everything outside `users/{uid}/…`).

6. **Project settings → Service accounts → Generate new private key** →
   downloads `service-account*.json` (gitignored).

### Environment variables (Firebase)

From **Project settings → General** (web app config):

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=          # <project>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=       # <project>.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

From the service-account JSON (server-only):

```
FIREBASE_ADMIN_PROJECT_ID=                 # project_id
FIREBASE_ADMIN_CLIENT_EMAIL=               # client_email
FIREBASE_ADMIN_PRIVATE_KEY=                # private_key — keep \n escapes; the
                                           # app handles "\\n" → real newlines
FIREBASE_ADMIN_STORAGE_BUCKET=             # same as NEXT_PUBLIC_..._STORAGE_BUCKET
```

## 2. MongoDB Atlas

1. https://cloud.mongodb.com → **New Project** → **Build a Database**
   → free **M0** cluster (region near you, e.g. `us-central1`).
2. **Database Access** → add user with read/write on `pactra`.
3. **Network Access** → allow `0.0.0.0/0` (hackathon; restrict later).
4. Copy the connection string:

   ```
   MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net
   MONGODB_DB_NAME=pactra
   ```

5. Initialize indexes (committed script — never create them by hand):

   ```bash
   MONGODB_URI="mongodb+srv://…" npm run db:init-indexes
   ```

   Re-running is safe (idempotent).

## 3. Google Cloud + YouTube OAuth

1. https://console.cloud.google.com → new project → note project ID/number.
2. **APIs & Services → Library**: enable **YouTube Data API v3**.
3. **APIs & Services → OAuth consent screen**:
   - App name `Pactra`, support + developer contact emails.
   - User type **External**, publishing status **Testing**; add your test
     accounts as test users. (Public verification takes up to 10 days — skip
     for the hackathon.)
   - **Scopes**: `openid`, `userinfo.email`, `userinfo.profile`,
     `https://www.googleapis.com/auth/youtube.readonly`. Do **not** add
     `youtube.upload` yet (incremental authorization later).
4. **Credentials → Create OAuth client ID** → Web application:

   ```
   Authorized redirect URIs:
     http://localhost:3000/api/youtube/callback
     https://YOUR-PRODUCTION-DOMAIN/api/youtube/callback
   ```

5. Copy into `.env.local`:

   ```
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/youtube/callback
   ```

## 4. Analysis engine (no Cloud Run)

The video-analysis engine runs **inside the Next.js app** as a Vercel
serverless function (`lib/worker/*` — TypeScript port of the original Python
worker; `ffmpeg-static`/`ffprobe-static` provide the binaries, `pdfjs-dist`
parses brief PDFs). No Cloud Run, no extra deployable, no billing account
needed on GCP.

Server env vars (same values as the web app):

```
MONGODB_URI
MONGODB_DB_NAME=pactra
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY
FIREBASE_ADMIN_STORAGE_BUCKET
AI_API_KEY                    # OpenAI-compatible: transcription + semantic match
AI_BASE_URL                   # optional, defaults to https://api.openai.com/v1
AI_MODEL=whisper-1            # transcription model (parse uses its own default)
ANALYSIS_ENGINE_VERSION=0.2.0
```

> `AI_API_KEY` is **required for analysis** (transcription); without it a run
> fails at the `transcribing` stage with a clear error. The brief-parse LLM
> step is optional — without a key, no candidates are auto-extracted and
> requirements are entered manually.

## 5. Vercel

1. Push to GitHub → Vercel **Add New → Project** → import → deploy once.
2. **Settings → Environment Variables** — add every key from `.env.example`
   (production + preview). Never prefix secrets with `NEXT_PUBLIC_`.
3. Add the production redirect URI to the Google OAuth client
   (`https://YOUR-PRODUCTION-DOMAIN/api/youtube/callback`).
4. In Firebase Auth, add the Vercel domain to **Authorized domains**.

## 6. Local development

```bash
cp .env.example .env.local     # fill everything above
npm install
npm run secrets                # TOKEN_ENCRYPTION_KEY + WORKER_SHARED_SECRET
npm run db:init-indexes
npm run dev                    # http://localhost:3000
```

Verify the deterministic engine (no cloud services needed):

```bash
npm run test:engine            # TS port of the 26-check engine suite
```

Full local end-to-end (runs all 13 pipeline stages against your real Atlas +
Firebase Storage, mock transcription API, fixtures auto-cleanup):

```bash
npm run test:e2e
```

## 7. Post-setup verification checklist

- [ ] `firebase auth:list` shows your test user; Google + email sign-in work.
- [ ] `npm run db:init-indexes` reports all indexes (unique ones included).
- [ ] `firebase deploy --only storage` succeeds; a non-owner uid cannot read
      `users/{other}/…`.
- [ ] `/api/youtube/connect` → Google consent → callback → channel + videos
      visible on `/youtube`; reconnect doesn't duplicate videos.
- [ ] Worker smoke test: one intentionally failing video produces
      segment timestamps, spoken-disclosure result, required/forbidden phrase
      results, discount-code result, description-URL result, evidence
      transcript, and video SHA-256.
- [ ] `npm run lint && npm run typecheck && npm run build` all green.
