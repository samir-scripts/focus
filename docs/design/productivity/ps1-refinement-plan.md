# PS1 visual refinement implementation plan

**Goal:** Apply the approved PS1 finish to Home and the existing Sessions typewriter without changing workflows. **Base:** reviewed 3F `0d3b72c3d730f97cfec203f6c3342ff60e22a168`; clean starting commit `bd722001123eacf716cf9224a29ff2fbfb1398b4` on `feature/productivity-ps1-visual-refinement`.

**Visual authority:** [direction](ps1-visual-direction.md), [Light proof and final button padding](references/ps1-dashboard-light.png), [Dark appearance](references/ps1-dashboard-dark.png), [four-frame timing](references/ps1-header-motion.gif), [typewriter art direction](references/ps1-typewriter-study.png), and [provenance and hashes](references/README.md#approved-ps1-inspired-direction). No new visual treatments. Frontend and renderer only; preserve solid paper and Settings ink/hover.

## Ordered commits

1. **docs: record PS1 refinement handoff.** Link this plan from the direction and OMP handoff; resolve the links and check the four hashes. Capture a matched 3F baseline before runtime edits.
2. **feat: add stepped ink to dashboard section rules.** In `HomeSchedules.svelte`, `App.svelte` and `ReadingPanel.svelte`, place straight 2 CSS px rules above Calendar, Sessions and Reading. Use four held frames over 3.6 seconds with stationary bounds and local ink changes. Keep article and column dividers thin. Reuse saved toner and visibility state; pause freezes the current frame, reduced motion is static, and forced colors uses a solid system rule. Sample pixels and geometry across two cycles.
3. **feat: refine dashboard button edges and spacing.** Step the corners of Home outline actions and month arrows. Retain continuous contrasting perimeters, clear labels, opaque hover and unclipped keyboard focus. Set New schedule padding to 4px vertical and 10px horizontal in every theme. Verify pointer, keyboard and narrow layout without changing calendar days, article titles, the Sessions editor or Settings controls.
4. **feat: render the typewriter with the approved PS1 finish.** Start in `typewriter/ink.ts`; use existing geometry, nearest-neighbor rendering, no antialiasing, cobalt facets and a stationary flat hot-pink polygon without a shadow. Keep literal bitmap legends and legible caps; preserve model, atlas, key map, camera, weighted full turns on both axes, hit testing, flick coast, continuous six-second bob, individual presses and Escape reset. Regenerate `rest.png` via `apps/desktop/typewriter-preview/render.mjs` and update `VIEWER-SHA256SUMS`. Use the same still for the 104×96 Home launcher and Sessions loading/fallback. Compare thumbnail, live rest and enlarged keyboard.

## Execution and qualification

Start read-only with Using Superpowers, Ask Matt and Using Agent Skills. Use Writing Plans for checkpoints, TDD for red/green evidence, Impeccable and Design to compare proofs, Algorithmic Art for reproducible raster effects, and Verification Before Completion before each commit. Save a failing test or observation before each change and commit each verified checkpoint promptly. Preserve the session JSONL for GPT-6.2 Sol at start and first edit.

Run `npm ci`, `npm run check`, `npm run test:unit`, `npm run build --workspace @focus/desktop`, and `(cd apps/desktop/src-tauri && cargo test --locked --workspace)`. Run the desktop motion check and offline viewer proof; verify all 46 physical keys and asset hashes.

Qualify the exact committed package using the isolated 3F native setup and Grace `b624344fc3266eb15c9d32efb04486985e8edc43`, with disposable data only:

- Compare native Home to Light and Dark at 960×640 and 100%; verify 635px, 200% zoom, six palette/appearance combinations, wrapping long headlines, 4.5:1 normal type, 3:1 control boundaries and visible Open sessions at default size.
- Record ≥7.2s of idle motion and hover entry, solid hold, exit and keyboard focus at actual size. Check pause/resume, paused relaunch, minimize/restore, reduced motion, forced colors and Settings. Label browser emulation separately.
- Capture launcher, live Sessions, fallback and enlarged labels. Rotate through the underside on each axis, compare slow drag to flick, press adjacent keys after rotation, reset with Escape, toggle illustrations and exercise renderer failure. Check bob, stationary disc and live legends.
- Press a model key and start Grace by keyboard; also save a one-off from Home and let it start while focus. is minimized. Record the expected real Grace profile and Pause, with two decreasing timer readings per start. Compare a real RSS headline on Home and in the reader; verify collapse on confirmed start and deliberate reopening.

Record the base, candidate SHA and tree, commits, bundle hashes, red/green results, proof comparisons, recordings, Grace countdowns and reproducible blocker commands. The local run uses `/private/tmp/focus-3f-codex-review/final-0d3b72c/REVIEW.md` for prior qualification and `/private/tmp/focus-ps1-omp-evidence` for output. Keep independent gates moving if one is blocked. Return to the tmux shell for Codex to review; no push or merge.
