# focus. design contract

## Overview

The desktop is a quiet workspace on printed stock. Give the poster composition room on Home, and keep editing, settings and data easy to scan. The [approved floating typewriter composition](docs/design/productivity/references/approved-cobalt-floating-typewriter.png) governs the artwork in the [3D.1–3D.3 plan](docs/design/productivity/3d-typewriter-plan.md). Keep the [original Grace-launch dashboard](docs/design/productivity/references/approved-cobalt-grace-launch.png) for the launch action and controls; the [earlier timer comp](docs/design/productivity/references/approved-cobalt-dashboard.png) is historical. The [Dither UI native captures](docs/design/dither-ui/README.md#native-review) record the earlier shell. The [roadmap](docs/roadmap.md) owns slice boundaries.

The [November 28 approved desktop redesign](docs/design/desktop-redesign/README.md) supersedes conflicting baseline treatments only as each owning packet lands. The frozen HTML is the replay target; named captures prove only their indexed states. The read-only browser popup is outside this redesign.

## Colors

[Shared CSS tokens](packages/ui/src/tokens.css) remain the executable source of truth. Packet 01 implements the [resolved approved palettes](docs/design/desktop-redesign/palette.json): Sage, Cobalt, Plum, Olive & Khaki, Oat & Espresso, Cocoa & Blush, and Graphite & Clay in both modes. Keep System appearance and independent saved Light/Dark choices. Use Sage for new profiles and missing or invalid saved palette IDs in the affected slot; Cobalt is the fixture review state. Show canvas, rail, ink, accent and secondary in that order in each option and show the selected palette's swatches in the closed trigger. Hover and keyboard focus preview only through swatches; explicit selection applies and saves the choice in that mode's slot. Confine vivid art colors to the foreground.

## Typography

Use the licensed Focus Bitmap family and local fallback for app-owned text, including the literal `focus.` wordmark, hostnames and timer numerals. Preserve regular and bold faces, stronger display lettering and the [license notices](THIRD_PARTY_NOTICES.md). Keep labels and values semantic and selectable. Check small glyphs in Browser access, No browsers connected and Browser settings.

## Layout

- Use one canvas, flat sections, thin rules and compact headings. On Home, keep the Grace launch action on open paper and the typewriter in a bounded art field, clear of text, controls and feed rows. Grace provides the session timer, start and end controls; focus. does not duplicate them. Keep Reading collapsed during work when configured. Surface a problem only when the user needs to act. Never depict unavailable controls or fake session data in the app.
- Keep the Sites library flat at 196px with a bold heading, 15px labels and rows at least 42px high. Starting in 4A, use a solid fill and bold text for the selected row at rest, hover and press, including forced colors. No side edge or inset shadow; keep keyboard focus distinct. Align marks with site names and put hostnames below them. Anchor **+ Add site** in the library using the existing designation flow. On wide Sites, Add site and a valid extension open request scroll only the rail, just enough to reveal the selected row, and focus the detail heading. Use smaller art in the wide Sites heading margin. Keep Browser access, Site entry and Content rules in flat rows with Pause options only for Pause where qualified. See the [4A preview contract](docs/design/content/4a-selective-feeds-plan.md). Track time belongs to Slice 5.
- Keep actions visible and reachable at 960×640. At 635px and below, stack the library above the detail and reflow without horizontal scrolling. Verify the toolbar and actions at 200% zoom. Keep the popup a read-only one-column summary at 360px with a link to the desktop.

## Elevation & Depth

Use separation by paper, ink and thin rules. Keep UI surfaces flat, without gradients, glow or decorative cards. Allow stronger texture inside original decorative art and keep it off labels, data and controls. Keep the Statistics empty-state illustration and the ability to turn print illustrations off.

Three distinct effects guide the art and stock.

- **PS2-inspired rendering** uses hard geometric facets and ordered screen-space dithering where useful for tonal quantization. See the [PS2SDK GS reference](https://ps2dev.github.io/ps2sdk/gs__gp_8h.html).
- **Printed halftone** uses screened dots to suggest ink tone and shadow on the art. Keep open paper, a clean silhouette and bounded ink layers. See the [V&A print primer](https://www.vam.ac.uk/articles/what-is-print) and [University of Utah Risograph reference](https://lib.utah.edu/collections/book-arts/risograph.php).
- **Toner wear** uses irregular dry skips on decorative rules and subtle fixed-position changes in paper grain and ink wear. Interactive frames retain continuously contrasting boundaries; wear stays on the perimeter.

The redesign desktop uses a solid toolbar, canvas and rail, including Sites and Statistics; stock grain and drifting flakes are legacy desktop treatments. Keep foreground art bounded, with its own ink texture and still fallback. Respect illustrations-off, paused and hidden states, reduced motion and forced colors. Forced colors must preserve readable labels, controls and identities without relying on decorative art.

Approved title models have a 3.5s bob and 22s turn, pointer drag, arrow rotation and Escape reset. Use distinct Settings category models and the Screen Time hourglass with flowing sand. Preserve the original Home typewriter as separate art.

The historical [light-wear comparison](docs/design/dither-ui/printed-ink-light-wear-comparison.png) and [printed-ink Light Cobalt target](docs/design/dither-ui/printed-ink-light-cobalt-target.png) document the baseline treatment.

For 3C, compare the shipped and trial paper-grain opacities for canvas and rail. These trial values leave shipped settings unchanged in 3A.

| Appearance | Baseline canvas / rail | Trial canvas / rail |
| --- | --- | --- |
| Light | `.15` / `.094` | `.113` / `.071` |
| Dark | `.075` / `.055` | `.056` / `.041` |

Capture matched stills and at least 7.2s of video per comparison at 100%. Inspect at 960×640. Keep the stock quiet behind the task and retain stronger halftone in the art. Run the [Dither UI motion check](docs/design/dither-ui/README.md#native-review).

## Shapes

Keep the established 3px controls, 4px notices and 6px dialogs. Reserve the ring motif for Site entry. The offset-carriage toolbar mark is a separate brand symbol; leave it unchanged.

Frame the whole small Cobalt typewriter from a low front-right angle, with a visible right sidewall, paper entering the roller and a separate spacebar. Its front slightly overlaps a stationary, near-circular, slightly flattened polygonal hot pink plate. The machine floats ±6 CSS px over 6 s. Use stepped raster edges, hard cobalt facets and a flat pink plate without a shadow. Keep ink vivid and bounded. Use the four-row US QWERTY layout and attached bitmap legends defined in the plan.

## Components

- **Navigation baseline before packet 08.** Center the typewriter mark and wordmark as one Home button. Label Sites visibly; use SVG buttons for Statistics and Settings with tooltips, accessible names and keyboard focus. Keep the thin active underline. On macOS, overlay the toolbar behind the native traffic lights; exclude both the centered brand and right navigation hit regions from AppKit dragging at the current WebKit page zoom. Drag with the original mouse-down event. Windows and Linux retain system title bars.
- **Redesign navigation.** Use the approved current-color pixel SVGs for Sites, Statistics and Settings and the five Settings rail categories. The centered mark opens Quick switch on click or keyboard activation; preserve native traffic lights and AppKit exclusions.
- **Controls.** Use opaque ink reversal on hover and press, including selected controls, except selected Sites library rows in Slice 4A. Those rows retain their solid fill and bold text on hover and press, without a side edge or inset shadow; keyboard focus stays distinct. Ease hover colors over 280ms independently of the one-pixel press. Use the shared Grace ease-out curve, sliding view marker and brief scale-and-fade for pointer-driven changes. Keyboard navigation and reduced motion skip view animations. Use a single toner sweep per pointer hover on `focus.` or the large site title, clear of the lettering.
- **Grace start.** Put the canonical Grace mark once inside **Start in Grace**, next to the label. Keep it decorative and unmodified. The mockup's Schedules section belongs to 3E; 3D has no scheduling controls. Grace may use one standard native confirmation on first use; no added custom settings or other visual treatment.
- **Browser access and marks.** Keep browser setup in Settings. Use approved official or pinned licensed marks with attribution and theme foreground colors. Marks identify sites and imply no affiliation. Static SVG halftoning is optional only where terms allow and the mark stays recognizable. Before packet 05, retain the original neutral `LI` for LinkedIn. Packet 05 may replace it only with a reviewed mark with documented redistribution rights; otherwise retain a labeled neutral fallback, as for other marks without verified rights.
- **Site, publisher and app identities.** Use only truthful, reviewed identities with documented redistribution rights; otherwise use a readable neutral fallback. Sites uses the approved site marks or original custom wire globe. Match the compact name/hostname alignment and use fixture posts only for preview comparisons. Align radios and checks with labels and make rule help keyboard reachable without changing rule semantics.
- **Statistics.** Use the approved bounded decoration and reviewed identity layout. Display actual opt-in local data only when supported; otherwise preserve the honest empty or unavailable state. Fixture app/site totals never become production statistics.

The [approved 3F plan and visual references](docs/design/productivity/3f-glance-reading-plan.md) govern the dashboard, Settings and Glance Reading. Follow-on planner and hourglass references do not authorize implementation in 3F.

## Do's and Don'ts

- Show a visible 2px focus ring immediately on keyboard-visible focus (`:focus-visible`), independent of hover, press or selection, with a 3px offset where geometry permits. Protect the full ring and target from clipping. Require 4.5:1 normal text contrast and 3:1 interactive boundary contrast, including the rendered unchecked native radios.
- Use the supplied studies for art direction only. Keep their characters, watermarks and lettering out of the app. In 3F, use the reviewed interactive viewer in Sessions and its compact still on Home; retain illustrations-off and motion settings. Ask the user before adding a new accent, mark or visual treatment.
- Preserve the desktop as the rule editor and apply changes only in browser profiles with the required access. Pause and Block remain guarded in normal builds pending qualification.
