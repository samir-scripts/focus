# focus. project rules

## Product and scope

focus. lets people remove specific distractions while keeping useful parts of a site. The desktop app owns rule edits and local statistics; browser extensions apply those rules only in profiles that grant the relevant origins. User opt-ins, content rules and time tracking default off; site entry defaults to Allow. Browsing history and telemetry never leave the device. Never present an unimplemented capability as functional, add placeholder toggles or invent statistics.

The approved delivery plan is sequential: (1) desktop shell, design contract and CI; (2) browser pairing, per-profile access and one shared YouTube rule; (3) grayscale and Allow/Pause/Block; (4) nine fixture-backed site adapters; (5) shared opt-in statistics; (6) qualified native installations and promotion of exact tested builds. Stop at each slice's gate for review. The sibling `grace/` is read-only reference, not a dependency. Use Tauri 2, Svelte 5, TypeScript, Vite, Rust/SQLite and MV3 extensions; use the shared UI package and CSS tokens rather than a second design system.

## Design contract

`packages/ui/src/tokens.css` is the executable source of truth for theme, spacing, type and motion. Use the original offset-carriage typewriter mark and literal `focus.` wordmark. Mona Sans is the UI face, Mona Sans Mono the numeric face; bundle their OFL notices. Use approved official or pinned licensed platform marks with attribution and respect individual brand guidelines; use a neutral labeled monogram when a mark is not permitted. Marks identify sites, not affiliation.

Desktop uses a compact Grace-inspired toolbar for the `focus.` wordmark, Sites, Statistics and Settings, with a thin active underline. Browser setup belongs in Settings. Sites uses a 196px flat library rail, icon then name, with a 2px selection edge and neutral fill. Use one window canvas, thin separators and compact, consistent headings. The detail pane uses flat rows for Browser access, Site entry, Content rules and Track time; Pause options appear only for Pause. At 635px and below place the flat library above the detail; don’t introduce horizontal scrolling. Popup is a 360px one-column read-only summary and link to the desktop, not a second editor. Statistics uses a date selector, a large mono total, bars only for actual data and accessible exact per-site values; no scores, streaks or coaching.

Use system theme by default with System/Light/Dark settings. Honor reduced motion; use visible 2px focus rings with 3px offset, 4.5:1 normal text contrast and 3:1 interactive boundaries. Avoid decorative cards, duplicate headings and unnecessary animation. Reserve the ring motif for Site entry.

Use the muted sage paper and evergreen ink palettes in `tokens.css`. The appearance should feel like a restrained older utility: 3px controls, 4px notices and 6px dialogs, thin rules, no gradients or glow. Use Mona Sans Mono for the compact wordmark, hostnames and numeric values. Render platform marks in theme foreground colors, not saturated brand colors. Use names alongside the marks, 15px library labels, and 42px minimum library rows.

## Development and verification

Write feature tests red first, then implement and run the affected tests green. Site selectors need positive and adjacent protected-negative fixtures, reversal and relevant late-DOM/SPA cases. Track licenses, copyright and source provenance for every imported asset or adapted selector. Never fetch executable rules or lists at runtime.

Current slice gate from the product root:

```sh
npm ci && npm run check && npm run test:unit
npm run build --workspace @focus/desktop
(cd apps/desktop/src-tauri && cargo test --locked --workspace)
npm run tauri -- dev
```

Inspect the running shell at 960×640, narrow/reflow, keyboard, 200% zoom and reduced motion. CI runs the first four checks on GitHub-hosted runners; interactive inspection is manual. The future `npm run package:extensions` and `npm run test:browser` gates begin with the browser implementation, not this shell. Later slices add their exact affected unit, native, browser, installation and live-site gates; do not treat this CI as proof of browser behavior or release qualification.

## Branch protection and promotion

`main` is development; all three branches accept reviewed PRs only. Promote `main` → `staging` → `release`. Promotion PRs must originate in this repository from the immediately preceding branch and have a merge-result tree identical to the source tree. This permits metadata-only merge commits but rejects conflict resolutions that change content. Keep the branch current and rerun checks after any base or source movement. Workflow edits require maintainer review. Release publication is not enabled; future staging qualification must test and attest exact candidate artifacts before promotion and publishing.

No remote or protection has been configured. Once the repository and all three branches exist, an administrator should:

1. Enable GitHub Actions and open a PR that runs `.github/workflows/ci.yml` to register its check. Confirm `Focus CI / required` appears and fails when any dependency fails, is cancelled or is skipped.
2. In repository Settings → Rules → Rulesets, create/import the repository branch ruleset from `.github/rulesets/protected-branches.json`, or POST that JSON to the repository rulesets REST endpoint with an administrator credential. The workflow job's check-run context is `required` (displayed as `Focus CI / required`); select the actual GitHub Actions check as its source in the UI when available. Ensure the selected context matches the registered check, rather than creating an unresolvable similarly named check. The ruleset has no bypass actors.
3. Activate it and verify it applies to `main`, `staging` and `release`: one approval, stale reviews dismissed, last push approved, conversations resolved, current successful required check, no direct updates, force pushes or deletion. Confirm repository plan support for these rules and verify protections using a disposable PR. Restrict ruleset/workflow administration to maintainers; where supported, configure code-owner review of `.github/workflows/**` through repository ownership settings.
4. Keep merge queues disabled until CI handles `merge_group` and validates queued promotion trees. PR workflows execute the proposed workflow definition, so review workflow/ruleset changes carefully; rulesets alone cannot defend against an approved weakening of CI. Do not add privileged publishing, release credentials or `pull_request_target` to this workflow.
