# Deployment

- Site: https://takufu.lolipop-now.app
- Service: https://deploy.lolipop.jp (LOLIPOP! Deploy Now)
- Project: `takufu` (`01M7JCJVR7GCWGXR5MD32MZ22G`)
- Framework: `next`. Next.js runs as a server from the `standalone` output (`next.config.ts`), so route handlers such as the calendar feed (`/api/calendar/{token}.ics`) work.

```sh
pnpm run check
node scripts/ops.ts deploy --setup   # first time / when build settings or public env change
node scripts/ops.ts deploy           # later deployments
```

`deploy` uploads the Git-tracked source (never `.env*` or `node_modules`) to a temporary directory and runs `lolipop deploy`; Deploy Now installs and builds in the cloud with the settings in `DEPLOY_BUILD` (`scripts/ops.ts`). `pnpm run build` runs `next build` and then copies `public/` and `.next/static` into `.next/standalone` (Next.js leaves them out of the standalone output). `--setup` also writes the build settings and the public `NEXT_PUBLIC_FIREBASE_*` values from `.env.local` to the project environment; they are inlined at build time.

The deployment command submits an asynchronous build. A successful upload is not proof of readiness: confirm the returned deployment reaches `DEPLOYMENT_STATUS_READY` and visit the public site before reporting success.

## Calendar subscription

The server never holds user credentials. A signed-in browser writes its confirmed events, already rendered as a calendar file, to `calendarFeeds/{token}` in Firestore (`src/lib/calendar-feed.ts`); the token is 32 random bytes. Firestore rules let anyone `get` a feed document by its token but never `list` them, and only the owner can write or delete it. `/api/calendar/{token}.ics` reads the document through Firestore's public REST API and returns it as `text/calendar`. Recreating the link deletes the old document. Deploy rule changes with `node scripts/ops.ts rules`.

Firebase uses project `takufu-app` and the named Firestore database `takufu`. Add `takufu.lolipop-now.app` to Firebase Authentication's authorized domains. Firebase's browser configuration is public; OAuth client secrets and administrative credentials must never be put in `NEXT_PUBLIC_*` variables or static assets.

Google Authentication is enabled. The public app name is `卓譜`, and the authorized domains include `localhost`, the Firebase project domains, and `takufu.lolipop-now.app`. `node scripts/ops.ts firebase` verifies these settings without printing client secrets.

X uses the dedicated production application `Takufu TRPG` (app ID `33648016`) in the `Takufu` project. The unrelated legacy `cp20` app is unchanged. The user explicitly approved app creation under Pay Per Use with no card, credit purchase or automatic recharge setup.

The X app has read-only permissions, does not request email, and allows callback `https://takufu-app.firebaseapp.com/__/auth/handler`. Its website is `https://takufu.lolipop-now.app`. The OAuth 1.0a consumer key and secret are stored in Firebase's `twitter.com` provider configuration, never in the frontend or repository. Google and Twitter providers are both enabled; the administrative status script reports credential presence only.

A signed `POST https://api.x.com/oauth/request_token` returned HTTP 200 with `oauth_callback_confirmed=true` while the account had no purchased credits. This verifies OAuth initiation, not a complete user linking flow. Linking completes only after a Google-authenticated user approves the X authorization screen. The app does not call X content APIs or post automatically; report sharing opens the user's X composer.

X's [current pricing](https://docs.x.com/x-api/getting-started/pricing) is prepaid per usage, without a subscription or minimum spend. This is distinct from the [OAuth 1.0a authorization flow](https://docs.x.com/fundamentals/authentication/oauth-1-0a/obtaining-user-access-tokens). Do not promise a permanent free allowance for content API reads or assume the entire linking flow is free from the initiation check alone.

Routes are Next.js App Router paths (`/sessions`, `/share/l/{slug}`, …) served by the Next.js server.

Official guidance: https://deploy.lolipop.jp/docs/frameworks/nextjs
