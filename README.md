# 卓譜

TRPG session records, CCFOLIA logs and character sheets, built with Vite, React, TypeScript, daisyUI and Firebase.

```sh
npm ci
cp .env.example .env.local
# Fill the public Firebase web app configuration in .env.local.
npm run dev
```

Sign in with Google, or open the local sample data. Actual accounts start with empty records; demo records are never uploaded automatically.

```sh
npm run check        # Types, unit tests, production build
npm run test:e2e     # Browser journeys
npm run test:smoke   # Route coverage against the running dev server
firebase emulators:start --only auth,firestore --project takufu-app
npm run check:emulator
VITE_FIREBASE_USE_EMULATORS=true npm test -- src/lib/cloud-state.emulator.test.ts
```

Firebase project `takufu-app` uses the named Firestore database `takufu`. Private workspaces use chunked generations with revision checks. Shared logs use separate filtered data and server authorization. Invites expire after 30 days. OAuth secrets belong in Firebase's provider configuration, never in `VITE_*` environment variables.

See [deployment](docs/DEPLOYMENT.md), [design](DESIGN.md) and [handoff decisions](docs/HANDOFF.md). The original mock architecture is recorded in `docs/ARCHITECTURE.md`; Firebase Auth, persistence and shared views have since been implemented.

CCFOLIA JSON / HTML / ZIP logs and JSON / ZIP character imports are supported. Discord and BOOTH/TALTO verification are not implemented; their settings remain marked as preparation. X linking requires a configured Firebase Twitter provider; opening X's report composer works independently.
