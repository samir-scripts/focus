# focus. roadmap

Review in order. Each productivity slice starts from the newest reviewed local integration head and stops at its own gate. See the [OMP handoff](design/productivity/omp-handoff.md) for branch and review procedure, [DESIGN.md](../DESIGN.md) for the visual contract and the [3D.1–3D.3 implementation plan](design/productivity/3d-typewriter-plan.md) for the typewriter gates.

## Baseline through Slice 3

| Slice | Scope present in the baseline |
| --- | --- |
| 1 | Desktop shell, design contract and CI. The [Dither UI native captures](design/dither-ui/README.md#native-review) record the historical UI. |
| 2 | Browser pairing, per-profile access and one shared YouTube rule. See the [Slice 2 review](slice-2-review.md). |
| 3 | Grayscale and custom site designation. Allow is the default. Pause and Block are guarded in normal builds and remain experimental in the entry fixture. See [Browser setup](browser-setup.md). |

The productivity starting commit is `3b047d1e08c67006db5563297429bdf0ce02dd6f`. Sites opens first and includes Add site. The shell has a left wordmark and a right navigation group, six Light/Dark palette combinations with independently saved Light and Dark choices, and a read-only browser popup. Statistics has an empty state. Home, work sessions, Grace pairing and Reading are future work.

### Slice 3 review limits

The native macOS review exercised the guarded launch and the fixture entry UI at 960×640, around 635 CSS px, and at 200% zoom. It covered keyboard and window controls, six Light/Dark palette combinations and toner pause after relaunch. The unchecked macOS radio circles looked faint; their rendered boundary contrast was unmeasured. Reduced motion and forced colors passed in Chromium emulation only. OS-level modes were not exercised in the native guest. Historical tracked captures and the [Chromium motion procedure](design/dither-ui/README.md#native-review) remain the durable UI references; the Slice 3 native report, captures and browser archives are local untracked review evidence.

The same retained Chromium and Firefox ZIPs passed Linux shared-rule and two fresh-profile entry runs on Chromium 159.0.8154.6 and Firefox 160.0.1. Chromium Block can redirect a service-worker response after the destination document commits; strict pre-load blocking remains unqualified. The Chromium service-worker Pause limitation also remains. Keep the normal-build guards on. Firefox was installed temporarily; signed restart and installer qualification remain Slice 6 work. See [Browser setup](browser-setup.md#reference-verification) for the packaged gate and its limits.

## Productivity slices

### 3A — Design contract

`feature/productivity-3a-design-contract` records the approved target, roadmap and OMP handoff and preserves all eight original PNGs in the [reference index](design/productivity/references/README.md). Documentation and artwork references only. Gate on relative links, embedded images, PNG decoding and recorded hashes matching the supplied originals in a clean checkout of the committed candidate.

### 3B — Typewriter art

**Complete — static art.** `feature/productivity-3b-typewriter-art` adapted the [Grab3D CC0 typewriter](https://grab3d.com/models/electronics/typewriter/) ([source manifest](https://grab3d.com/dl/typewriter/manifest.json)). The vendored GLB SHA-256 is `7d03b0e4dfc7b04bde992eedd6be3d680062b49b59258a30096d33a6ca8189a1`. The Blender recipe recovered 95 islands after welding, including separate keycaps and spacebar. The [CC0 Jerd fallback](https://opengameart.org/content/low-poly-typewriter) was not needed.

3B delivered a local static print and no runtime 3D. The cropped export is the source for the existing Home illustration and Sites insets, not the target for the fully visible 3D.2 viewer.

The [3B artwork and review evidence](design/productivity/typewriter/README.md) include the static export, offline Blender recipe, same-camera clay and hero-size comparison.

### 3C — Shell and Sites

`feature/productivity-3c-shell-sites` applies the poster-led stock, six themes, Sites library and 360px popup treatment. Preserve the existing Add site workflow and move its action to the anchored library position. Keep smaller art on Sites. Home and its interactive toolbar hit region land with the dashboard in 3D.

Run the shell gate, capture native renders at 960×640, around the 635px breakpoint and at 200%, and compare all six theme combinations. Capture measured motion and the matched grain trials required by [DESIGN.md](../DESIGN.md#elevation--depth). Check the rendered unchecked radio boundary, accessibility and native controls. Exercise native reduced motion and forced colors in supporting surfaces; name the engine and separate native results from Chromium emulation. Record any unsupported or untested mode.

See the [3C review procedure and evidence](design/productivity/3c-review.md) for candidate limits and reproduction steps.

### 3D — Start a Grace session from focus.

**Complete — Grace launch.** Grace owns the session profile, timer, phase changes and session controls. A request from focus. opens or brings the installed Grace application forward, then starts the requested session through Grace's own controller. Grace confirms the outcome. Launching its window alone is insufficient to qualify the start. The standalone focus. session candidate was stopped and is outside the revised delivery path.

The supported macOS start interface was built and reviewed on a separate Grace branch and checkout. Starts use an explicit local, opt-in interface with idempotent requests; the optional Grace WebSocket reports state but does not start a session. A repeated request or an unrelated running Grace session must not toggle, restart or replace the timer. The [3D launch record](design/productivity/3d-grace-launch-plan.md#candidate-verification) distinguishes exercised paths from qualification limits.

The focus. entry point preserves the approved shell, [Grace-launch reference](design/productivity/references/approved-cobalt-grace-launch.png) and site-mark correction. 3D delivered the launch path, not interactive artwork or scheduling.

The launch uses one standard native Grace confirmation on first manual use, with no setup files or custom settings. The shared desktop entry point is [`grace_launch::launch`](../apps/desktop/src-tauri/src/grace_launch.rs); 3E must pass its stable occurrence UUID and cannot request consent. See the [3D launch plan](design/productivity/3d-grace-launch-plan.md) for the contract and evidence.

### 3D.1–3D.3 — Interactive Home typewriter

Follow the [illustrated implementation plan](design/productivity/3d-typewriter-plan.md), with one branch and review per slice:

1. **3D.1 — Art and delivery contract.** `feature/productivity-3d1-typewriter-contract` records the approved small Cobalt typewriter, four source images, real US QWERTY requirement and staged review gates. Docs and reference art only.
2. **3D.2 — Standalone viewer.** `feature/productivity-3d2-interactive-typewriter` delivers the local interactive scene and matching still without changing Home. Review the offline live preview, front-on letter proof, all physical keys, both viewport sizes and motion video. Get explicit user approval before a Home change.
3. **3D.3 — Home integration.** `feature/productivity-3d3-dashboard-typewriter` mounts only the approved viewer on Home. Preserve the Grace action, toolbar, themes and stock, and test the actual native shell and real Grace start before independent review.

### 3E — Grace session coordination

The [approved 3E implementation plan](design/productivity/3e-scheduling-plan.md) covers local scheduling and Grace start. Phase-aware browser policy coordination remains separately qualified.

Keep one-off and selected-weekday schedules in focus. While focus. is running or minimized, a due schedule sends the same start request as a manual launch. Skip elapsed or overlapping starts and deduplicate repeated local times. Grace owns session timing and phase transitions. Use Grace's authoritative state for any browser coordination. Apply any separately authorized session rules as an expiring layer over focus. site settings, only in profiles with exact-origin grants. Preserve Pause/Block availability guards. Verify missing and disconnected Grace, duplicate and overlapping requests, phase changes, and local data and policy recovery at the end of work.

### 3F — Glance Reading

See the [approved 3F implementation plan and references](design/productivity/3f-glance-reading-plan.md).

`feature/productivity-3f-glance-reading` adds real opt-in RSS through a pinned Glance release. Run the bundled sidecar on loopback only and theme it through [Glance configuration and CSS](https://github.com/glanceapp/glance/blob/main/docs/configuration.md). Support an existing self-hosted instance with authentication and a system-browser fallback. Isolate native commands, browsing history and telemetry from the Reading webview. Keep sessions usable offline and Reading collapsed during work.

Verify sidecar stop, empty and error states, offline behavior, pinned updates and rollback. Retain exact shipped artifacts with their digests and corresponding source under the [Glance AGPL license](https://github.com/glanceapp/glance/blob/main/LICENSE).

### After 3F — PS1-inspired visual refinement

The [approved visual direction](design/productivity/ps1-visual-direction.md) queues the updated Home rules, button spacing and typewriter treatment for a separately reviewed slice. The local day planner, calendar sync and subsequent slices continue in the order recorded in the [3F handoff](design/productivity/3f-glance-reading-plan.md#follow-on-scope-to-document-only). Apply the same visual language to future surfaces within their own scope and gates.

## Original remaining slices

- **4 — Site adapters.** Nine fixture-backed adapters with protected neighbors, reversal and relevant late-DOM or SPA coverage.
- **5 — Statistics.** Shared opt-in local time tracking and statistics. Show only actual data and keep browsing history and telemetry on-device.
- **6 — Installation and promotion.** Qualify native installers and signed Firefox restart, verify exact candidate builds and attest those artifacts before promotion. Follow [branch protection and promotion](../AGENTS.md#branch-protection-and-promotion).

## Verification

Use the [project shell gate](../AGENTS.md#development-and-verification) for affected desktop code and the native visual gates for changed surfaces. Use failing feature tests before implementing runtime behavior. For policy changes, build the locked native fixture binaries, package Chromium and Firefox once, then run both Linux scenarios (`shared-rule` and `entry`) with that same archive pair. Retain both ZIPs, SHA-256 values, browser versions and reports. Follow the [Linux prerequisites and commands](browser-setup.md#reference-verification). Repeat affected gates after base movement. For 3A and 3D.1, verify docs and source integrity in a fresh checkout; application gates apply when runtime code changes.

## Cumulative review

After 3F, run a scheduled session through Grace start and phase changes, acknowledged rules on qualified granted profiles, Reading collapsed during work, overlay release on break and restoration of the latest baseline at session end. Include the offline path and confirm the candidate never bypasses normal-build entry guards. Retain native captures, both tested SHAs where relevant, exact reports and artifact hashes. Codex reviews the cumulative candidate before any separate `dev` integration decision. This review grants no hosted promotion or push.
