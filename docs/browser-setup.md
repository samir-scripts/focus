# Connect a disposable browser to focus.

Slice 2 is a local development build, not a store or installer release. The desktop edits the shared Hide Shorts setting before or after pairing. Each browser profile grants its own exact HTTP(S) addresses. Other catalog sites can grant access but have no rules in this build.

## Build and launch

```sh
npm ci
npm run package:extensions
cargo build --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --bin focus-native-host
```

Use a disposable Linux VM/container for the reference gate. For manual setup, create an isolated test home and launch the debug desktop with `FOCUS_DATA_DIR` pointing to an absolute disposable directory and `FOCUS_REGISTRATION_HOME` pointing to the isolated registration home. Launch with `npm run tauri -- dev`. The native host must inherit the **same** `FOCUS_DATA_DIR` (for example, from a browser launched in that shell). Changes to these variables affect only debug builds. Without an override, both programs use `com.focus-local.desktop/focus.sqlite3` under the OS user data directory.

In desktop **Settings → Browsers**, expand the matching browser. Copy the generated native host JSON to `com.focus_local.bridge.json` in the browser’s **disposable** registration directory. The path inside the JSON must be the absolute path to the `focus-native-host` binary built above. Don’t overwrite another manifest. The default directories below are relative to the disposable home; if the Chromium browser was launched with a separate `--user-data-dir`, its `NativeMessagingHosts` subdirectory may take precedence (verified for the reference Chromium for Testing version).

| Browser | Local extension load | Linux registration directory | macOS registration directory |
| --- | --- | --- | --- |
| Chrome | `chrome://extensions` → Load unpacked → `artifacts/extensions/chromium` | `.config/google-chrome/NativeMessagingHosts` | `Library/Application Support/Google/Chrome/NativeMessagingHosts` |
| Chromium | `chrome://extensions` → Load unpacked → `artifacts/extensions/chromium` | `.config/chromium/NativeMessagingHosts` | `Library/Application Support/Chromium/NativeMessagingHosts` |
| Brave | `brave://extensions` → Load unpacked → `artifacts/extensions/chromium` | `.config/BraveSoftware/Brave-Browser/NativeMessagingHosts` | `Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts` |
| Firefox | `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `artifacts/extensions/focus-firefox.zip` | `.mozilla/native-messaging-hosts` | `Library/Application Support/Mozilla/NativeMessagingHosts` |
| Zen | `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `artifacts/extensions/focus-firefox.zip` | `.mozilla/native-messaging-hosts` | `Library/Application Support/Mozilla/NativeMessagingHosts` |

Chrome variants may require enabling Load unpacked **in the disposable test browser** or using the reference Chromium for Testing build. Zen’s [reported Mozilla lookup](https://github.com/zen-browser/desktop/issues/10622) is not a product handshake qualification. A matching file is not evidence that a browser launched the host. Do not register the host under a personal browser home to run a slice gate. Windows, signed installers, store identities and fork qualification are out of scope here.

Open the extension popup, then **Browser setup**. Choose the browser, enter a profile label, and select **Connect to focus.**. In the desktop confirmation, check the browser and label, edit the label if needed, then connect. Pairing grants no origins. Use the nine site checkboxes in Setup to request access; the address list distinguishes granted and ungranted schemes. Declining the browser prompt does not change the saved desktop setting. Revoke host access in browser settings or unpair in desktop Settings; saved rules are retained. If the bridge is unavailable, an already paired profile uses its last acknowledged policy only on currently granted origins.

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
```

The runner uses the exact ZIPs, private display and accessibility bus, isolated browser homes and a loopback-only HTTPS fixture proxy. Its generated certificate is trusted only for this run, using a key pin for Chromium and a temporary Firefox NSS profile. No certificate is installed in a system or personal trust store. No live sites are queried. Results and archive digests are in `artifacts/extensions/shared-rule-report.json`. A temporary Firefox add-on reinstall is not proof of durable signed-install persistence; that remains a later qualification gate.

The Chromium archive contains a fixed **test** identity and pairs only with the debug host; the production Chromium identity has not been reserved. The test key is public and is not a signing credential. The Firefox archive uses `focus@focus-local`. Browser-specific registration format: [Chromium](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) and [Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).
