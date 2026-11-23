# focus. design contract

## Overview

The desktop is a quiet workspace on printed stock. Give the poster composition room on Home, and keep editing, settings and data easy to scan. The [approved floating typewriter composition](docs/design/productivity/references/approved-cobalt-floating-typewriter.png) governs the artwork in the [3D.1–3D.3 plan](docs/design/productivity/3d-typewriter-plan.md). Keep the [original Grace-launch dashboard](docs/design/productivity/references/approved-cobalt-grace-launch.png) for the launch action and controls; the [earlier timer comp](docs/design/productivity/references/approved-cobalt-dashboard.png) is historical. The [Dither UI native captures](docs/design/dither-ui/README.md#native-review) record the earlier shell. The [roadmap](docs/roadmap.md) owns slice boundaries.

## Colors

[Shared CSS tokens](packages/ui/src/tokens.css) are the executable source of truth. Keep System as the default appearance and keep the saved Light and Dark choices independent. Preserve all six combinations of Sage, Cobalt and Plum, with Sage as the default palette in each mode.

Use cool neutral stock, legible foreground ink and a vivid secondary ink confined to intentional accents and artwork. In Light Cobalt, use blue facets, navy text and bounded hot pink against open paper. Avoid the rejected all-over yellow cast. The [poster and palette studies](docs/design/productivity/references/README.md) illustrate color placement; their swatches are reference material and do not define theme values.

## Typography

Use the licensed Focus Bitmap family and local fallback for app-owned text, including the literal `focus.` wordmark, hostnames and timer numerals. Preserve regular and bold faces, stronger display lettering and the [license notices](THIRD_PARTY_NOTICES.md). Keep labels and values semantic and selectable. Check small glyphs in Browser access, No browsers connected and Browser settings.

## Layout

- Use one canvas, flat sections, thin rules and compact headings. On Home, keep the Grace launch action on open paper and the typewriter in a bounded art field, clear of text, controls and feed rows. Grace provides the session timer, start and end controls; focus. does not duplicate them. Keep Reading collapsed during work when configured. Surface a problem only when the user needs to act. Never depict unavailable controls or fake session data in the app.
- Keep the Sites library flat at 196px with a bold heading, 15px labels, rows at least 42px high, a 2px selection edge and neutral selected fill. Align marks with site names and put hostnames below them. Anchor **+ Add site** in the library using the existing designation flow. On wide Sites, Add site and a valid extension open request scroll only the rail, just enough to reveal the selected row, and focus the detail heading. Use smaller art in the wide Sites heading margin. Keep Browser access, Site entry and Content rules in flat rows with Pause options only for Pause where qualified. Track time belongs to Slice 5.
- Keep actions visible and reachable at 960×640. At 635px and below, stack the library above the detail and reflow without horizontal scrolling. Verify the toolbar and actions at 200% zoom. Keep the popup a read-only one-column summary at 360px with a link to the desktop.

## Elevation & Depth

Use separation by paper, ink and thin rules. Keep UI surfaces flat, without gradients, glow or decorative cards. Allow stronger texture inside original decorative art and keep it off labels, data and controls. Keep the Statistics empty-state illustration and the ability to turn print illustrations off.

Three distinct effects guide the art and stock.

- **PS2-inspired rendering** uses hard geometric facets and ordered screen-space dithering where useful for tonal quantization. See the [PS2SDK GS reference](https://ps2dev.github.io/ps2sdk/gs__gp_8h.html).
- **Printed halftone** uses screened dots to suggest ink tone and shadow on the art. Keep open paper, a clean silhouette and bounded ink layers. See the [V&A print primer](https://www.vam.ac.uk/articles/what-is-print) and [University of Utah Risograph reference](https://lib.utah.edu/collections/book-arts/risograph.php).
- **Toner wear** uses irregular dry skips on decorative rules and subtle fixed-position changes in paper grain and ink wear. Interactive frames retain continuously contrasting boundaries; wear stays on the perimeter.

Keep the 3.6s paper-grain hiss changing in place. Flake drift is separate, with poses held at 12 fps without slowing travel or stepping the density fade. Persist toner pause across launches, and pause grain, ink static and flakes when paused or hidden. Reduced motion stops the animated stock and sweeps. Forced colors, where supported, suppress decorative art, grain, flakes, wear, sweeps and SVG halftoning while retaining legible text, controls and marks.

**3F solid-paper exception.** Home (including Calendar and Reading), Sessions, and every Settings page use solid paper, including the shared toolbar when present. Preserve the Settings title's 3.6s toner steps and held solid hover. Sites and Statistics retain their existing stock. The [PS1-inspired refinement](docs/design/productivity/ps1-visual-direction.md) applies four held ink frames to straight 2px Home section rules and stepped corners to Home outline actions.

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

- **Navigation.** Center the typewriter mark and wordmark as one Home button. Label Sites visibly; use SVG buttons for Statistics and Settings with tooltips, accessible names and keyboard focus. Keep the thin active underline. On macOS, overlay the toolbar behind the native traffic lights; exclude both the Home and right navigation hit regions from AppKit dragging at the current WebKit page zoom. Drag with the original mouse-down event. Windows and Linux retain system title bars.
- **Controls.** Use opaque ink reversal on hover and press, including selected controls. Ease hover colors over 280ms independently of the one-pixel press. Use the shared Grace ease-out curve, sliding view marker and brief scale-and-fade for pointer-driven changes. Keyboard navigation and reduced motion skip view animations. Use a single toner sweep per pointer hover on `focus.` or the large site title, clear of the lettering.
- **Grace start.** Put the canonical Grace mark once inside **Start in Grace**, next to the label. Keep it decorative and unmodified. The mockup's Schedules section belongs to 3E; 3D has no scheduling controls. Grace may use one standard native confirmation on first use; no added custom settings or other visual treatment.
- **Browser access and marks.** Keep browser setup in Settings. Use approved official or pinned licensed marks with attribution and theme foreground colors. Marks identify sites and imply no affiliation. Static SVG halftoning is optional only where terms allow and the mark stays recognizable. Keep the original neutral `LI` for LinkedIn and use labeled neutral monograms where other marks are unavailable under their terms.
- **Site marks.** Use a single monochrome SVG following the existing theme foreground states. Ask for approval before adding a decorative color, shape, or animation to any site mark.
- **Statistics.** The baseline shows an honest empty state. Slice 5 adds a date selector, large bitmap total, bars for actual opt-in local data and exact accessible site values. Leave out scores, streaks and coaching.

The [approved 3F plan and visual references](docs/design/productivity/3f-glance-reading-plan.md) govern the dashboard, Settings and Glance Reading. Follow-on planner and hourglass references do not authorize implementation in 3F.

## Do's and Don'ts

- Keep visible 2px focus rings with a 3px offset where geometry permits and protect the full target from clipping. Require 4.5:1 normal text contrast and 3:1 interactive boundary contrast, including the rendered unchecked native radios.
- Use the supplied studies for art direction only. Keep their characters, watermarks and lettering out of the app. In 3F, use the reviewed interactive viewer in Sessions and its compact still on Home; retain illustrations-off and motion settings. Ask the user before adding a new accent, mark or visual treatment.
- Preserve the desktop as the rule editor and apply changes only in browser profiles with the required access. Pause and Block remain guarded in normal builds pending qualification.
