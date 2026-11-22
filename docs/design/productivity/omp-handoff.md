![Approved Light Cobalt dashboard with a typewriter seen from a low front-right angle](references/approved-cobalt-dashboard.png)

# Productivity desktop implementation plan and OMP handoff

The image is the approved visual target. It depicts a future work session. The [design contract](../../../DESIGN.md) defines the visual rules, the [roadmap](../../roadmap.md) owns slice scope and acceptance, and the [reference index](references/README.md) records source artwork and digests.

## Slice 3A candidate

Branch `feature/productivity-3a-design-contract` starts at `3b047d1e08c67006db5563297429bdf0ce02dd6f`, the initial `integration/productivity-desktop` head from `dev`. This slice records decisions and preserves the eight supplied PNGs byte for byte. Runtime code, tokens, historical captures and browser policy stay unchanged.

1. Confirm the isolated worktree, feature branch, clean status, tracking branch if configured, and exact integration base against upstream. In read-only prewalk, inspect [project rules](../../../AGENTS.md), the [Dither UI review](../dither-ui/README.md), [tokens](../../../packages/ui/src/tokens.css), [paper stock](../../../apps/desktop/src/PaperStock.svelte), [motion check](../../../apps/desktop/tools/check-motion.mjs) and [desktop app](../../../apps/desktop/src/App.svelte). Enter the ordered tasks in OMP todo before the first edit.
2. Embed the approved dashboard at the top of this plan. Write the design contract and roadmap. Reconcile current and future guidance in `AGENTS.md` without renumbering the original slices.
3. Copy the eight source PNGs under descriptive names. Embed each in the reference index with its provenance and SHA-256. Keep the originals unresized and out of runtime assets.
4. Commit locally on the slice branch. In a fresh local clone of the exact candidate, resolve relative doc links and embeds, decode all eight PNGs, and compare their SHA-256 values with the index and the supplied originals. Report the candidate SHA, checks and blockers. Stop at review.

## Operating loop for 3A–3F

1. Work on one isolated slice branch at a time. Inspect staged, unstaged and untracked changes before fetching or integrating. Keep unrelated edits in place. Fetch upstream, fast-forward local tracking where applicable, and reconcile upstream through the reviewed integration process. Verify and record the actual checkout, branch, tracking, clean status and base SHA. Cut the slice from the newest reviewed `integration/productivity-desktop` head and confirm required earlier work is present.
2. Run OMP in Ghostty through tmux. Confirm pane, directory, branch and starting commit. Launch with `--prewalk --model openai-codex/gpt-6.2-sol --prewalk-into openai-codex/gpt-6.2-sol`. Inspect and create ordered OMP todos before mutating files. Use a real OMP edit or write to exit prewalk before any shell copy. Verify the starting and first-edit model in the OMP session log and retain the evidence with the candidate report. Both phases use GPT-6.2 Sol.
3. Invoke `using-superpowers`, `ask-matt` and `using-agent-skills` at kickoff. Use `writing-plans` for tracked steps and gates. Use `brainstorming`, `impeccable` and `design` to carry the approved visual decisions into 3B–3D without reopening discovery. Use `algorithmic-art` for reproducible print and grain work in 3B–3C. Use `test-driven-development` for runtime changes and `verification-before-completion` at each gate. Run the [affected-code gates](../../roadmap.md#verification) and record the exact results.
4. OMP commits the slice candidate, preserves check output and evidence, reports blockers and exits to the tmux shell. Codex confirms the shell returned and independently reviews the diff, worktree, test output, screenshots, artifact hashes and outstanding decisions. Once approved, the reviewer fast-forwards the local integration branch, verifies tree identity against the candidate and cuts the next slice from that head. Repeat affected checks after any base movement.
5. After 3F, run the [cumulative workflow gate](../../roadmap.md#cumulative-review). Integration into `dev` is a separate decision. No slice author pushes, merges, promotes, deploys or starts the next slice. Keep the sibling Grace reference checkout read-only throughout.
