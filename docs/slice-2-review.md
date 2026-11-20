# Slice 2 verification

Tested on November 20, 2026. The combined candidate is `57071ab08bb4bfd4f470af53ff1ae19bc0cf8953` on `integration/slice-2-review`. It combines the browser feature at `918dc6c` and the independently reviewable CI changes at `dadb1f2`.

## Packaged browser results

All nine stages of `npm run test:browser -- --case shared-rule` passed in a disposable Ubuntu 24.04.5 LTS x86_64 container on Apple Silicon. The job used Node 24.22.3, Rust 1.96.0 and geckodriver 0.36.0. The packaged extensions ran in fresh profiles against local HTTPS YouTube fixtures. Both ZIPs passed integrity checks and retained the same hashes after the run.

| Package | Tested browser and loading method | SHA-256 |
| --- | --- | --- |
| `focus-chromium.zip` | Google Chrome for Testing 159.0.8154.6, unpacked from the ZIP | `e5fa9d5655046e4b6036645edb2da384b86be459fdb9bd0817d6a9acec10ef46` |
| `focus-firefox.zip` | Firefox 160.0.1, temporary add-on installed from the ZIP | `6053f3a304ab719cfb0116384e3880202aefe295b0f4c340fe7c390b911291c6` |

| Change | Observed outcome |
| --- | --- |
| Pair both profiles and enable Hide Shorts once | Both initially showed Shorts. Denying Chromium access left its page intact. Granting Chromium hid its Shorts while Firefox continued to show them. |
| Grant Firefox | Both browsers hid discovery on the three supported aliases. Search, adjacent videos and playlists stayed visible. Ordinary and directly opened Shorts fixture videos played to completion in both engines. |
| Revoke Chromium access to `https://www.youtube.com/*` | The open tab restored Shorts. Chromium still filtered `m.youtube.com`, and Firefox still filtered `www.youtube.com`. |
| Regrant and restart Chromium | The same profile resumed filtering with its saved grant and policy. |
| Terminate both native hosts | Both leases expired. The browsers kept their last acknowledged policy and reconnected after the bridge became available. |
| Disable the shared rule | Both open browsers restored discovery. A subsequent desktop unpair cleared Firefox's cached policy. A fresh temporary Firefox installation paired with a new identity and zero origins. |

A separate run on these archives found nine unchecked site boxes. Selecting the eight sites other than YouTube produced one Chromium permission prompt and acknowledged exactly 36 HTTP(S) origins. Hide Shorts stayed off. On a YouTube tab without permission, the packaged popup offered Setup. After the grant, its desktop action delivered the `youtube` site ID to the native host.

The exact archives and machine-readable report are retained locally under `artifacts/extensions/` in the review worktree. Reproduction instructions are in [Browser setup](browser-setup.md).

## Desktop and database

The clean install, both Svelte checks, all 26 unit tests, the focused five-test YouTube suite, the desktop production build and the locked Rust workspace tests passed. Both Svelte projects reported zero warnings. The macOS Tauri dev app launched, the debug app bundled, and the toolbar, reduced-motion and forced-colors check passed. The Linux job also ran the locked Rust tests and built both native binaries.

On macOS 15.8.2 arm64, the desktop saved Hide Shorts before pairing. Two distinct native-host requests shared one profile label. Approving a renamed request and declining the other left one approved profile. Settings exposed all five browser guides. After terminating the desktop process, an already-connected host still served a snapshot and accepted an acknowledgment. Relaunching the final bundle against the same disposable database showed Hide Shorts enabled.

The native tests covered stale edits and acknowledgments, credential and protocol rejection, request expiry, concurrent database opens, and migration rollback with a recoverable backup. In an additional two-process check, killing the native host while its acknowledgment write was blocked left the previous database state intact. Killing it after the response preserved the committed revision and origins. SQLite's integrity check passed after both terminations.

## Review boundary

The combined job ran locally. Hosted Actions and enforcement of the `dev` → `stage` → `release` ruleset still need a configured remote and maintainer review. Firefox signed-install restart and native installer qualification remain scheduled for slice 6. Fork-specific setup guides are available for local use. The browser results above cover the two named reference engines.
