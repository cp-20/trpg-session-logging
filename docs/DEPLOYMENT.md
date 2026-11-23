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

Deploy Now's Next.js builder accepts only npm (`package-lock.json`; pnpm and yarn are rejected). The repository stays on pnpm: `deploy` converts only the uploaded copy, pinning direct dependencies to the versions pnpm resolved, generating `package-lock.json` and dropping pnpm-only files. `node scripts/ops.ts deploy --local-build` runs the same install and build on that copy locally without uploading.

`deploy` uploads the Git-tracked source (never `.env*` or `node_modules`) to a temporary directory and runs `lolipop deploy`; Deploy Now installs and builds in the cloud with the settings in `DEPLOY_BUILD` (`scripts/ops.ts`). `pnpm run build` runs `next build` and then copies `public/` and `.next/static` into `.next/standalone` (Next.js leaves them out of the standalone output). `--setup` also writes the build settings and the public `NEXT_PUBLIC_FIREBASE_*` values from `.env.local` to the project environment; they are inlined at build time.

The deployment command submits an asynchronous build. A successful upload is not proof of readiness: confirm the returned deployment reaches `DEPLOYMENT_STATUS_READY` and visit the public site before reporting success.

## Feedback form

`/feedback` posts to `/api/feedback`, which validates the input (`src/lib/feedback.ts`), drops honeypot submissions, limits each IP to 5 posts per 10 minutes (in memory), and forwards the message to a Discord webhook with all mentions disabled. The webhook URL lives only in the server-side environment variable `DISCORD_FEEDBACK_WEBHOOK_URL` on Deploy Now (never `NEXT_PUBLIC_*`, never in the repository). Without it the form answers 503. Set it with `lolipop env create DISCORD_FEEDBACK_WEBHOOK_URL --value-stdin --sensitive --project <id> < file` (the value then never appears in shell history or listings), then redeploy.

## Calendar subscription

The server never holds user credentials (the Discord integration adds its own bot credentials only; see Discord below). A signed-in browser writes its confirmed events, already rendered as a calendar file, to `calendarFeeds/{token}` in Firestore (`src/lib/calendar-feed.ts`); the token is 32 random bytes. Firestore rules let anyone `get` a feed document by its token but never `list` them, and only the owner can write or delete it. `/api/calendar/{token}.ics` reads the document through Firestore's public REST API and returns it as `text/calendar`. Recreating the link deletes the old document. Deploy rule changes with `node scripts/ops.ts rules`.

Firebase uses project `takufu-app` and the named Firestore database `takufu`. Add `takufu.lolipop-now.app` to Firebase Authentication's authorized domains. Firebase's browser configuration is public; OAuth client secrets and administrative credentials must never be put in `NEXT_PUBLIC_*` variables or static assets.

Google Authentication is enabled. The public app name is `卓譜`, and the authorized domains include `localhost`, the Firebase project domains, and `takufu.lolipop-now.app`. `node scripts/ops.ts firebase` verifies these settings without printing client secrets.

X uses the dedicated production application `Takufu TRPG` (app ID `33648016`) in the `Takufu` project. The unrelated legacy `cp20` app is unchanged. The user explicitly approved app creation under Pay Per Use with no card, credit purchase or automatic recharge setup.

The X app has read-only permissions, does not request email, and allows callback `https://takufu-app.firebaseapp.com/__/auth/handler`. Its website is `https://takufu.lolipop-now.app`. The OAuth 1.0a consumer key and secret are stored in Firebase's `twitter.com` provider configuration, never in the frontend or repository. Google and Twitter providers are both enabled; the administrative status script reports credential presence only.

A signed `POST https://api.x.com/oauth/request_token` returned HTTP 200 with `oauth_callback_confirmed=true` while the account had no purchased credits. This verifies OAuth initiation, not a complete user linking flow. Linking completes only after a Google-authenticated user approves the X authorization screen. The app does not call X content APIs or post automatically; report sharing opens the user's X composer.

X's [current pricing](https://docs.x.com/x-api/getting-started/pricing) is prepaid per usage, without a subscription or minimum spend. This is distinct from the [OAuth 1.0a authorization flow](https://docs.x.com/fundamentals/authentication/oauth-1-0a/obtaining-user-access-tokens). Do not promise a permanent free allowance for content API reads or assume the entire linking flow is free from the initiation check alone.

