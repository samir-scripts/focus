# Slice 3D Grace launch implementation plan

> Completed Slice 3D launch record. Preserve these controls and qualification limits; the [3D.1–3D.3 plan](3d-typewriter-plan.md) governs later artwork only.

**Goal:** Start the selected Grace session from focus. on macOS, and report success only after Grace confirms the corresponding native start. [Roadmap and acceptance](../../roadmap.md#3d--start-a-grace-session-from-focus).

**Workflow:** Superpowers, Ask Matt and Using Agent Skills for prewalk; Writing Plans and API and Interface Design for the two-app boundary; Test-Driven Development for native and shell behavior; Impeccable and Design for faithful implementation of the approved mockup; Verification Before Completion for the native review gate.

**Clean bases:** focus. `feature/productivity-3d-grace-launch` at `d4c53a5da61bf58017dc29b429d229668bc86e81`, equal to `integration/productivity-desktop`; contains site-mark fix `1fe1816`. Grace `feat/focus-launch-companion` at fetched `origin/dev` `458ae9f5734854c481a127631ca8eb9e1bc5eb26`. Neither task branch tracks an upstream.

## Contract and implementation order

- [x] **Grace controller.** The idle-only engine command drains earlier round or reset events before authorization, then starts the selected profile at its first work round, even if the idle timer was showing a break after Skip. Running, paused and suspended engines reject it without changing their session. Local Reset and external launch cannot overlap.
- [x] **Authenticated local protocol.** A versioned per-process Unix socket verifies both peers’ audit tokens and signing requirements. A one-use proof binds the request UUID and intent to the connection before Grace shows its native sheet or claims the timer. Approval is local; no setup files or WebSocket changes. Grace persists each decision, including interrupted claims that must not run again.
- [x] **focus. launch.** Launch Services enumerates `com.splode.pomotroid` copies, and focus. verifies the Grace product, supported protocol, signature, exact bundle path and peer PID. AppKit substitution is disabled. [`grace_launch::launch`](../../../apps/desktop/src-tauri/src/grace_launch.rs) is the shared Rust entry point; `start_grace` is the manual Tauri command. It does not retry sent requests or infer acceptance from app launch.
  A running Grace without the supported launch protocol blocks launching another copy that would share its data. An unrelated Pomotroid with the legacy identifier does not block discovery.
- [x] **Approved dashboard.** Tracked [exact reference](references/approved-cobalt-grace-launch.png) and [canonical mark](../../../apps/desktop/src/assets/grace-mark.svg), with digests and provenance. Centered Home, labeled Sites and named icon-only Statistics/Settings. No timer or schedule UI in focus.

## Candidate verification

- Disposable macOS 15.7.7 Tart guest, both actual Tauri bundles, built with `FOCUS_GRACE_ADHOC_FIXTURE=1` and ad-hoc signed using their real bundle identifiers. No changes to installed host apps or their data. Test data selected Grace’s seven-minute **Writing Review** profile, with no approval or setup file on first use.
- Native evidence: first-use allow, Escape denial, peer-disconnect sheet dismissal, duplicate activation, cold and same-process warm starts, running and paused busy without changing the timer, approval after both processes restart, and a cold start with an unrelated same-identifier Pomotroid process present. Missing and protocol-old fixtures were not launched. Grace Rust tests cover replay across database reopen, including interrupted claims; focus. tests reject an uncorrelated response.
- ScreenCaptureKit captures: six 960×640 palette combinations, Light Cobalt at 635px and native 200% page zoom, keyboard focus, Grace consent and running timer, busy, missing and incompatible. Hardware key and pointer input exercised the shared Home/Sites hit regions, the drag gap and native minimize/restore. Chromium measured normal Home title contrast ≥13.12:1 and action text/border contrast ≥7.14:1; the separate stock motion gate passed reduced-motion and forced-colors emulation. No native forced-colors qualification.
- focus.: `npm ci`, check, 77 unit tests, production frontend build, disposable Tauri dev launch, 36 workspace Rust tests and the debug `.app` build. Grace: `npm ci`, check, 13 frontend unit tests, static build, 226 locked Rust tests (19 ignored; `test_accessibility_commands_callable` filtered), and the debug `.app` build. Browser policy did not change; packaged enforcement tests were not rerun.
- Local evidence: `/private/tmp/focus-grace-launch-omp-logs/guest/`; `native-final.log`, `pointer-cold.log`, `native-negative.log`, `native-200.log`, `final-bundle-sha256.txt` and `SHA256SUMS`. The OMP log shows `openai-codex/gpt-6.2-sol` at startup and on the first write in Ghostty/tmux `%8`; prewalk and implementation used the same model.

**Review limits:** The Developer ID-signed pair, configured publisher team IDs and older macOS fallback have not been qualified. No Windows or Linux support is claimed. Below 314 CSS px the left/right toolbar targets can overlap; changing that narrow layout requires the reviewer’s explicit visual approval. No integration or promotion.

## Slice 3E carry-forward

The scheduler calls the same start entry point with the stable UUID of a due occurrence. Test dispatch while running or minimized, no backfill of elapsed starts, deduplication for overlaps and repeated wall-clock times, and truthful unavailable/busy results. Grace still owns the selected profile, clock, phases, pause, end and enforcement.
