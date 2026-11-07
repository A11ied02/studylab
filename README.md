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