Routes are Next.js App Router paths (`/sessions`, `/share/l/{slug}`, …) served by the Next.js server.

Official guidance: https://deploy.lolipop.jp/docs/frameworks/nextjs

## Scenario directory

Scenarios are shared by all users and live in Firestore `scenarios/{id}`; nothing keeps the directory in memory. `/api/scenarios` (`src/server/scenario-directory.ts`) queries it through Firestore's public REST API:

- **Search by words**: every document stores a map `t` of the 1- and 2-character grams of its normalized title, author, keywords and system name. A query becomes up to six `t.<gram> == true` equality filters (plus `systemId ==`), which Firestore answers by merging single-field indexes, so no composite index is needed. The server reads at most 300 matching documents and ranks them (title exact → prefix → contains → all words anywhere; then the viewer's systems; then popularity).
- **Browse**: ordered by `rank` (TALTO likes order; user-added scenarios get 1,000,000,000), or by `sysRank` (`"<systemId>:<rank padded to 10>"`) within a system, plus a count aggregation.

Writers: the TALTO catalog (`scripts/data/talto-catalog.json`, refreshed with `node scripts/fetch-talto-scenarios.ts`) is written by `node scripts/sync-scenario-directory.ts` as the bot user (only the bot may write `sc_talto_*`). It writes only changed documents and deletes listings that disappeared; `--dry-run` shows the counts and `--emulator` targets the emulators. A signed-in browser publishes the scenarios its user added (`publishSharedScenario`); rules fix their `rank`/`sysRank`, limit `t` to 400 grams, let only the adder update them, and never delete them.

Edit proposals live in `scenarioEditRequests/{id}` (`sendScenarioEditRequest`, `fetchPendingEditRequests`, `resolveEditRequest`). Only signed-in non-adders can create one, its `ownerUid` must equal the scenario's `addedByUid`, only the sender and the adder can read it, and only the adder can set `status` to `accepted`/`rejected`. Signed-out demo use keeps proposals in local state.

Tests: `src/lib/scenario-directory.emulator.test.ts` (rules, REST queries, proposals), `src/app/api/scenarios/route.test.ts`.

## Google Calendar busy times

The setting 「Google カレンダーの空き時間を使う」 (`src/components/google-busy.tsx`, shown on `/settings` and in カレンダー連携 on `/calendar`) runs entirely in the browser: Firebase `reauthenticateWithPopup` asks Google for the scopes `calendar.freebusy` and `calendar.calendarlist.readonly`, and the short-lived access token is used once to read the calendar list and FreeBusy (`src/lib/google-calendar.ts`). The token is never stored or sent to the server, and no refresh token is requested, so the server holds no Google credentials. Only the busy time ranges and calendar names are saved in the user's own state.

The Calendar API must be enabled in the same Google Cloud project as Firebase Authentication (`takufu-app`); otherwise the calendar list request answers 403 `SERVICE_DISABLED` and the app shows 「卓譜側の設定の問題で…」. `node scripts/ops.ts firebase` reports `calendarApiEnabled`; `node scripts/ops.ts firebase --enable-calendar-api` enables `calendar-json.googleapis.com` (allow a few minutes to propagate). In Google Auth Platform, list both scopes under Data access. They are sensitive scopes: while the app is in Testing only listed test users can grant them, and in Production users see the unverified-app screen until Google verifies the app.

The console message "Cross-Origin-Opener-Policy policy would block the window.closed call" during the popup is Firebase polling the popup that Google's pages isolate with COOP. It is harmless: the token still arrives (the 2026-11-22 failure happened after the popup, at the calendar list request).

## Discord

**End-to-end test without Discord.** `pnpm run test:e2e:discord` (needs the Auth/Firestore emulators on 9099/8080) starts its own `next dev` on 5181 with `DISCORD_API_BASE` pointing at a fake Discord (`e2e/support/fake-discord.ts`, port 5182, records every REST/OAuth call) and `DISCORD_PUBLIC_KEY` set to a test Ed25519 key, then `e2e/discord.spec.ts` drives the real UI and sends signed interactions: `/卓譜 つなぐ`, linking the channel and the account (OAuth), a poll with a Discord button answer, confirming (exactly one scheduled event and one notice), and "Discord に投稿". Not covered: Discord's real signing/permission behaviour, the day-before reminder, `/卓譜 日程`・`キャラ`, and the real authorize screen.

The Discord integration runs entirely inside the existing Next.js server: Discord sends HTTP interactions to `/api/discord/interactions`, and the server calls Discord's REST API with the bot token. There is no always-on Gateway connection, so the bot never joins voice and cannot record. Features: answering 日程調整 from Discord, confirmed-event notices plus a Discord scheduled event and a day-before reminder, and an opt-in "Discord に投稿" after recording a session. Code: `src/lib/discord/` (server logic and pure builders), `src/app/api/discord/*` (thin route handlers), `src/components/discord.tsx` (settings row, table panel, link screen, sync), `scripts/discord.ts` (command registration and checks).

### Credentials (a deliberate change)

The rest of the app keeps "the server never holds user credentials". Discord users are not Firebase users, so the server needs its own access to check membership and write answers. It holds two **service** credentials and still never holds user OAuth tokens: the Discord OAuth access token (scope `identify` only) is used once to read the user ID and revoked immediately.

- **Bot user, not a service account.** The `takufu-app` organization enforces `iam.disableServiceAccountKeyCreation`, so there is no service-account key and no `firebase-admin`. Instead the server signs in as a dedicated Firebase Auth email/password user (`TAKUFU_BOT_EMAIL` / `TAKUFU_BOT_PASSWORD`, server-only) with the Web SDK in its own named Firebase app (`src/lib/discord/bot-connection.ts`: `firebase/auth` with in-memory persistence, `firebase/firestore/lite` on the `takufu` database). Sign-in is single-flight; the SDK caches the ID token and refreshes it through securetoken before it expires.
- **Rules confine the bot.** `firestore.rules` has `botUid()` (a constant written by `setup-bot`) and `isBot()` (that uid, signed in with a password). Nobody else can become the bot: sign-up never lets a client choose its uid, and the bot's email is on a domain that cannot receive mail, so its password cannot be reset by anyone. The bot may:
  - read and write the Discord-only collections (`discordLinks`, `userDiscord`, `discordOAuthStates`, `discordLinkCodes`, `tableDiscord`, `discordEvents`, `discordReminders`);
  - read `tablePolls`, and update only `responses.<uid>` for **one** uid in `memberIds` while `status == 'poll'` (plus `updatedAt`), or only `discord` (`guildId`/`channelId`/`messageId`/`scheduledEventId`);
  - list `sharedCharacters` only with `enabled == true`;
  - read what anyone may read (`sharedLogs` manifests, public share payloads, enabled character payloads).
  It cannot read any `users/{uid}` workspace, members-only share payloads, or write anything else. Users may only `get`/`delete` their own `userDiscord/{uid}` (deleting it unlinks: the server checks both directions of the link). Tests: `src/lib/discord/rules.emulator.test.ts`, `src/lib/discord/firestore-store.emulator.test.ts`, `scripts/emulator-smoke.ts`.
- **What the server no longer reads.** Linking a channel takes the 卓's name and members from the owner's screen (as the status call already did) instead of reading their workspace; that workspace was user-written anyway, so ownership is the caller's claim in both designs. A 卓 already linked by someone else cannot be taken over, and only its linker can unlink it. "Discord に投稿" takes the 卓 from the share payload when it is public, otherwise from the recording screen; posting still requires membership of the linked 卓.
- **App users' ID tokens** (`Authorization: Bearer` on `/api/discord/*`) are verified locally (`src/lib/discord/id-token.ts`): RS256 against Google's securetoken JWKs (cached per `Cache-Control`), `aud` = project, `iss` = `https://securetoken.google.com/<project>`, `exp`/`iat`/`auth_time`, non-empty `sub`. Unsigned emulator tokens are accepted only when `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true` at build time. The bot's own token is refused there.
- The Email/Password sign-in provider must be enabled for the bot to sign in. That also lets anyone create an ordinary email/password account through the API (the app offers none); such accounts get no more than a Google account would. If the project is on Identity Platform, sign-up can be disabled after the bot exists.
- The server calls Firebase Auth with `NEXT_PUBLIC_FIREBASE_API_KEY` and no `Referer`, so that key must not be restricted to HTTP referrers (an API restriction is fine).
- Optional: a Firestore TTL policy on `expiresAt` for `discordOAuthStates` and `discordLinkCodes` (both are deleted when used; TTL only sweeps abandoned ones).

### Environment variables (Deploy Now, server-side, never `NEXT_PUBLIC_*`)

| Name | Value |
| --- | --- |
| `DISCORD_APPLICATION_ID` | Application ID (General Information) |
| `DISCORD_PUBLIC_KEY` | Public Key (General Information); verifies interaction signatures |
| `DISCORD_BOT_TOKEN` | Bot → Reset Token |
| `DISCORD_CLIENT_SECRET` | OAuth2 → Client Secret |
| `TAKUFU_BOT_EMAIL` | The bot user's email (`setup-bot` writes it to `.env.discord.local`) |
| `TAKUFU_BOT_PASSWORD` | The bot user's random 32-byte password (same file) |
| `TAKUFU_PUBLIC_URL` | Optional; defaults to `https://takufu.lolipop-now.app` (links in messages, OAuth redirect) |

Set each with `lolipop env create NAME --value-stdin --sensitive --project <id> < file`, then redeploy. Without them the endpoints answer 503 and the app shows Discord as unlinked. Locally, keep them in `.env.discord.local` (git-ignored); Next.js does not load that file name, so `pnpm run dev` (`scripts/dev.ts`) passes its values to Next.js, and `scripts/discord.ts` reads it too.

### Owner setup

1. Discord Developer Portal → New Application `卓譜`. Installation: Guild Install only; disable User Install. Bot: turn off "Public Bot" if it should stay on your servers only; no privileged intents are needed.
2. General Information → Interactions Endpoint URL: `https://takufu.lolipop-now.app/api/discord/interactions` (set after the env vars are deployed; Discord sends a signed PING and only saves the URL if it is answered within 3 seconds; right after a deploy the first request can be a cold start, so retry once if it says "could not be verified"). It can also be set without the portal: `PATCH https://discord.com/api/v10/applications/@me` with `{"interactions_endpoint_url": …}` and the bot token.
3. OAuth2 → Redirects: `https://takufu.lolipop-now.app/api/discord/oauth/callback` (add `http://localhost:5173/api/discord/oauth/callback` for development with `TAKUFU_PUBLIC_URL=http://localhost:5173`).
4. Bot user: Firebase console → Authentication → Sign-in method → enable Email/Password. Then `node scripts/discord.ts setup-bot --project takufu-app` (the flag confirms the target project; optionally `--email <address>`; the default `discord-bot@takufu.invalid` cannot receive mail). It signs up the user through the Auth REST API with a random 32-byte password, writes `TAKUFU_BOT_EMAIL` / `TAKUFU_BOT_PASSWORD` to `.env.discord.local` (mode 600), prints the uid and writes it into `firestore.rules` (`botUid()`) and `src/lib/discord/bot-account.ts` (`BOT_UID`; a unit test keeps the two equal). Deploy the rules (`node scripts/ops.ts rules`), commit both files, set the two variables on Deploy Now and redeploy. It refuses to run again unless `--force`.
5. Register commands: `node scripts/discord.ts register --guild <server ID>` while testing (instant), then `node scripts/discord.ts register` (global, up to an hour).
6. `node scripts/discord.ts setup-check` reports which variables are present (never values), whether the rules carry the bot's uid and the bot can sign in as that uid, whether the portal's endpoint and redirect match, and probes the deployed endpoints (unsigned interaction → 401).
7. Install the bot on a server from the 卓 screen's 「ボットを追加」 (or `node scripts/discord.ts install-url`). Permissions requested: View Channel, Send Messages, Embed Links, Connect (voice events only) and Create Events. Then `/卓譜 つなぐ` in the channel (needs Manage Channels) and open the link as the 卓's owner.

### Behaviour

- Linking (P14, nobody is searched by name): a 卓譜 user links their Discord account from 設定 via OAuth2 (one-time `state` bound to an HttpOnly cookie, 10 minutes). A channel is linked to a 卓 by a one-time 43-character code from `/卓譜 つなぐ` (10 minutes); the 卓's owner redeems it from their screen, which sends the 卓's name and members; a 卓 linked by someone else cannot be relinked. One channel ↔ one 卓.
- Interactions are answered within 3 seconds with a deferred response; the work runs in `after()` and edits the original response. Buttons custom IDs are `po:<eventId>:<page>` / `pa:<eventId>:<candidateId>:<ok|maybe|ng>:<page>`.
- The app calls `/api/discord/sync-poll` / `sync-event` (`DiscordSync`) only for the signed-in user's own changes (their answers, polls/events they manage). Repeated calls are idempotent.
- Reminders (day before): one message per confirmed event, due 24 hours before it starts, or 6 hours after it was confirmed if that is later (so it does not repeat the "confirmed" message); never sent once the event has started. There is no external cron: `src/instrumentation.ts` starts an in-process scheduler (`src/lib/discord/scheduler.ts`) when the Discord variables are present. It sets one timer for the next due reminder (re-checked at least every 10 minutes and after every event sync), and catches up on start-up and on any Discord request (interactions, `sync-*`, …, at most once a minute): reminders whose due time has passed but whose event has not started are sent late rather than dropped. The `discordReminders/{eventId}_dayBefore_{startMs}` marker is claimed in a Firestore transaction, so restarts and several instances never send twice (a failed send releases it for the next scan).
- Reminders therefore rely on the server process being alive. If Deploy Now has put the app to sleep, the reminder goes out when the next request wakes it (if the event has not started yet). The reliable fallback is Discord's own scheduled event: Discord notifies "interested" members when it starts, with no help from 卓譜.
- Session posts are never automatic. The message shows the title, system and time only when the share page is readable anonymously (public scope and public scenario); otherwise it posts only the link and who can read it.
- Messages disable all mentions (`allowed_mentions: { parse: [] }`).

### Local end-to-end with the emulators

With `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true`, the server's bot connects to the Auth (`NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL` or `FIREBASE_AUTH_EMULATOR_HOST`, default `127.0.0.1:9099`) and Firestore (`127.0.0.1:8080`) emulators and, unless `TAKUFU_BOT_EMAIL` / `TAKUFU_BOT_PASSWORD` are set, signs in with fixed emulator-only credentials. The emulator starts empty, so the server creates the bot user with the uid from `BOT_UID` on first use (`node scripts/discord.ts setup-bot --emulator` does the same by hand). Run `firebase emulators:start --only auth,firestore --project takufu-app`, then `pnpm run dev` with the emulator variables and the four `DISCORD_*` values in `.env.local` / `.env.discord.local`. Emulator checks: `firebase emulators:exec --only auth,firestore --project takufu-app "<script>"` where the script exports `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true NEXT_PUBLIC_FIREBASE_API_KEY=demo-key NEXT_PUBLIC_FIREBASE_PROJECT_ID=takufu-app` and runs `node scripts/emulator-smoke.ts` and `pnpm exec vitest run src/lib/*.emulator.test.ts src/lib/discord/*.emulator.test.ts`.

## Share-page OG images

`/share/l/{slug}` and `/share/c/{id}` have dynamic titles (`layout.tsx` → `generateMetadata`) and OG images (`opengraph-image.tsx`, drawn by `src/server/og-image.tsx` from `src/lib/og-card.ts`). The server reads the share through Firestore's public REST API without credentials (`src/server/shared-pages.ts`), so it sees only what the rules show to anyone: public logs and shared characters. Members-only or passphrase logs get a generic card without the title. The Noto Sans JP TTFs are fetched once per process from Google Fonts (no user text is sent); if that fails, the image route redirects to the LP's `/opengraph-image.png`. Tests: `src/lib/og-card.test.ts`, `src/lib/share-og.emulator.test.ts`, and the OG test in `e2e/public-pages.spec.ts`.
