# Frozen evidence and fixture provenance

Approval: November 28, 2026. The [SHA-256 manifest](approved-sha256.txt) binds all frozen files; [sources.json](approved/sources.json) records preview URLs, sizes and hashes, not license grants. Keep the frozen bytes unchanged. Populated states are sample data.

| Type | Capture | Exact coverage and limit |
| --- | --- | --- |
| Still | [Light](approved/reference/focus-palette-menu-light.png), [Dark](approved/reference/focus-palette-menu-dark.png), [options](approved/reference/focus-palette-menu-options.png) | Settings Appearance open palette menus and option swatches; not every theme applied or keyboard behavior. |
| Still | [Settings models](approved/reference/focus-settings-category-models.png), [rail icons](approved/reference/focus-settings-tabs-icons.png) | Category silhouettes and rail SVGs; no motion or native layout evidence. |
| Partial GIF | [Heading models](approved/reference/focus-sites-and-headers-motion.gif), [hourglass](approved/reference/focus-hourglass-model-final.gif) | Bounded composition and motion excerpts; not a full 22s measurement, drag or reset proof. |
| Still | [Sites radio centers](approved/reference/focus-sites-radio-centers.png), [Instagram fixture](approved/reference/feed-preview-instagram-current.png) | Alignment close-up and older current-feed frame, respectively. Not interaction, reversal or both sides of a final comparison. |
| Still | [Sessions](approved/reference/focus-full-review-sessions.png) | Sample Sessions composition; no real scheduler, launch or history integration proof. |
| Still | [Reading](approved/reference/focus-reading-publisher-marks-review.png), [Statistics](approved/reference/focus-statistics-app-marks-review.png) | Publisher and app identity rows in populated fixtures; not authorization, license or collection proof. |
| Still | [RSS and Screen Time](approved/reference/focus-full-review-rss.png), [editor](approved/reference/focus-full-review-editor.png) | Alternate Home fixture and editor open state. Not Quick switch, persisted ordering or a collector. |

## Local replay

Run from the repository root in separate shells:

```sh
node docs/design/desktop-redesign/approved/replay.cjs desktop 14912
node docs/design/desktop-redesign/approved/replay.cjs sites 14900
```

Use fresh browser storage; appearance and category URL parameters seed preferences. Open [desktop Home](http://127.0.0.1:14912/#Home), [Settings](http://127.0.0.1:14912/#Settings), [Statistics](http://127.0.0.1:14912/#Statistics), [Sessions](http://127.0.0.1:14912/#Sessions), [Reading](http://127.0.0.1:14912/#Reading), [embedded Sites](http://127.0.0.1:14912/#Sites), or [Screen Time and RSS](http://127.0.0.1:14912/?layout=screen-rss#Home). Open [standalone Sites](http://127.0.0.1:14900/) on its separate origin.

On each origin `/` serves its frozen `index.html` and `/assets/...` resolves against that archive's asset root. Desktop `/site` serves `site.html` for the same-origin Sites iframe. Raw frozen HTML paths are provenance, not file-open instructions: [desktop index](approved/desktop/index.html), [embedded Sites](approved/desktop/site.html), [standalone Sites index](approved/sites/index.html).

Label new evidence with route, appearance, palette, state, viewport, candidate tree and SHA. Use a fresh trace where a still or partial GIF cannot establish equivalence.

The [earlier short-video Sites proof](approved/earlier-sites/short-video-navigation.html) preserves the approved control layout separately. Its [still](approved/earlier-sites/sites-960x640.png) and [recording](approved/earlier-sites/navigation-walkthrough.gif) accompany packet 06. The embedded 14812 replay supplies the current fixture posts and site art.

## Licensing report

- **Verified fixture origin and documented notices:** Focus Bitmap and Mona fonts, original Focus assets, typewriter GLB/rest image and shell build assets are local archive copies. See [notices](../../../THIRD_PARTY_NOTICES.md) for original Regular/Bold, Mona-derived faces, OFL terms and viewer licensing. Use canonical source assets with notices; archived bundles are not a runtime dependency.
- **Identified fixture origin; redistribution unverified:** NASA publisher SVG came from NASA's website. Confirm the precise mark and applicable NASA identity terms before bundling, transforming or exporting it publicly. Use a neutral fallback if rights are unconfirmed.
- **Identified fixture origin; redistribution unverified:** Chrome and VS Code icons came from installed app bundles. Installation and Chromium/Code source licenses do not establish rights to the branded artwork. Confirm product artwork terms or use truthful names and neutral fallbacks.
- **Mixed provenance:** Approved Sites marks are frozen in fixture logo maps. The [notices](../../../THIRD_PARTY_NOTICES.md) identify existing pinned marks and neutral monograms; visible resemblance is not proof of matching asset versions, redistribution or transformation rights. Record source/version, license, attribution and brand restrictions for each asset actually shipped. Use the original wire globe for custom sites and labeled neutral marks where identity or rights are unknown.

Archive fidelity is not redistribution authority. Escalate unresolved fixture rights before hosted publication without altering the local archive. No generic asset fetch. Browsing and activity remain device-local.
