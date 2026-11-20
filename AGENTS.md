# focus. project rules

## Product and scope

focus. lets people remove specific distractions while keeping useful parts of a site. The desktop app owns rule edits and local statistics; browser extensions apply those rules only in profiles that grant the relevant origins. User opt-ins, content rules and time tracking default off; site entry defaults to Allow. Browsing history and telemetry never leave the device. Never present an unimplemented capability as functional, add placeholder toggles or invent statistics.

The approved delivery plan is sequential: (1) desktop shell, design contract and CI; (2) browser pairing, per-profile access and one shared YouTube rule; (3) grayscale and Allow/Pause/Block; (4) nine fixture-backed site adapters; (5) shared opt-in statistics; (6) qualified native installations and promotion of exact tested builds. Stop at each slice's gate for review. The sibling `grace/` is read-only reference, not a dependency. Use Tauri 2, Svelte 5, TypeScript, Vite, Rust/SQLite and MV3 extensions; use the shared UI package and CSS tokens rather than a second design system.

## Design contract

`packages/ui/src/tokens.css` is the executable source of truth for theme, spacing, type and motion. Bundle licensed regular and bold bitmap faces with their required notices and a local fallback. Use the same type family for all app-owned text, including the `focus.` wordmark, hostnames and numeric values. Keep text semantic and selectable, with legible small glyphs and stronger display lettering.

Adapt the original offset-carriage typewriter mark and keep the literal `focus.` wordmark. Site marks identify sites, not affiliation. Use approved official or pinned licensed marks with attribution, rendered in theme foreground colors rather than saturated brand colors. Subtle static halftoning of site SVGs is allowed only where the license and brand guidelines permit it and the mark remains recognizable. Use an original neutral `LI` monogram for LinkedIn and labeled neutral monograms where other platform marks are not permitted.

Desktop uses a compact Grace-inspired toolbar for the `focus.` wordmark, Sites, Statistics and Settings, with a thin active underline. Browser setup belongs in Settings. Sites uses a 196px flat rail with a bold Site Library heading, a 2px selection edge and neutral fill. Align each site mark with the site name and place the hostname below the name. Use 15px library labels and rows at least 42px high. Use one window canvas, thin separators and compact, consistent headings. The detail pane uses flat rows for Browser access, Site entry, Content rules and Track time; Pause options appear only for Pause. At 635px and below place the flat library above the detail; don’t introduce horizontal scrolling. Popup is a 360px one-column read-only summary and link to the desktop, not a second editor. Statistics uses a date selector, a large bitmap total, bars only for actual data and accessible exact per-site values; no scores, streaks or coaching.

On macOS, overlay the toolbar behind the native traffic lights so its background follows the app theme. Handle window dragging in AppKit with the original mouse-down event; keep the top 46pt and the rightmost 124pt navigation area in sync with the toolbar layout. Native window controls and labeled SVG navigation buttons must remain clickable. Windows and Linux keep their system title bars.

Use System appearance by default. Keep System/Light/Dark independent of the saved Light and Dark palettes (Sage default; Cobalt and Plum alternatives). Honor reduced motion; use visible 2px focus rings with 3px offset, 4.5:1 normal text contrast and 3:1 interactive boundaries. Avoid decorative cards, duplicate headings and unnecessary animation. Reserve the ring motif for Site entry.

Define whole-shell palettes in `tokens.css`. Preserve the restrained utility styling: 3px controls, 4px notices and 6px dialogs, thin rules, no gradients or glow. Use subtle paper grain and variably sized toner flakes on the canvas and library backgrounds. Keep the curl in the wide Sites heading margin and the Statistics empty-state illustration; print illustrations can be turned off. Keep background texture off text, controls and data.

Use opaque ink-reversal fills for hover and press, including selected controls. Ease hover colors in and out over 280ms independently of press motion. Motion uses Grace's ease-out curve: a one-pixel press, a sliding view marker, and a brief scale-and-fade for pointer-driven view changes. Keyboard navigation and OS reduced motion must not animate view changes.

Let toner flakes drift gently and persist the user’s pause preference across launches. Limit the toner sweep to one pass per pointer hover on the `focus.` wordmark and large site title, without obscuring lettering. Disable flake drift and sweeps under reduced motion. In forced colors, suppress decorative artwork and effects, including paper grain, flakes, sweeps and SVG halftoning; keep text, controls and site marks legible.

## Development and verification

Write feature tests red first, then implement and run the affected tests green. Site selectors need positive and adjacent protected-negative fixtures, reversal and relevant late-DOM/SPA cases. Track licenses, copyright and source provenance for every imported asset or adapted selector. Never fetch executable rules or lists at runtime.

Current slice gate from the product root:

```sh
npm ci && npm run check && npm run test:unit
npm run build --workspace @focus/desktop
(cd apps/desktop/src-tauri && cargo test --locked --workspace)
npm run tauri -- dev
```

Inspect the running shell at 960×640, the 635px reflow breakpoint and 200% zoom. Check keyboard interaction, native window controls, contrast in all six Light/Dark palette combinations, reduced motion, forced colors and particle pause persistence. Check bitmap legibility in Browser access, No browsers connected and Browser settings.

CI runs the shell checks and the packaged browser scenario. Interactive macOS inspection is manual. Run the browser gate on Linux with the prerequisites in [Browser setup](docs/browser-setup.md):

```sh
cargo build --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --bin focus-native-host --bin focus-fixture-admin
npm run package:extensions && npm run test:browser -- --case shared-rule
```

Keep the two tested archives with their SHA-256 hashes and browser versions. The Firefox gate covers temporary installation. Signed Firefox restart and native installer qualification belong to slice 6.

## Branch protection and promotion

`dev` is development; all three branches accept reviewed PRs only. Promote `dev` → `stage` → `release`. Promotion PRs must originate in this repository from the immediately preceding branch and have a merge-result tree identical to the source tree. This permits metadata-only merge commits but rejects conflict resolutions that change content. Keep the branch current and rerun checks after any base or source movement. Workflow edits require maintainer review. Release publication is not enabled; future qualification on `stage` must test and attest exact candidate artifacts before promotion and publishing.

Review the CI workflow and ruleset migration separately. Once a remote is configured, verify the hosted dev, stage and release environments, set `dev` as the default branch, and configure branch protection:

1. Enable GitHub Actions and open a PR that runs `.github/workflows/ci.yml` to register its check. Confirm `Focus CI / required` appears and fails when any dependency fails, is cancelled or is skipped.
2. In repository Settings → Rules → Rulesets, create/import the repository branch ruleset from `.github/rulesets/protected-branches.json`, or POST that JSON to the repository rulesets REST endpoint with an administrator credential. The workflow job's check-run context is `required` (displayed as `Focus CI / required`); select the actual GitHub Actions check as its source in the UI when available. Ensure the selected context matches the registered check, rather than creating an unresolvable similarly named check. The ruleset has no bypass actors.
3. Activate it and verify it applies to `dev`, `stage` and `release`: one approval, stale reviews dismissed, last push approved, conversations resolved, current successful required check, no direct updates, force pushes or deletion. Confirm repository plan support for these rules and verify protections using a disposable PR. Restrict ruleset/workflow administration to maintainers; where supported, configure code-owner review of `.github/workflows/**` through repository ownership settings.
4. Keep merge queues disabled until CI handles `merge_group` and validates queued promotion trees. PR workflows execute the proposed workflow definition, so review workflow/ruleset changes carefully; rulesets alone cannot defend against an approved weakening of CI. Do not add privileged publishing, release credentials or `pull_request_target` to this workflow.
