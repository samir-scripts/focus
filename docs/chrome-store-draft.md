# Chrome Web Store draft

The publisher dashboard saved version `0.1.0` as **Draft** on November 20, 2026. Google assigned item ID `gjopbhkkemlhggdbpfhmmmlmamdigehg`. The uploaded ZIP has SHA-256 `992cebfbb54fcdf7d3f3e6db7e00528f79ba6f5a995ca26a6197629a2ef01d72`. The draft includes the English description, store icon, and first screenshot.

## Store listing

**Name**  focus.

**Summary from the uploaded manifest**  Apply your focus. preferences in this browser profile.

**Category**  Productivity → Tools

**Description**

Keep the YouTube videos you came to watch. Turn on Hide Shorts in the focus. desktop app to hide Shorts shelves, cards, and navigation links on supported YouTube discovery pages. Ordinary videos and directly opened Shorts remain playable.

Open the extension’s Setup page, give this Chrome profile a name, and approve the connection in the desktop app. Then grant YouTube access in the browser. Each profile has its own site permissions. You can turn Hide Shorts off in focus. or revoke site access in Chrome to restore discovery.

The extension communicates with the desktop app on this computer. It starts with zero site grants. YouTube is the site with an available content rule in this version.

## Upload material

Build with `npm run package:extensions -- --chrome-web-store`. Upload `artifacts/chrome-web-store/focus-chromium.zip`. It omits the fixture key, includes the desktop typewriter icon in 32px and 128px sizes, and limits optional site access to the 22 exact hosts in the site's catalog. The captured 1280×800 Setup screenshot is `artifacts/chrome-web-store/browser-setup.png`.

## Permission descriptions

| Permission | Purpose |
| --- | --- |
| Native messaging | Pair with the local desktop app and exchange the shared rule and this profile’s acknowledgment. |
| Storage | Keep this profile’s pairing credentials, connection status, and cached policy on this device. |
| Scripting | Apply or reverse the bundled YouTube rule on hosts the user grants. |
| Alarms | Reconnect the local bridge when the service worker wakes. |
| Optional site hosts | Let the user grant or revoke individual sites in Setup. Installation requests no required host permissions. |

The store assigns the item ID on first upload. Record that ID for the publisher, and enable the desktop listing only after the published item, public identity, and native bridge have been verified together. The publisher supplies real contact and privacy URLs and attests to the store disclosures before submission.
