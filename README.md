# Udaan

Air Force Day event site: quiz + poster competitions. Open 8-9 Oct 2026 (IST).

Next.js (App Router) + Firebase (Auth, Firestore) + Google Drive (posters) + Gemini for quiz questions.

## Run locally
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (see "Firebase setup" below).
3. `npm run dev` and open http://localhost:3000

Without Firebase config the landing page still renders; sign-in shows an error.

## Test
- `npm test` unit tests
- `npm run test:rules` security-rules tests (needs Java 11+ for the Firebase emulators)
- `npm run typecheck`

## Firebase setup (once)
1. Firebase console: add project `udaan`.
2. Authentication: enable the **Google** provider and set a support email.
3. Firestore: create the database in production mode (region `asia-south1`).
4. Project settings > General > Your apps > Web app: copy the config into the `NEXT_PUBLIC_FIREBASE_*` variables.
5. Project settings > Service accounts > Generate new private key: copy `project_id`, `client_email`, `private_key` into `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (keep the `\n` escapes).
6. Authentication > Settings > Authorized domains: add the deployed domain (keep `localhost`).
7. Get a Gemini API key from Google AI Studio for `GEMINI_API_KEY`.
8. Deploy the rules: `npx firebase-tools login`, then
   `npx firebase-tools deploy --only firestore:rules --project <project-id>`

## Poster storage (Google Drive)
Posters go straight from the student's browser into one Drive folder, named `<year>_<branch>_<roll>.<ext>`. Students never see Drive.
1. Google Cloud console (the Firebase project works): APIs & Services > enable **Google Drive API**.
2. OAuth consent screen: set the publishing status to **In production** (while on "Testing" the refresh token expires after 7 days). Scope `drive.file` needs no Google verification.
3. Credentials > Create credentials > OAuth client ID > **Web application**. Add redirect URI `http://localhost:3000/oauth2callback` (for step 5 only). Copy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. In Drive, create a folder (e.g. "Udaan Posters"); the ID is the last part of its URL → `DRIVE_FOLDER_ID`.
5. Get the refresh token once: `node scripts/drive-token.mjs` (reads the client id/secret from `.env.local`, prints the consent URL, then the token) → `GOOGLE_REFRESH_TOKEN`.
6. Set `POSTER_URL_SECRET` to any long random string.
Sign in to Drive with the same account to browse the folder. Files count against that account's 15 GB.

## Testing before 8 Oct
The quiz and posters are locked outside 8 Oct 00:00 to 9 Oct 23:59:59 IST. To test earlier, set in `.env.local`:
```
WINDOW_OPEN_ISO=2026-10-01T00:00:00Z
WINDOW_CLOSE_ISO=2026-12-31T00:00:00Z
```
An invalid value makes the app refuse to run rather than open at the wrong time. **Remove both overrides from production.**

## Deploy
Deploy to Vercel. Set every variable from `.env.example` except the two `WINDOW_*` overrides. Add the domain to Firebase Auth authorized domains.

## Admins
Set `ADMIN_EMAILS` to a comma-separated list of Gmail addresses (case-insensitive). Admins can view students, quiz scores and posters, filter by year/branch, export CSV, and download all posters. They cannot edit or judge.

## Pre-launch checklist
- `WINDOW_OPEN_ISO` / `WINDOW_CLOSE_ISO` removed from production.
- `ADMIN_EMAILS` set to the real organisers.
- Production domain in Firebase Auth authorized domains.
- Drive OAuth consent screen set to **In production** and all five poster env vars set on Vercel.
- Sign-in tested on iPhone Safari and from a link opened inside WhatsApp / Instagram (see "Sign-in note").

## Sign-in note
If Google sign-in fails on iOS Safari or in in-app browsers when the site is on a different domain than the Firebase `authDomain`, serve the Firebase auth helper from your own domain (proxy `/__/auth`) and set `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` to it. See the Firebase docs on `signInWithRedirect` best practices.
