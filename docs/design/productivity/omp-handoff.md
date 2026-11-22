![Approved Light Cobalt dashboard with Start in Grace and a typewriter hero](references/approved-cobalt-grace-launch.png)

# Productivity desktop implementation plan and OMP handoff

The original 3D Grace-launch reference above remains the source for the approved **Start in Grace** action, canonical mark and shell controls. The [earlier timer comp](references/approved-cobalt-dashboard.png) is historical. Grace owns the session and may show the approved standard native first-use confirmation. The pictured Schedules section belongs to 3E. The [3D launch plan](3d-grace-launch-plan.md) records the completed launch path. The [3D.1–3D.3 typewriter plan](3d-typewriter-plan.md) defines the new art target and standalone approval gate; it does not revise the launch controls. Read the [design contract](../../../DESIGN.md), [roadmap](../../roadmap.md) and [reference index](references/README.md) for cross-slice requirements and provenance.

For 3E, use the [approved scheduling plan and calendar references](3e-scheduling-plan.md).

## Slice 3A candidate

Branch `feature/productivity-3a-design-contract` starts at `3b047d1e08c67006db5563297429bdf0ce02dd6f`, the initial `integration/productivity-desktop` head from `dev`. This slice records decisions and preserves the eight supplied PNGs byte for byte. Runtime code, tokens, historical captures and browser policy stay unchanged.

1. Confirm the isolated worktree, feature branch, clean status, tracking branch if configured, and exact integration base against upstream. In read-only prewalk, inspect [project rules](../../../AGENTS.md), the [Dither UI review](../dither-ui/README.md), [tokens](../../../packages/ui/src/tokens.css), [paper stock](../../../apps/desktop/src/PaperStock.svelte), [motion check](../../../apps/desktop/tools/check-motion.mjs) and [desktop app](../../../apps/desktop/src/App.svelte). Enter the ordered tasks in OMP todo before the first edit.
2. Embed the approved dashboard at the top of this plan. Write the design contract and roadmap. Reconcile current and future guidance in `AGENTS.md` without renumbering the original slices.
3. Copy the eight source PNGs under descriptive names. Embed each in the reference index with its provenance and SHA-256. Keep the originals unresized and out of runtime assets.
4. Commit locally on the slice branch. In a fresh local clone of the exact candidate, resolve relative doc links and embeds, decode all eight PNGs, and compare their SHA-256 values with the index and the supplied originals. Report the candidate SHA, checks and blockers. Stop at review.

## Typewriter handoff (3D.1–3D.3)

Use the [illustrated plan](3d-typewriter-plan.md) for branch names, work order, acceptance and evidence. 3D.1 starts at `f9c42403f8ff85ebc7cacdb39f9c5e8a989f8993` on `feature/productivity-3d1-typewriter-contract`, with 3B static art and 3D Grace launch present. It commits docs and the four references only. 3D.2 starts from reviewed 3D.1 and stays standalone; show the live offline viewer to the user. Start 3D.3 from reviewed 3D.2 only after the user explicitly approves Home integration. Stop at each candidate and never treat local integration as product approval.

## Operating loop for 3A–3F

1. Work on one isolated slice branch at a time. Inspect staged, unstaged and untracked changes before fetching or integrating. Keep unrelated edits in place. Fetch upstream, fast-forward local tracking where applicable, and reconcile upstream through the reviewed integration process. Verify and record the actual checkout, branch, tracking, clean status and base SHA. Cut the slice from the newest reviewed `integration/productivity-desktop` head and confirm required earlier work is present.
2. Run one OMP session per slice in Ghostty through tmux. Confirm pane, directory, branch and starting commit. Launch with `--prewalk --model openai-codex/gpt-6.2-sol --prewalk-into openai-codex/gpt-6.2-sol`. Inspect and create ordered OMP todos before mutating files. Use a real OMP edit or write to exit prewalk before any shell copy. Verify the starting model and the model in use at the first edit in the OMP session log; retain the evidence with the candidate report. Both phases use GPT-6.2 Sol.
3. Invoke `using-superpowers`, `ask-matt` and `using-agent-skills` at kickoff. Use `writing-plans` for tracked steps and gates. Use `brainstorming`, `impeccable` and `design` for visual evaluation against approved art, including 3D.1–3D.3; ask before any new accent, mark or treatment. Use `algorithmic-art` for reproducible print, dither and grain effects, `test-driven-development` for runtime changes and `verification-before-completion` at each gate. Run the [affected-code gates](../../roadmap.md#verification) and record the exact results.
4. OMP commits the slice candidate, preserves check output and evidence, reports blockers and exits to the tmux shell. Codex confirms the shell returned and independently reviews the diff, worktree, test output, screenshots, artifact hashes and outstanding decisions. Once approved, the reviewer fast-forwards the local integration branch, verifies tree identity against the candidate and cuts the next slice from that head. Repeat affected checks after any base movement.
5. After 3F, run the [cumulative workflow gate](../../roadmap.md#cumulative-review). Integration into `dev` is a separate decision. No slice author pushes, merges, promotes, deploys or starts the next slice. Keep the sibling Grace reference checkout read-only throughout.
