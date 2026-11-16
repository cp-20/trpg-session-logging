# OpenCode handoff

Source: `ses_e20e1f346ffeWepCiK0JrA2urH`, read from the local OpenCode database on 2026-11-16.

## User decisions (latest instructions take precedence)

- Sign in with Google only; Discord and X are optional social connections.
- Show recognizable account information (email / username), never fabricated provider labels or internal IDs.
- Use daisyUI and Tabler icons. Round avatars, official brand assets, no decorative emoji or thick left borders.
- Use sans-serif typography. The old cream / serif explorer-sheet brief was superseded.
- Appearance has three choices: light, system, dark. Keep brand icons legible in both themes.
- Buttons must stay still on hover. Small pressed feedback is allowed; honor reduced motion.
- Session recording and log upload share `/upload`; support records without a log.
- Support CCFOLIA JSON, HTML, ZIP and character images. Explain errors and preserve source data.
- Present session overview before detailed timeline; do not fabricate character growth.
- Keep technical infrastructure details out of normal product copy.
- Check desktop, tablet, mobile and actual browser flows. Earlier completion claims are not evidence.
- Commit in coherent units.

## Infrastructure boundaries

- Project: `takufu-app`, organization `n-naoki-1587-org`.
- Firestore: named database `takufu`, region `asia-northeast1`.
- Do not modify the unrelated `cp20-platform` / general project or create a default database as a workaround.
- Existing Firebase initialization only configured the SDK; Auth and cross-device persistence were still mocked.
- X / Cloudflare portals previously needed user sign-in; recheck available sessions before assuming access.
- Requested deployment service: `https://deploy.lolipop.jp`.
- Do not commit `.env.local`, credentials, debug logs or browser storage.

## Baseline issues

- Repository had no commits; inherited application was entirely untracked.
- Latest OpenCode execution stopped at provider rate limit, with three failed E2E journeys.
- Settings and sign-in did not implement several changes claimed in prior replies.
- Corrupt storage was cast to `State` without validation, risking a blank screen.
- Firebase rules deployment deleted a release before replacement; release naming and authorization need independent validation.
- Chrome MCP connection was unavailable at initial handoff check; do not claim visible-browser verification without establishing it.
