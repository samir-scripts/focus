# Desktop redesign — packet 00

**Status: proposal; visual approval pending.** Packet 00 is documentation and an offline review specimen only. Reviewed base: `12bac2c35ad85a7b6f6f38c0fffd67940b2876d4`. No runtime changes, PR, promotion, or feature 01 work in this packet.

## Priority and dependencies

| Lane | Order (each arrow requires review and integration into `dev`) |
| --- | --- |
| UI | [01 Palettes](01.md) → [02 Solid canvas](02.md) → [03 Tactile controls](03.md) → [04 Sites alignment](04.md) → [05 Settings sidebar](05.md) → [06 SVG motion](06.md) → [07 Quick switch](07.md) → [08 Inline Sessions](08.md) → [09 Dashboard editor](09.md) |
| Data documentation | [10 Grace history](10.md) → [11 Screen Time](11.md); may overlap one UI branch only, with disjoint ownership. Neither is a runtime dependency of 09. |

00 must be reviewed first. Establish palette semantics and solid paper before restyling interaction; stabilize the shell and destinations before moving Sessions or introducing configurable modules. Data contracts must not imply that a collector or completed-history feed exists. The [roadmap](../../roadmap.md) retains product release sequencing; this proposal does not override prior gates.

## Requirements and guardrails

- Scan-first printed layout, local bitmap faces, flat solid surfaces, recognizable monochrome site marks. Separate canvas, surface, rail, selected, text, action/focus and bounded art accents. Preserve native titlebar and keyboard affordances; prove at 960×640, ≤635px and 200% zoom. Require 4.5:1 text and 3:1 functional boundaries; dividers are decorative, not control boundaries.
- Keep Focus the local rule editor. Existing site policy and exact browser grants still govern enforcement; Pause/Block stay guarded, popup stays read-only, opt-ins stay off. No remote telemetry, fabricated sessions or fabricated usage. Grace owns work, timing and completion; Reading stays isolated from trusted commands.
- Preserve the approved [design contract](../../../DESIGN.md) except for exact changes separately approved in their owning packet. Keep artwork bounded, illustrations preference intact, keyboard focus immediate, reduced motion and forced colors meaningful. No incidental styling changes.

## Source audit

- [App.svelte](../../../apps/desktop/src/App.svelte) derives `showStock` for Sites and Statistics and mounts `PaperStock` in the shell including toolbar/canvas; Sites has a further particle mount. Settings opens an index with individual pages. The centered mark's hidden hold uses 500ms; the ordinary click is Home.
- App's `.swatch` draws only paper and accent, while [tokens.css](../../../packages/ui/src/tokens.css) defines eleven palette roles. Appearance slots are already independent in [appearance.ts](../../../apps/desktop/src/appearance.ts). The [extension popup](../../../apps/extension/popup.html) must not inherit an accidental desktop restyle.
- [`open_sessions`](../../../apps/desktop/src-tauri/src/main.rs) creates or focuses a separate Sessions webview. Do not conflate removing that window with redesigning the scheduler or granting commands to Reading.

## Review proof and references

Open [proof.html](proof.html) directly from the checkout. Settings/Sites/Home are offline specimens; selections are local to this page, and all example data is explicitly fixture data. [Resolved palette manifest](palette.json) lists eleven exact roles per mode; [palette source](palette.js) records the seven input roles and byte-mixing rules. The incumbent toggle uses the six actual token sets, not recolored approximations. The bounded original SVG is a compatibility study, not replacement product artwork. [Proof and font hashes](proof-sha256.txt) can be checked from the checkout root with `shasum -a 256 -c docs/design/desktop-redesign/proof-sha256.txt`. [Verification script](verify.cjs): `PLAYWRIGHT_PATH=/private/tmp/focus-short-video-navigation/node_modules/playwright node docs/design/desktop-redesign/verify.cjs /private/tmp/focus-redesign-00-evidence`. Override `CHROME` if Chrome isn't installed in the default macOS location.

