# focus. project rules

## Product and scope

focus. lets people remove specific distractions while keeping useful parts of a site. The desktop app owns rule edits and local statistics; browser extensions apply those rules only in profiles that grant the relevant origins. User opt-ins, content rules and time tracking default off; site entry defaults to Allow. Browsing history and telemetry never leave the device. Never present an unimplemented capability as functional, add placeholder toggles or invent statistics.

Follow the [roadmap](docs/roadmap.md) in order and stop at every review gate. The productivity extension to Slice 3 runs from 3A through 3F. Slices 4, 5 and 6 retain their original scope and numbering. The sibling `grace/` checkout stays read-only. Slice 3E companion changes require a separately reviewed Grace branch and checkout. Use Tauri 2, Svelte 5, TypeScript, Vite, Rust/SQLite and MV3 extensions.

## Design contract

Read [DESIGN.md](DESIGN.md) for visual and accessibility requirements. Use the shared UI package and [CSS tokens](packages/ui/src/tokens.css) for the executable theme, spacing, type and motion. Apply the approved productivity target only in the owning slice. Until then, preserve the baseline toolbar geometry and drag regions, Sites layout, read-only popup and Statistics empty state. Keep Pause and Block guarded in normal builds.

For historical captures and the toner check, read the [Dither UI review](docs/design/dither-ui/README.md). For flake geometry changes, run `python3 -B apps/desktop/tools/test_paper_stock.py` and keep the masks in sync with `apps/desktop/tools/build-paper-stock.py`.

## Development and verification

Write feature tests red first, then implement and run the affected tests green. Site selectors need positive and adjacent protected-negative fixtures, reversal and relevant late-DOM/SPA cases. Track licenses, copyright and source provenance for every imported asset or adapted selector. Never fetch executable rules or lists at runtime.

For affected desktop runtime changes, run the shell gate from the product root.

```sh
npm ci && npm run check && npm run test:unit
npm run build --workspace @focus/desktop
(cd apps/desktop/src-tauri && cargo test --locked --workspace)
npm run tauri -- dev
```

Inspect the running shell at 960×640, the 635px reflow breakpoint and 200% zoom. Check keyboard interaction, native window controls, contrast in all six Light/Dark palette combinations, reduced motion, forced colors and particle pause persistence. Check bitmap legibility in Browser access, No browsers connected and Browser settings.

CI runs the shell checks and the packaged browser scenario. Interactive macOS inspection is manual. Use the Linux prerequisites in [Browser setup](docs/browser-setup.md). For policy changes, run both packaged scenarios on the same archives.

```sh
cargo build --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --bin focus-native-host --bin focus-fixture-admin
npm run package:extensions
npm run test:browser -- --case shared-rule
npm run test:browser -- --case entry
```

Keep the two tested archives with their SHA-256 hashes and browser versions. The Firefox gate covers temporary installation. Signed Firefox restart and native installer qualification belong to slice 6.

## Branch protection and promotion

The intended hosted promotion path is `dev` → `stage` → `release`, with `dev` as the development branch. The GitHub remote exists, but hosted protections are not configured. Keep local integration on a separate branch; a clean integration branch is not a reviewed promotion.

Once configured, all three branches accept reviewed PRs only. Promotion PRs must originate in this repository from the immediately preceding branch and have a merge-result tree identical to the source tree. This permits metadata-only merge commits but rejects conflict resolutions that change content. Keep the branch current and rerun checks after any base or source movement. Workflow edits require maintainer review. Release publication is not enabled; future qualification on `stage` must test and attest exact candidate artifacts before promotion and publishing.

Review the CI workflow and ruleset migration separately. Once a remote is configured, verify the hosted dev, stage and release environments, set `dev` as the default branch, and configure branch protection:

1. Enable GitHub Actions and open a PR that runs `.github/workflows/ci.yml` to register its check. Confirm `Focus CI / required` appears and fails when any dependency fails, is cancelled or is skipped.
2. In repository Settings → Rules → Rulesets, create/import the repository branch ruleset from `.github/rulesets/protected-branches.json`, or POST that JSON to the repository rulesets REST endpoint with an administrator credential. The workflow job's check-run context is `required` (displayed as `Focus CI / required`); select the actual GitHub Actions check as its source in the UI when available. Ensure the selected context matches the registered check, rather than creating an unresolvable similarly named check. The ruleset has no bypass actors.
3. Activate it and verify it applies to `dev`, `stage` and `release`: one approval, stale reviews dismissed, last push approved, conversations resolved, current successful required check, no direct updates, force pushes or deletion. Confirm repository plan support for these rules and verify protections using a disposable PR. Restrict ruleset/workflow administration to maintainers; where supported, configure code-owner review of `.github/workflows/**` through repository ownership settings.
4. Keep merge queues disabled until CI handles `merge_group` and validates queued promotion trees. PR workflows execute the proposed workflow definition, so review workflow/ruleset changes carefully; rulesets alone cannot defend against an approved weakening of CI. Do not add privileged publishing, release credentials or `pull_request_target` to this workflow.
