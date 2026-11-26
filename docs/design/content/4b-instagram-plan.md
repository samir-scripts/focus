# Instagram Content Controls Implementation Plan

> Use `executing-plans` and `test-driven-development` for runtime checkpoints, `browser-testing-with-devtools` for rendered and live qualification, and `verification-before-completion` before committing. Work single-writer on the assigned branch.

**Goal:** Hide suggested Instagram Home posts and Reels discovery independently without removing followed content or an individual reel.

**Architecture:** The desktop owns revisioned choices in SQLite. The native bridge projects supported policy by client wire version. A locally packaged adapter marks only positively identified elements on an exact granted origin and removes its marks when eligibility or route changes.

**Tech stack:** Tauri 2, Svelte 5, TypeScript, Rust/SQLite and MV3.

Offline captures: [Home](references/instagram-home.png), [Reels feed](references/instagram-reels.png), [shared reel](references/instagram-shared.png), [profile picker](references/instagram-profile-picker.png).

**Spec:** [Approved offline interaction proof](references/instagram-feed-preview.html), SHA-256 `aa9abfc9880e38d99a087f7483924ae6679c8869ee0caa19f31aded3dc7a7edf`. Home, Reels feed, shared reel and profile picker are the visual contract. Sample accounts and scenario controls are proof-only.

## Constraints

- Base `1f2df41d325ff18f5f0acd9c5735fab2b53de8c2`; branch `codex/instagram-content-controls`. Stop at a local candidate. Do not change Grace, CI, integration, publishing or persistent user data.
- Default both flags off. Preserve existing adapters, entry guards and exact-origin grants. No remote executable rules, additional permissions or telemetry.
- Keep ambiguous content visible. Use an authorized disposable profile only; retain sanitized structure and counts, never credentials, private content or account identifiers.

## Checkpoints

1. Preserve the approved proof byte for byte and capture the four representative views offline. Commit the plan and proof before runtime edits.
2. Inspect mixed Home, standalone Reels and an individual reel in signed-in desktop Instagram. If blocked, report the access blocker and continue with original account-free fixtures without claiming live selector coverage.
3. Test revision conflicts, defaults and all four flag combinations through revision-checked persistence. Add the two typed flags and wire v6. Test v5 projection with both flags off and last-supported-policy retention plus Update required when either is on. Keep v5 paired-browser opens for the 4A destinations.
4. Test filtering with adjacent protected content, ambiguity, late additions, reused DOM, SPA changes, reversal and grant loss before adding the adapter. Suggested filtering is Home-only and requires positive recommendation evidence. Reels discovery covers the shortcut, recognized Home shelves and standalone feed. Preserve individual playback, comments and sharing; hide only positively distinguishable onward recommendations. Preserve Stories, Following, Favorites, search, Explore, profiles, messages and direct posts.
5. Test Sites rollback and launch eligibility before implementation. Use the approved labels and descriptions, circled info control with exact-origin scope text, fixed Before and immediately updated With rules. Recheck revision, eligibility and grant before deliberate paired-profile opening of Home. After selected-profile access loss, wait for explicit replacement. Keep the 635px reflow and existing keyboard, reduced-motion and forced-colors behavior.
6. Run `npm ci`, `npm run check`, `npm run test:unit`, desktop build and locked Rust workspace tests. Build locked fixture binaries on Linux, package once and run `shared-rule`, `entry` and expanded `selective-feed` against the same Chromium and Firefox archives. Record versions and hashes. Check the retained Chromium artifact in signed-in Instagram, including actual shared-reel playback and reversal. Qualify desktop at 960×640, around 635px and at 200% with keyboard, all themes, reduced motion and forced colors. Write exact results, artifacts and any blockers to `/private/tmp/focus-4b-omp-evidence/CANDIDATE.md`; commit locally and return to the tmux shell for independent review.

## Selector evidence

The [adapter](../../../apps/extension/src/sites/instagram.ts), [unit fixtures](../../../tests/sites/instagram.test.ts), and [packaged browser fixture](../../../tests/sites/fixtures/instagram.html) use original, account-free markup and borrow no third-party lists or page content.

The signed-in disposable Chrome review found the Reels rail link outside navigation landmarks. Four levels above it, a seven-child `div` grouped exact-origin Home, Explore, Messages and Reels links with no articles or video. The repair marks only the shortcut inside a bounded, unambiguous group. Unit fixtures cover late insertion, reuse, adjacent ordinary links and reversal; packaged and signed-in qualification remain pending.

Direct `/reels/` returned a document at that address before in-document canonicalization. A rail click traversed the same exact intermediate route in an existing document; a shared permalink and a reload started on individual-shaped routes instead. The fallback uses browser Navigation API entry changes, exact-origin and policy checks, and, only with discovery provenance, the unique video-owning direct branch of the observed two-branch `main`. It does not use video counts to classify routes. The controls branch is not marked; unrelated navigation, history traversal, page hide and rule removal discard provenance. Unsupported or ambiguous transitions stay visible. The observed shared viewer did not identify selected versus onward ownership; its existing semantic selectors remain fixture-backed.

Three Home article samples had a tightly owned author-row `Follow` control and post link, with manual menus offering “Not interested.” [Meta documents this feedback for recommendations](https://about.fb.com/news/2024/11/introducing-recommendations-reset-instagram/) and [distinguishes connected sources from suggestions](https://engineering.fb.com/2020/12/10/web/how-instagram-suggests-new-content/). Visible recommendation labels were outside articles, and the author-row predicate has not been distinguished from protected followed, reposted, collaborative, and paid content. No new Home predicate was enabled. Menus are not opened by the extension.
