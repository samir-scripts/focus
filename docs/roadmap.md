# focus. roadmap

Review in order. Each productivity slice starts from the newest reviewed local integration head and stops at its own gate. See the [OMP plan and handoff](design/productivity/omp-handoff.md) for branch and review procedure and [DESIGN.md](../DESIGN.md) for the visual target.

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

`feature/productivity-3b-typewriter-art` adapts the editable [Grab3D CC0 typewriter](https://grab3d.com/models/electronics/typewriter/) using its [manifest](https://grab3d.com/dl/typewriter/manifest.json). The inspected GLB SHA-256 is `7d03b0e4dfc7b04bde992eedd6be3d680062b49b59258a30096d33a6ca8189a1`. Inspection found 95 disconnected islands after weld. Verify separate keycap geometry in Blender before committing to the source. The fallback is [Jerd’s rigged CC0 FBX](https://opengameart.org/content/low-poly-typewriter), ZIP SHA-256 `8127d7447661c71f1bd87f334efe9cd2c38dcbf2ea528a967ee19d7125540cf3`, with bones `Key_1` through `Key_22` and `Space`.

Track source, license, hash and an editable scene or reproducible import and render recipe. Review camera-matched clay and Cobalt exports side by side with the approved reference at actual size. Verify the low front-right camera, separate near spacebar and keycaps, paper meeting the platen, hard facets and bounded print treatment. Deliver local static art for later surfaces. No runtime 3D.

The [3B artwork and review evidence](design/productivity/typewriter/README.md) include the static export, offline Blender recipe, same-camera clay and hero-size comparison.

### 3C — Shell and Sites

`feature/productivity-3c-shell-sites` applies the poster-led stock, six themes, Sites library and 360px popup treatment. Preserve the existing Add site workflow and move its action to the anchored library position. Keep smaller art on Sites. Home and its interactive toolbar hit region land with the dashboard in 3D.

Run the shell gate, capture native renders at 960×640, around the 635px breakpoint and at 200%, and compare all six theme combinations. Capture measured motion and the matched grain trials required by [DESIGN.md](../DESIGN.md#elevation--depth). Check the rendered unchecked radio boundary, accessibility and native controls. Exercise native reduced motion and forced colors in supporting surfaces; name the engine and separate native results from Chromium emulation. Record any unsupported or untested mode.

See the [3C review procedure and evidence](design/productivity/3c-review.md) for candidate limits and reproduction steps.

### 3D — Start a Grace session from focus.

Grace owns the session profile, timer, phase changes and session controls. A request from focus. opens or brings the installed Grace application forward, then starts the requested session through Grace's own controller. Grace confirms the outcome. Launching its window alone is insufficient to qualify the start. The standalone focus. session candidate was stopped and is outside the revised delivery path.

Build the start interface on a separate, reviewed Grace branch and checkout. The existing optional Grace WebSocket can report timer state. The installed version inspected on November 22, 2026 does not expose a supported external start command. Use an explicit local, opt-in interface with idempotent requests. A repeated request or an already-running unrelated Grace session must not toggle, restart, or replace the timer. Exercise cold launch, a running window, a missing or incompatible build, and rejected and duplicate requests against both exact candidate commits with disposable data.

The focus. entry point uses the approved shell and existing visual language. Present any new visual treatment for approval before implementing it. Keep the existing site-mark correction.

The 3D candidate uses one standard native Grace confirmation on first manual use, with no setup files or custom settings. The shared desktop entry point is [`grace_launch::launch`](../apps/desktop/src-tauri/src/grace_launch.rs); 3E must pass its stable occurrence UUID and cannot request consent. See the [3D candidate plan](design/productivity/3d-grace-launch-plan.md) for the launch and review boundaries.

### 3E — Grace session coordination

Keep one-off and selected-weekday schedules in focus. While focus. is running or minimized, a due schedule sends the same start request as a manual launch. Skip elapsed or overlapping starts and deduplicate repeated local times. Grace owns session timing and phase transitions. Use Grace's authoritative state for any browser coordination. Apply any separately authorized session rules as an expiring layer over focus. site settings, only in profiles with exact-origin grants. Preserve Pause/Block availability guards. Verify missing and disconnected Grace, duplicate and overlapping requests, phase changes, and local data and policy recovery at the end of work.

### 3F — Glance Reading

`feature/productivity-3f-glance-reading` adds real opt-in RSS through a pinned Glance release. Run the bundled sidecar on loopback only and theme it through [Glance configuration and CSS](https://github.com/glanceapp/glance/blob/main/docs/configuration.md). Support an existing self-hosted instance with authentication and a system-browser fallback. Isolate native commands, browsing history and telemetry from the Reading webview. Keep sessions usable offline and Reading collapsed during work.

Verify sidecar stop, empty and error states, offline behavior, pinned updates and rollback. Retain exact shipped artifacts with their digests and corresponding source under the [Glance AGPL license](https://github.com/glanceapp/glance/blob/main/LICENSE).

## Original remaining slices

- **4 — Site adapters.** Nine fixture-backed adapters with protected neighbors, reversal and relevant late-DOM or SPA coverage.
- **5 — Statistics.** Shared opt-in local time tracking and statistics. Show only actual data and keep browsing history and telemetry on-device.
- **6 — Installation and promotion.** Qualify native installers and signed Firefox restart, verify exact candidate builds and attest those artifacts before promotion. Follow [branch protection and promotion](../AGENTS.md#branch-protection-and-promotion).

## Verification

Use the [project shell gate](../AGENTS.md#development-and-verification) for affected desktop code and the native visual gates for changed surfaces. Use failing feature tests before implementing runtime behavior. For policy changes, build the locked native fixture binaries, package Chromium and Firefox once, then run both Linux scenarios (`shared-rule` and `entry`) with that same archive pair. Retain both ZIPs, SHA-256 values, browser versions and reports. Follow the [Linux prerequisites and commands](browser-setup.md#reference-verification). Repeat affected gates after base movement. For 3A, verify docs and source integrity in a fresh checkout; application gates apply when runtime code changes.

## Cumulative review

After 3F, run a scheduled session through Grace start and phase changes, acknowledged rules on qualified granted profiles, Reading collapsed during work, overlay release on break and restoration of the latest baseline at session end. Include the offline path and confirm the candidate never bypasses normal-build entry guards. Retain native captures, both tested SHAs where relevant, exact reports and artifact hashes. Codex reviews the cumulative candidate before any separate `dev` integration decision. This review grants no hosted promotion or push.
