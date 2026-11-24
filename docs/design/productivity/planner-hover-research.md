# Planner button hover research

Try a one-pixel lower edge on hover. Keep the stepped silhouette, face and bitmap label steady. Apply the Save changes press motion to Save changes, Cancel and Delete, then carry the same motion to the other enabled planner buttons. This is a proposal for prototype review. The current [PS1 visual direction](ps1-visual-direction.md) records opaque solid hover, and the [shared tokens](../../../packages/ui/src/tokens.css) specify 280 ms for it.

## Prototype

- Bring in a crisp one-pixel lower edge using a palette color from the button role. Try the on-accent ink as a tint for the filled Save changes button, a stronger neutral edge for Cancel and the existing destructive accent for Delete. Keep the cue visible for the full hover. Start with a 90 ms ease-out on entry and exit, with zero delay.
- Move the face and label down by one CSS pixel on press so the lower edge is covered. Copy the current proof's 55 ms downstroke, 135 ms release and `cubic-bezier(.16, 1, .3, 1)`. Keep the outline and click target stationary. Restore the lower edge on release while the pointer is still over the button.
- If the lower edge is hard to distinguish at normal size, compare a variation that tints the existing stepped perimeter for the duration of hover. Hold the face and label steady in that variation too.

## Alarm clock proof

The clock prototype tries the stepped-perimeter variation. The rim changes color over 110 ms with no hover movement. Delete picks up the theme's secondary ink. The key face lowers over 55 ms and returns over 180 ms. These are the timings in the clock proof that introduced the moving key face. The earlier one-pixel Solid ink study used the 135 ms release described above.

The reminder editor, AM and PM, dial numbers, and confirmation actions all provide press feedback. The framed controls move 2 CSS pixels and the clock numerals move 1. The Chromium proof checked press and release on 20 visible controls and verified that their hit areas stayed fixed. The hover treatment is ready for visual review.

## Evidence

- Classic Win32 push buttons use raised and sunken edges for the released and pressed states. Its edge-drawing API supports individual sides, which gives a precedent for expressing depth with a narrow, crisp edge. [Microsoft Button States](https://learn.microsoft.com/en-us/windows/win32/controls/button-states) · [Microsoft DrawEdge](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-drawedge)
- GOV.UK pairs a hard lower shadow with a downward displacement on press. Its button stylesheet explicitly preserves the click area when pressing at the upper edge. Focus can use the same physical relationship with the proof's one-pixel travel and a fixed hit target. [GOV.UK Frontend button source](https://raw.githubusercontent.com/alphagov/govuk-frontend/v5.13.0/packages/govuk-frontend/src/govuk/components/button/_index.scss)
- IBM Carbon uses 70 ms for button and toggle microinteractions and 110 ms for fades. The proposed 90 ms is a starting point between those design tokens. The 55 ms and 135 ms values come from the existing Save changes proof. [Carbon motion durations](https://www.carbondesignsystem.com/building-blocks/foundations/motion/overview#duration)
- In a desktop eye-tracking study of 71 participants, Nielsen Norman Group measured 22% longer search times on pages with weaker clues about where to click. The study measured target discovery. It supports keeping the planner's button shapes recognizable at rest. [Original eye-tracking study](https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/)
- W3C treats a pointer hover effect as supplemental and emphasizes keeping the control boundary and keyboard focus legible during hover. The CSS forced-colors rules remove box shadows, so preserve a system-color border and focus outline. Use a static edge in reduced motion and remove decorative travel. [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#hover-states) · [W3C focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) · [W3C forced colors](https://www.w3.org/TR/css-color-adjust-1/#forced-colors-properties) · [W3C reduced-motion technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)

## Review

Compare rest, entry, held hover, press and release at 100% in Light Cobalt and Dark Cobalt before checking Sage and Plum in both appearances. Sweep across adjacent actions and click the upper and lower edges. Check Tab focus, Enter and Space activation, reduced motion and forced colors. Measure the label at 4.5 to 1 and the continuous interactive boundary at 3 to 1 through the transition. Timing and edge color remain design choices for the prototype.
