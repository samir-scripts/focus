# Connect a browser to focus.

Open **Settings → Browsers**. focus. scans locally for supported browser installations, including closed browsers. Select **Rescan** after installing or removing a browser. The scan does not read history, profiles or site permissions.

- For Chrome, Chromium and Brave, **Install extension** opens the published Chrome Web Store listing in the selected browser. Accept the browser's prompt; focus. cannot approve or observe that prompt. If you cancel, use **Reopen store** to try again.
- For Firefox and Zen, focus. stages its signed extension and sets `ExtensionSettings` for that browser installation. On macOS this applies to all profiles on the current macOS account; on Linux it affects all profiles using that installation, including other system accounts. Linux asks for system authorization. Only the system account that set up the policy can change it through focus. Restart the browser if the extension does not appear. To undo setup, use **Remove extension** in focus., then restart the browser and remove the add-on there if it remains. Relinquishing policy does not prove the browser uninstalled the add-on. **Finish removal** retries cleanup after the policy has been relinquished or the browser is no longer detected.
- Installation and native registration are not a connection. Open the extension's **Browser setup**, choose the browser, enter a profile label and select **Connect to focus.**. Confirm that label in the desktop. Settings shows **Connected** only while the paired profile has an authenticated bridge lease. Profiles are grouped by browser family, not assigned to installations. A disconnected profile remains listed; reopen its browser and extension to reconnect, or remove the profile in Settings.
- Installation and pairing grant zero origins. Use the extension's site checkboxes to opt in per profile. Declining the browser prompt does not change saved rules. Revoke host access in browser settings or remove the profile in focus.; saved rules stay intact. An already paired profile can use its last acknowledged policy only on origins it still has permission to access.

On Slice 3 candidates, **Add site** in the desktop designates one normalized hostname, without granting it or its subdomains. Grant it separately in each profile's Browser setup. Grayscale applies on exact granted addresses and can be turned off without changing other rules. **Update required** means the profile cannot acknowledge the current saved policy; its last supported policy is retained.

Pause and Block are not available in normal builds. The Linux entry gate tests them with a disposable database and debug bridge only. In the Slice 3 reference run, Chromium 159.0.8154.6 committed a document served by the site's service worker before the Pause interstitial, despite zero document requests reaching the fixture server. [Chromium documents this DNR limit](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#interactions-with-service-workers). Replacing the document after commit is not pre-load enforcement. Firefox 160.0.1 intercepted that fixture, but a passing check on one engine does not qualify either entry mode. Keep both disabled until both reference engines pass the complete packaged gate.

Automatic setup requires a qualified package and the owner-supplied release for that browser. Snap and Flatpak are discovered separately from native packages. A detected WebExtensions portal is not proof that a package reads the intended policy or can launch the host; these packages remain unavailable until both paths are qualified. The Flathub `com.google.Chrome` package is not a vendor-qualified Chrome build. Zen tarball/AppImage installations with desktop entries are detectable but have no automatic policy route. Windows automatic setup is unavailable.

## Build a desktop candidate

On macOS, run `npm run tauri -- build --bundles app -- --locked`; the app contains `Contents/MacOS/focus-native-host`. On Linux, run `npm run tauri -- build --bundles deb -- --locked`; the package contains `/usr/bin/focus-native-host` and `/usr/libexec/focus-browser-policy`. Inspect package contents before installing in a disposable guest. An unsigned macOS bundle is not a distribution candidate. Other Linux bundle formats do not install the protected helper.

The Linux helper accepts only a fixed install/remove operation and a compiled native Gecko slot. The desktop uses `pkexec`; it never elevates a development binary or passes a file path or XPI from the webview. Only qualified root-owned browser directories are writable by the helper. An existing system-wide policy that can take precedence over the install-local policy blocks installation. macOS uses the verified application’s preference domain via CFPreferences and does not modify the signed browser bundle.

`apps/extension/browser-release.json` starts with both releases absent. For qualification, the release owner must supply:

- `chromium`: `extension_id`, `publisher`, `provenance`, and `published: true`, after verifying the live focus.-owned Chrome Web Store listing. A draft, test identity or another product's listing does not qualify. The desktop derives the URL from the pinned ID; the native host uses the same ID.
- `gecko`: `sha256` (lowercase hex), `version`, `amo_source` (Mozilla's HTTPS artifact source) and `provenance` for the exact AMO-signed `focus@focus-local` XPI. Set build-time `FOCUS_SIGNED_XPI` to its absolute path. Setup verifies the pinned digest, signed archive shape, manifest identity and required permissions; the browser independently enforces Mozilla's signature. No release artifact or signing input is fetched at runtime.

The packaged reference scenario below does not qualify a store listing, AMO XPI, native installer, policy provider or sandbox bridge. Qualify those separately against the exact package and browser build.

## Disposable development fixture

The local fixture uses development extension packages, not the one-click installer. Pairing grants no site access. Each profile must explicitly grant the exact listed origins.

### Build and launch

Use these steps only in a disposable test environment:

```sh
npm ci
npm run package:extensions
cargo build --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --bin focus-native-host
```

Use a disposable Linux VM/container for the reference gate. For a debug desktop, set `FOCUS_DATA_DIR` to an absolute disposable directory and `FOCUS_REGISTRATION_HOME` to its isolated registration home, then run `npm run tauri -- dev`. The native host must inherit the same `FOCUS_DATA_DIR`, for example from a test browser launched in that shell. The overrides are debug-only; the automatic installer does not mutate policy or native registration in fixture mode. Without an override the desktop and native host use `com.focus-local.desktop/focus.sqlite3` under the OS user data directory.

For a manual test, create `com.focus_local.bridge.json` in the browser's disposable directory below. The JSON `name` is `com.focus_local.bridge`, `description` is `focus. local bridge`, `type` is `stdio`, and `path` is the absolute path to the built debug `focus-native-host`. For Chromium-family browsers set `allowed_origins` to the test extension's single `chrome-extension://<id>/` origin (the ID displayed on its extensions page). For Gecko set `allowed_extensions` to `["focus@focus-local"]`. Do not overwrite an existing manifest. A Chromium launch with `--user-data-dir` may instead use its own `NativeMessagingHosts` subdirectory.

| Browser | Local extension load | Linux registration directory | macOS registration directory |
| --- | --- | --- | --- |
| Chrome | `chrome://extensions` → Load unpacked → `artifacts/extensions/chromium` | `.config/google-chrome/NativeMessagingHosts` | `Library/Application Support/Google/Chrome/NativeMessagingHosts` |
| Chromium | `chrome://extensions` → Load unpacked → `artifacts/extensions/chromium` | `.config/chromium/NativeMessagingHosts` | `Library/Application Support/Chromium/NativeMessagingHosts` |
| Brave | `brave://extensions` → Load unpacked → `artifacts/extensions/chromium` | `.config/BraveSoftware/Brave-Browser/NativeMessagingHosts` | `Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts` |
| Firefox | `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `artifacts/extensions/focus-firefox.zip` | `.mozilla/native-messaging-hosts` | `Library/Application Support/Mozilla/NativeMessagingHosts` |
| Zen | `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `artifacts/extensions/focus-firefox.zip` | `.mozilla/native-messaging-hosts` | `Library/Application Support/Mozilla/NativeMessagingHosts` |

Chrome variants may require enabling Load unpacked in the disposable browser, or using the reference Chromium for Testing build. Zen’s [reported Mozilla lookup](https://github.com/zen-browser/desktop/issues/10622) is not proof that it launched the native host. Keep all fixture writes out of personal browser homes. Follow the pairing steps above.

## Reference verification

Use Linux with official non-confined Firefox and matching `geckodriver`, `Xvfb`, `xdotool`, `dbus-daemon`, `python3-pyatspi`, `openssl`, `certutil` (Ubuntu `libnss3-tools`), `zip`, and `unzip`. Set `FOCUS_PYTHON=/usr/bin/python3` if the PATH Python cannot import the distro’s `pyatspi`.

```sh
npm ci
npx playwright install --with-deps chromium
npm run check && npm run test:unit
npm run build --workspace @focus/desktop
cargo test --locked --workspace --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo build --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --bin focus-native-host --bin focus-fixture-admin
npm run package:extensions
npm run test:browser -- --case shared-rule
npm run test:browser -- --case entry
```

The runner uses the exact ZIPs, private display and accessibility bus, isolated browser homes and a loopback-only HTTPS fixture proxy. Its generated certificate is trusted only for this run, using a key pin for Chromium and a temporary Firefox NSS profile. No certificate is installed in a system or personal trust store. No live sites are queried. Results and archive digests are in `artifacts/extensions/shared-rule-report.json` and `artifacts/extensions/entry-report.json`. A temporary Firefox add-on reinstall is not proof of durable signed-install persistence; that remains a later qualification gate. Treat a failing or incomplete entry scenario as unqualified; the engine-only preflight is not a packaged-product qualification.

The Chromium archive contains a fixed **test** identity and pairs only with the debug host; it is not the production Chromium release. The test key is public and is not a signing credential. The Firefox archive uses `focus@focus-local`. Browser-specific registration format: [Chromium](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) and [Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).