| Tracked reference | Authority | SHA-256 |
| --- | --- | --- |
| [3F dashboard](../productivity/references/3f-dashboard.png) | Composition only; historical glyphs are not font references | `bbab1ad024204acd63be7f5fd5d74c6286b7d0b979fe98005b4c515e4a98fe64` |
| [3F quick switch](../productivity/references/3f-quick-switch.png) | Anchor and composition only; historical glyphs are not font references | `a785af70a0e53434e1d47704807436b115d2c56907072e6f58f05e1a57f26d51` |
| [3F Settings routes](../productivity/references/3f-settings-pages.html) | Incumbent index, categories and Back; composition only where glyphs differ | `10fc76bf2f256bb1691d883009dceb406d485dda7aa17b90ad64442a45b353a8` |
| [3F printed Settings](../productivity/references/3f-settings-print.html) | Production bitmap/gear/print reference; see [3F contract](../productivity/3f-glance-reading-plan.md) for motion corrections | `c5e514b87359b3f02ba68f21aa87c22ad298fd50cdc1ba951594a45ed0b56435` |
| [Hourglass study](../productivity/references/3f-hourglass.gif) | Follow-on placement and stepped sand only | `17633f9c054cb0ba1de9aafe39c0f6a4aa5bf90dc523056ef790ef6268cd485f` |
| [PS1 direction](../productivity/ps1-visual-direction.md) | Visual direction and review gate, not implementation approval | `cfc98e27f275ce19c0b6192cb9f1bc748704cc26f7ecb4458fcf9b5671d8522e` |

External inspiration, not packaged or loaded by the proof: [Pinimg motion study](https://i.pinimg.com/originals/9a/2f/1c/9a2f1c6f026149450365f8a8d06ab9b8.gif), [Carbon color usage](https://carbondesignsystem.com/elements/color/usage/), WCAG [text](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). User-supplied local provenance (not dependencies): `codex-clipboard-b906e359-1e17-48be-ae05-ff5add763144.png` Olive; `codex-clipboard-831cb395-b1ae-43f5-9c82-ba7faa8e8eda.png` Oat; `codex-clipboard-b013e46c-56f8-4475-95d3-4a3515b66131.png` Cocoa; `codex-clipboard-c00d1ff4-3648-4300-b352-65b78ef97dd4.png` Graphite (printed stone hex). Attachment IDs: `505c2f2b` Sites, `8f34288b` Settings, `dc89e21b` mark hover, `efe29fcb` Sites label, `3b18aa5a` Sessions, `90b96310` dashboard; art `c347c3fd` olive gray, `bf5655e3` neutrals, `f8f28159` print alignment, `ae435c3f` pink/navy, `19962874` grid. Attribution is provenance, not license; do not upload these images, private screenshots or credentials.

## OMP and review gates

1. Fetch `origin dev`; start the assigned clean isolated branch from the latest reviewed `origin/dev` including dependencies. Record base, tracking ref and status (`git status --short --branch`, `git rev-parse HEAD origin/dev`, `git worktree list`); stop on an unclear or moved base. No stale stacked feature branches. Repeat qualification after base movement.
2. Use a fresh proof OMP session in a dedicated Ghostty tmux pane: `omp --prewalk --model openai-codex/gpt-6.2-sol --prewalk-into openai-codex/gpt-6.2-sol`. Verify pane/cwd, base and actual model; read-only prewalk with ordered todo, then real Write/Edit, then record transition from session log. Use Using Superpowers, Ask Matt and Using Agent Skills at entry; Writing Plans for packet execution, Impeccable/craft floor for visual proof, TDD for feature behavior, Verification Before Completion at handoff.
3. Present exact runnable proof and SHA-256 (`shasum -a 256` on entry point and all dependencies, including tracked font assets used); get explicit recorded approval against those hashes. No implementation until approved. Start a **fresh** implementation OMP with the same launch, packet, approved proof and hashes; no design drift.
4. Use each packet's red/green contract. For desktop runtime changes also run `npm ci`, `npm run check`, `npm run test:unit`, `npm run build --workspace @focus/desktop`, `(cd apps/desktop/src-tauri && cargo test --locked --workspace)`, then `npm run tauri -- dev` and native inspection. If policy changes, stop for scope review and apply the packaged browser gates in project rules. Capture commands/results and actual surface, not mock screenshot substitutions. Sanitize evidence; keep local if private.
5. OMP commits only packet-owned changes via selective commit, records base and `git show -s --format='%H %T' HEAD`, evidence paths/hashes and blockers, then exits. Codex independently confirms shell return, exact candidate/tree, source diff, gates and evidence before opening a reviewed PR into `dev`. No `stage`/`release` promotion. Begin the next UI branch only after predecessor review and integration.
