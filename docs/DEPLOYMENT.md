# Deployment

- Site: https://takufu.lolipop-now.app
- Service: https://deploy.lolipop.jp
- Project: `takufu` (`01M7JCJVR7GCWGXR5MD32MZ22G`)
- Framework: `static`; only the built `dist/` files are uploaded.

Use the official [Lolipop CLI](https://deploy.lolipop.jp/docs/cli), authenticated with the existing account:

```sh
lolipop login
npm run check
node scripts/deploy-lolipop.mjs --prebuilt
lolipop project show --project 01M7JCJVR7GCWGXR5MD32MZ22G --json
```

Without `--prebuilt`, the script builds first. Set `LOLIPOP_CLI` to the executable path when the CLI is not on `PATH`. The script copies the build to a temporary directory because the CLI excludes files ignored by Git. It never uploads the repository or `.env.local`.

The deployment command submits an asynchronous build. A successful upload is not proof of readiness: confirm the returned deployment reaches `DEPLOYMENT_STATUS_READY` and visit the public site before reporting success.

Firebase uses project `takufu-app` and the named Firestore database `takufu`. Add `takufu.lolipop-now.app` to Firebase Authentication's authorized domains. Firebase's browser configuration is public; OAuth client secrets and administrative credentials must never be put in `VITE_*` variables or static assets.

Google Authentication is enabled. The public app name is `卓譜`, and the authorized domains include `localhost`, the Firebase project domains, and `takufu.lolipop-now.app`. `node scripts/firebase-admin.mjs` verifies these settings without printing client secrets.

X uses the dedicated production application `Takufu TRPG` (app ID `33648016`) in the `Takufu` project. The unrelated legacy `cp20` app is unchanged. The user explicitly approved app creation under Pay Per Use with no card, credit purchase or automatic recharge setup.

The X app has read-only permissions, does not request email, and allows callback `https://takufu-app.firebaseapp.com/__/auth/handler`. Its website is `https://takufu.lolipop-now.app`. The OAuth 1.0a consumer key and secret are stored in Firebase's `twitter.com` provider configuration, never in the frontend or repository. Google and Twitter providers are both enabled; the administrative status script reports credential presence only.

A signed `POST https://api.x.com/oauth/request_token` returned HTTP 200 with `oauth_callback_confirmed=true` while the account had no purchased credits. This verifies OAuth initiation, not a complete user linking flow. Linking completes only after a Google-authenticated user approves the X authorization screen. The app does not call X content APIs or post automatically; report sharing opens the user's X composer.

X's [current pricing](https://docs.x.com/x-api/getting-started/pricing) is prepaid per usage, without a subscription or minimum spend. This is distinct from the [OAuth 1.0a authorization flow](https://docs.x.com/fundamentals/authentication/oauth-1-0a/obtaining-user-access-tokens). Do not promise a permanent free allowance for content API reads or assume the entire linking flow is free from the initiation check alone.

Routes use `HashRouter`, so a link such as `/#/sessions` resolves through the root `index.html`; no server rewrite or `404.html` fallback is needed.

Official static hosting guidance: https://deploy.lolipop.jp/docs/frameworks/static
