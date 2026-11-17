# Takufu interface

This document records the implemented application direction, superseding the early explorer-sheet concept in `.impeccable/briefs/app.md`. Latest user decisions are recorded in `docs/HANDOFF.md`.

- Mode: Operate. Prioritize recording, finding and sharing sessions.
- Typography: self-hosted Noto Sans JP; no decorative serif headings.
- Themes: daisyUI `takufu` and `takufuDark`, with light / system / dark preferences. System changes apply throughout the app.
- Color source: `tailwind.config.js`. Light uses white / stone surfaces and teal actions; dark uses deep surfaces and cyan actions. Use semantic theme colors rather than hardcoded text colors.
- Geometry: round user, character and provider avatars; daisyUI controls; no thick accent stripes on cards.
- Icons: Iconify Tabler icons. Google, Discord and X use bundled brand icons. BOOTH/TALTO PNG assets originate from their public site icons, downloaded during the inherited OpenCode session.
- Motion: buttons have no entrance animation or hover displacement. Press feedback is small; transitions communicate interaction. Reduced-motion preferences are honored. No blanket page or staggered-list entrances.
- Hierarchy: session overview precedes timeline and statistics. Log and log-free records use the same creation route and detail structure.
- Copy: label inputs and consequences in the player's language. Infrastructure, internal IDs and speculative future behavior do not belong in ordinary product UI.
- Recovery: retain unreadable source data, offer its download, and never automatically reset it. Keep real account data separate from demo records.

Review used Chrome DevTools MCP at desktop, tablet and mobile sizes, in addition to Playwright journeys. The application had no entrance animation on buttons after the change. Existing browser records were inspected and validated without resetting them.
