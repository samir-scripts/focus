# Browser onboarding review

## Decision

Hold production installation sign-off. The focus. Chrome Web Store draft has item ID `gjopbhkkemlhggdbpfhmmmlmamdigehg`. The publisher dashboard saved the English listing under Productivity → Tools. The public listing and a focus-owned AMO-signed `focus@focus-local` XPI with provenance remain outstanding. [Store draft and uploaded hash](chrome-store-draft.md)

## Candidate and verification

Implementation revision `cb5c64be8132f75f22e14900bd29faab691daf79` on `feature/browser-install-onboarding`, based on `1d31e11`.

- The macOS locked Rust workspace passed 15 consecutive runs of 22 tests after a regression test reproduced an installation lock remaining busy when a child inherited its descriptor.
- The macOS debug app bundle includes both `focus-desktop` and `focus-native-host`. The Linux amd64 debug DEB contains both executables in `/usr/bin` and the protected installation helper at `/usr/libexec/focus-browser-policy`, all owned by root with mode 0755. The inspected DEB has SHA-256 `2a7f3d039bd29b1938245a906121e9d86337388112ee404ba33bb617c3e28204`.
- The live motion check passed the pinned toolbar, workspace scroll, reduced-motion and forced-colors assertions. The native screenshot shows closed-browser discovery in the macOS guest. The layout and zoom matrix uses the rendered desktop frontend with test data.

The final Ubuntu run passed a clean npm install, Svelte checks with zero errors or warnings, 29 unit tests, five focused YouTube cases, the production frontend build and 21 locked Rust tests. Both ZIPs passed archive integrity checks. The packaged shared-rule scenario passed all nine steps in Chrome for Testing 159.0.8154.6 and Firefox 160.0.1 with disposable profiles and local fixtures. This included explicit pairing with zero initial grants, host loss, partial revocation, Chromium restart and Firefox temporary reinstallation. An earlier run at `9cdfe38` timed out during the Firefox UI step while the Debian build was running. [Final scenario report](design/browser-onboarding/shared-rule-report.json)

| Tested artifact | SHA-256 |
| --- | --- |
| Chromium fixture ZIP | `cc2f2a211b1266a1282d2af3ab4c37feac39d777b60e9323bafcc2593b4eb29e` |
| Firefox temporary ZIP | `a4b3aee3eeda1df346bb8462721838ac805dd8e1bfc895128cc192a547324874` |
| Chrome Web Store draft ZIP | `992cebfbb54fcdf7d3f3e6db7e00528f79ba6f5a995ca26a6197629a2ef01d72` |

## Discovery in disposable environments

Scans ran with the browsers closed. The macOS desktop showed the five browser names, distinct marks, bundle locations, and an unavailable-release message. Linux probes called the application's Rust discovery module against real packages. Neither scan needed elevation.

| Installation | OS, distribution and browser version | Observed result |
| --- | --- | --- |
| Chrome | macOS 15.7.7 arm64, vendor app via Homebrew, 158.0.8127.37 | Found the bundle. |
| Chromium | Same guest, upstream arm64 snapshot, 160.0.8175.0 | Found the bundle. The Chromium cask was disabled for Gatekeeper. Snapshot launch and store eligibility remain open. |
| Brave | Same guest, vendor app via Homebrew, CFBundleShortVersionString 154.1.96.61 | Found the bundle. |
| Firefox | Same guest, vendor app via Homebrew, 157.0 | Found the bundle. |
| Zen | Same guest, vendor app via Homebrew, 1.22.3b | Found the bundle. |
| Chrome, Brave, Firefox native | Ubuntu 24.04.5 x86_64 container, vendor DEBs 158.0.8127.36-1, 1.100.58, 160.0.1~build1 respectively | Found all three installed applications. |
| Chromium native | Clean Debian 13 x86_64 container, Debian's `chromium` package 156.0.8078.79-1~deb13u1 | Found the installed browser as an unprivileged user with Chromium closed. |
| Chromium, Brave, Firefox, Zen Flatpak | Ubuntu 24.04.5 x86_64 container, user-scoped Flathub stable, versions 158.0.8127.36, 1.100.58, 160.0.1 and 1.24.3b respectively | Found four distinct refs. The same scan returned separate native and Flatpak copies of Brave and Firefox. |
| Chrome Flatpak | Ubuntu 24.04.5 x86_64 container, community Flathub extra-data package | Sandbox creation failed during package deployment. Discovery and installation for this package remain open. |
| Chromium, Brave, Firefox Snap | Clean Ubuntu 24.04.5 arm64 VM, stable Snaps 158.0.8127.36, 1.100.58 and 160.0.1-1 respectively | The original scan found zero. After resolving both links to Snap’s dispatcher, the same scan returned all three with distinct IDs. |
| Zen tarball and AppImage | Ubuntu 24.04.5 x86_64, upstream Zen 1.24.3b assets | The downloaded files matched both upstream SHA-256 digests. With local desktop entries installed, the detector returned three distinct Zen rows for tarball, AppImage and Flatpak. Standalone managed installation remains unqualified. |

The x86_64 Ubuntu session exposed the WebExtensions portal over D-Bus. The container could not create a bubblewrap user namespace to launch a sandboxed browser. The portal observation establishes its presence only. Each sandbox distribution still needs an actual supported policy and native-messaging route, browser prompt, authenticated handshake, restart and removal before enabling its Install action.

## Settings

The before capture shows the baseline setup guides. The after capture uses the production Svelte renderer with an injected inventory so the install, missing release, disconnected profile and duplicate Firefox rows can be reviewed together. The native capture shows the actual macOS inventory. [Before](design/browser-onboarding/before.png) · [After](design/browser-onboarding/after.png) · [Native macOS](design/browser-onboarding/macos-browsers.jpg)

The rendered matrix covered 960×640, a 635px-wide viewport, all six light/dark palettes, forced colors and a long Flatpak ref. All six installation rows in the fixture measured 24×24px for their decorative SVGs. The accessibility tree retained browser names, labeled actions and family groups. Tabbing from Rescan reached the first Install action with a 2px outline. An additional Chrome for Testing run set browser zoom to 200%, read it back, measured a 480px CSS viewport and checked horizontal overflow. Native WebKit zoom at this revision was not independently confirmed. [200% browser zoom](design/browser-onboarding/zoom-200.png)

## Production qualification still required

For each enabled native distribution, use the public Chrome item or signed Gecko artifact from a fresh profile. Record the exact desktop build, browser package, prompts and extension identity. Confirm the selected browser opens, installation alone grants zero sites, desktop approval pairs the intended profile, an explicit YouTube grant enables Hide Shorts, restart preserves the installation, and removal releases focus.-owned setup. For managed Gecko, capture the effective policy before and after, verify unrelated policy survives, and check the add-on’s actual post-restart state. The existing shared-rule scenario and unavailable-release UI do not exercise store or AMO installation.
