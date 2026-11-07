# Studylab

A browser based study library for NCERT books, flashcards, and infographics. Built-in books, thumbnails, and the PDF search index are served by the site. Personal workspace data is synced to Firestore after Google sign-in.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Copy `src/services/.firebase-template` to `src/services/firebase.ts` and paste the web app configuration from Firebase Console into `firebaseConfig` (or use `.env.local`). The local `firebase.ts` is ignored by Git. In Firebase Authentication, enable Google as a sign-in provider and add the local and production hostnames to its authorized domains. Create a Firestore database and deploy the rules from `firestore.rules`.

When a Google account has no saved workspace, Studylab starts it with an empty workspace and uploads it on the first sync. Existing browser workspace data is cleared when a user signs in; it is not migrated to Firebase. Book PDFs and recent-book history are excluded from cloud sync. Sync runs every 5 seconds by default and can be adjusted in Settings.

## Build

```sh
npm run build
```

PDF files under `public/books` use Git LFS through `.gitattributes`.

## Deploy to GitHub Pages

The `.github/workflows/pages.yml` workflow builds and deploys the site when you push to `codex/firebase-firestore-sync` or `main`, or start it manually from the Actions tab. It checks out Git LFS files before building the PDFs and search index.

In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The site URL is:

```text
https://a11ied02.github.io/studylab/
```

To enable Google sign-in on the deployed site, add these repository Actions secrets under **Settings → Secrets and variables → Actions → Secrets**, using the values from your Firebase web app configuration:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Then, in Firebase Console, open **Authentication → Settings → Authorized domains** and add `a11ied02.github.io` (domain only; leave off `https://` and `/studylab/`). Google sign-in must also be enabled as an Authentication provider. Keep Firestore security rules enabled; GitHub Secrets keep values out of Git history and workflow logs, but Vite embeds Firebase web configuration in the public client bundle, so access control belongs in Firebase rules.
