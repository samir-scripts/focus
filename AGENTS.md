# focus. project rules

## Product and scope

focus. lets people remove specific distractions while keeping useful parts of a site. The desktop app owns rule edits and local statistics; browser extensions apply those rules only in profiles that grant the relevant origins. User opt-ins, content rules and time tracking default off; site entry defaults to Allow. Browsing history and telemetry never leave the device. Never present an unimplemented capability as functional, add placeholder toggles or invent statistics.

Follow the [roadmap](docs/roadmap.md) in order and stop at every review gate. The productivity extension to Slice 3 runs from 3A through 3F. Slices 4, 5 and 6 retain their original scope and numbering. The sibling `grace/` checkout stays read-only. Grace owns work sessions. Companion changes in 3D and 3E require a separately reviewed Grace branch and checkout. Use Tauri 2, Svelte 5, TypeScript, Vite, Rust/SQLite and MV3 extensions.

## Design contract

Read [DESIGN.md](DESIGN.md) for visual and accessibility requirements. For desktop redesign work, start with the [approved packet queue](docs/design/desktop-redesign/README.md) and open only the owning packet. Preserve platform drag regions, the read-only popup, honest data states, and normal-build Pause and Block guards.

For the approved redesign, use solid desktop surfaces, Focus Bitmap type, pixel SVG navigation, and bounded theme-aware 3D artwork. Show each palette's canvas, rail, ink, action, and secondary swatches inside the open dropdown so users can compare them before saving. Follow the owning packet for motion, responsive behavior, and the exact visual reference.

For Slice 4A Sites changes, follow the [approved preview and selection contract](docs/design/content/4a-selective-feeds-plan.md). Selected library rows use solid fill and bold text without a side edge or inset shadow; keyboard focus stays distinct.

For new artwork, follow the [PS1-inspired direction and review gate](docs/design/productivity/ps1-visual-direction.md): stepped pixel edges, original faceted artwork, bitmap key legends and motion preferences. Ask before adding any visible treatment outside the approved packet.

Follow the [illustrated 3D.1–3D.3 implementation plan](docs/design/productivity/3d-typewriter-plan.md). Get explicit user approval of the live standalone 3D.2 viewer before mounting it on Home in 3D.3.

For 3F, follow the [approved dashboard and Glance Reading plan](docs/design/productivity/3f-glance-reading-plan.md).

Use the [Dither UI review](docs/design/dither-ui/README.md) as a baseline, not a redesign target. For legacy flake geometry changes, run `python3 -B apps/desktop/tools/test_paper_stock.py` and keep the masks in sync with `apps/desktop/tools/build-paper-stock.py`.

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
