# Desktop redesign implementation plan · packet 00

> Use executing-plans per packet, in a fresh OMP session and isolated worktree. Packet 00 is docs only.

**Goal:** Deliver the November 28, 2026 user-approved desktop and Sites design in independently reviewable changes.

**Architecture:** Keep the existing Tauri 2, Svelte 5, TypeScript, shared UI, SQLite and MV3 boundaries. Presentation does not grant data access; contract packets use synthetic fixtures only.

**Spec:** [Design contract](../../../DESIGN.md), [proof and provenance](evidence.md), [resolved palette](palette.json), [local SHA-256 manifest](approved-sha256.txt). Reviewed dev for packet 00: `12bac2c35ad85a7b6f6f38c0fffd67940b2876d4`; archive freeze: `ed1b194c6963ccf3dbe88417da860b1d1be0f21b`.

## Queue

1. [01 desktop-palettes](01.md)
2. [02 desktop-solid-canvas](02.md)
3. [03 desktop-tactile-controls](03.md)
4. [04 desktop-model-motion](04.md)
5. [05 desktop-sites-identity](05.md)
6. [06 desktop-sites-rules-preview](06.md)
7. [07 desktop-settings-categories](07.md)
8. [08 desktop-quick-switch](08.md)
9. [09 desktop-inline-sessions](09.md)
10. [10 desktop-reading-marks](10.md)
11. [11 desktop-statistics-identity](11.md)
12. [12 desktop-dashboard-editor](12.md)
13. [D1 grace-history-contract](D1.md)
14. [D2 screen-time-contract](D2.md)

UI packets run serially; start each from current reviewed dev containing its prerequisites, never the previous candidate branch. D1 may run after 00 alongside one UI session; D2 follows reviewed D1 and never overlaps it. Use distinct sessions, worktrees and branches. Refresh the base and revalidate if it moves. The [roadmap](../../roadmap.md) and [repository rules](../../../AGENTS.md) still govern product scope. Grace stays read-only. Neither contract enables runtime access or a collector.

## Review and publication

1. Use using-superpowers, using-agent-skills and ask-matt to route the session; executing-plans for the owning packet, writing-for-agents for its handoff, verification-before-completion for the gate. Start OMP in Ghostty/tmux with read-only prewalk; record pane, cwd, branch, base, ordered todos and model before and at first edit.
2. Verify the clean export against the SHA manifest. Run the frozen [replay.cjs](approved/replay.cjs) with Node; use fresh browser storage, replay the packet route and state, and capture the result. Named stills and GIFs prove only their indexed states.
3. Run the packet gates. Capture the actual native candidate against the frozen replay at 960×640, the 635px reflow breakpoint and 200% zoom; verify keyboard, contrast, all affected palette pairs, reduced motion, forced colors and native window controls. Keep applicable packaged browser gates. For contract-only changes, capture synthetic fixture checks; do not depict an unimplemented native feature.
4. Record base, candidate commit/tree, changed paths, command output, screenshot/GIF and SHA, platform and blockers. Commit locally, return to shell, and hand off to Codex for independent clean-export replay and review. Do not touch hosted refs during implementation.
5. November 28 approval covers the design and capture-first fresh PR path. Obtain explicit publication approval for the verified candidate before publishing each PR. For packet 00, publish a fresh PR only after that approval, then close rejected PR #2 as superseded after approved publication. Do not reuse or close #2 first.

## Review focus

- Independent preference slots and keyboard dismissal: 01.
- Solid reflow, focus/hit boundaries and static fallbacks: 02–04, 07–08.
- Wrong identity, unknown rights and rule semantics: 05–06, 10–11.
- Sample data leaking into production stats or history: 09, 11, D1–D2.
- Canceled drafts, all-hidden recovery and service independence: 12.

## Historical cross-reference

The old parent and packets in `/private/tmp/focus-desktop-redesign-plan` are history only. Map references, not requirements: old 01 → 01; 02 → 02; 03 → 03; 04 → 05/06; 05 → 07; 06 → 04; 07 → 08; 08 → 09; 09 → 12; 10 → D1; 11 → D2. New 10 and 11 have no old standalone owner.
