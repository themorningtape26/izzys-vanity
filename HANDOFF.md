# Izzy’s Vanity handoff — 2026-11-27

## Goal and current state
SOL took over on 2026-11-27. Claude troubleshooting is deferred at James’s request. James’s latest release instruction in the preceding thread was “Lets deploy the update to github”; that run failed before a commit or push. The live site still shows the original demo.

Canonical working directory: `/Users/j.averyt/Documents/Hermes/Brain/izzys-vanity`.
Remote: `https://github.com/themorningtape26/izzys-vanity.git`.
Last confirmed local and remote HEAD: `1fbc2dcb569b56ae86d58313996a6f997090fbd7` (original demo). Recheck current status before acting; existing changes belong to this build and must be preserved.

## Prepared changes
Uncommitted edits include app.js, index.html, style.css, package/build configuration, plus new cloud.mjs, local-store.mjs, API handlers, recognition helpers, Supabase schema, setup guide, and unit/browser tests. Features include private approved accounts, cloud collection/draft saving with revision conflict protection, private photo storage, recoverable device saves, automatic drafts, and optional photo recognition requiring confirmation.

Read SUPABASE-SETUP.md for exact setup and limitations. api/config.js reads SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. Recognition additionally needs server-only ANTHROPIC_API_KEY and ANTHROPIC_MODEL. Do not assume an available Anthropic model ID from old memory.

## Supabase
Project URL: https://tbgrxrpyrioemngfijfl.supabase.co
The supplied publishable key was validated successfully against /auth/v1/settings and saved with the URL in ignored .env.local (mode 0600). Read that file locally when needed; do not commit it. No database password or service-role key is needed by the app.

James reports that he has now run supabase/schema.sql and created a login for Izzy. These actions have not yet been independently verified. Creating an Auth user alone does not approve it: confirm its UUID has an entry in public.vanity_accounts. Also confirm public signup is disabled. The earlier read-only check, BEFORE James ran the schema, found no vanity_accounts table and public signup enabled; do not treat that stale check as current state.

Vercel environment variables have not been confirmed. Local .env.local does not configure Vercel. James previously worked through the Supabase/Vercel connector UI, but completion and variable names need checking.

## Validation
Latest npm test completed successfully, exit 0: 10 tests passed, 0 failed. Includes database invitation enforcement, account isolation, revisions, recognition quotas, private photo folders, recognition input safeguards, and public-config secrecy. It took about 277 seconds because local file reads stalled; earlier reports of incomplete tests were superseded by this successful completion.
Browser tests and a complete current production build are NOT confirmed. Prior commands sometimes stalled on filesystem reads. Do not claim live email delivery, real login, live storage, or iOS behavior verified by mocked tests.

## Remaining work
1. Read applicable AGENTS.md and vault _meta instructions; review existing diff and setup guide.
2. Verify current build/browser checks and fix concrete findings sequentially.
3. Confirm live schema, account approval, signup settings, auth redirect origin, and email delivery. Use available authorized access; request secrets through the designated secret tool if truly needed.
4. Configure/confirm the two exact Vercel environment variable names. Keep Anthropic credentials server-only; recognition may remain unavailable without them.
5. Review changes with James in Claude before pushing. Connected GitHub pushes may deploy Vercel automatically. The vault rule explicitly says Codex never deploys; no push or deployment has been performed in this session. Follow the applicable Claude authorization rules for release.
6. After authorized release, verify real login, save/reload, drafts, photos, sign-out and account isolation; confirm second-device behavior.

## Tool/runtime context
Claude CLI was successfully updated from 2.1.220 to 2.1.332; claude --version returned 2.1.332 (Claude Code). James restarted T3 and reports the model selector is now working. No more model-selector troubleshooting is needed.

Previous build context was recovered by reading the Digest watched videos thread; do not resume unrelated digest work. No need to delegate unless James requests it.

## SOL verification — 2026-11-27
- Local and remote HEAD rechecked: both remain `1fbc2dcb569b56ae86d58313996a6f997090fbd7`. Existing build changes preserved.
- Production browser bundle built successfully. All three Playwright tests passed: mobile photo/draft/reload/save, signed-out collection protection, and offline revision conflict protection. These use mocked Supabase services.
- Live Supabase `/auth/v1/settings` returns `disable_signup: false`: public signup still needs disabling. Anonymous access to `vanity_accounts` returns permission denied (42501), confirming the table exists and anonymous reads are denied; approved-user membership is still unverified.
- Vercel project API access using existing local CLI credentials returns HTTP 403 “Not authorized”. Environment variables cannot be confirmed through that access. The production `/api/config` endpoint currently returns 404 on the original demo.
- `.env.local` remains ignored; no secrets were printed or staged.
- SOL reran the complete unit/database suite: 10 passed, 0 failed (exit 0). Browser suite: 3 passed, 0 failed.
