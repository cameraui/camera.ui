# Changelog

All notable changes to this project will be documented in this file.

## [2.0.12]

### Fixed

- **Plugin updates no longer ask for a restart they don't need.** Since a plugin restarts itself as part of an update, the "restart to apply" hints were stale: the install log, the update dialog's restart button and the restart indicator on the plugin card all claimed a restart was still required. The log now finishes with the plugin already running the new version, the dialog simply closes, and the indicator only appears when a restart is genuinely needed.

## [2.0.11] - 2026-07-13

### Added

- **New "MQTT doorbell" blueprint in the automation store.** Rings a doorbell sensor whenever a matching MQTT message arrives — for example from a Shelly relay, a Tasmota device or a Zigbee2MQTT button. Combined with a virtual doorbell sensor, this turns any MQTT-capable button into a doorbell, including in HomeKit. The blueprint matches a value inside the JSON payload, so on/off devices ring exactly once per press.

- **Blueprints can now ask for text values during import.** The blueprint import wizard supports free-text inputs (with sensible defaults prefilled), so a blueprint like MQTT doorbell can ask for the MQTT topic and the field to match right in the import dialog — no editing the flow afterwards.

- **Instances now work with 2FA-protected accounts.** Adding or switching to a remote instance whose account has two-factor authentication enabled prompts for the 6-digit code (backup codes work too). After one successful code entry the connection keeps itself alive through rotating refresh tokens, so the code is only asked again if the instance hasn't been used for a long time. A wrong code simply re-prompts, and an instance whose challenge wasn't completed yet is clearly marked in the instances list with a "2FA" badge and an "Enter code" button to finish it whenever you like.

- **Beta versions for plugins are now opt-in.** The plugins page has a "Beta versions" toggle in its settings menu (next to the search bar). When enabled, pre-release versions show up in the plugin version picker and beta releases are offered as available updates; when disabled (the default), only stable versions are listed — previously, pre-releases always appeared in the version picker.

- **Camera cards show the snapshot age.** Every camera card on the dashboard has a small live-ticking badge in Apple-Home style (now → 45s → 3min → 2h → 1d) telling how long ago the displayed snapshot was actually fetched from the camera. The server reports the true age of its cached snapshots, so the badge stays accurate across page reloads.

### Fixed

- **Detections reported by smart cameras trigger reliably.** Detection reports coming from the camera's own intelligence (smart-camera plugins) could get lost in two ways: reports without bounding boxes fell through the zone filter, and presence reports without motion tracking were misjudged as "stationary" and suppressed. Both now count as real activity, so sensors driven by camera-side detection fire as expected.

- **Less error noise while shutting down.** Sensor updates arriving during server shutdown no longer race the already-stopping detection pipeline, which previously produced RPC "no responders" errors in the log.

- **Logs are easy to copy now — on phones too.** Every log console (logs view, camera and plugin logs, update console) has a copy button that copies the current selection. On touch devices, selecting works like native text selection: long-press a line to select it, keep holding and drag to extend across lines (scrolling past the edge included), then tap the copy button — previously there was no way to copy log output on mobile at all. Install logs also render at the correct width in every console now.

- **Plugin installs no longer time out in the interface.** Installing or updating a plugin aborted client-side after 30 seconds while the server was still busy running npm — the console kept streaming, but the result was reported as a failure. Installs now get the time they actually need.

- **Server updates via the launcher no longer collide with the running server on Windows.** The `camera.ui` launcher swapped the server's files while the server was still running, which Windows refuses for files in use — a server update could fail halfway through. The update is now downloaded and verified in the background as before, but the actual swap happens during the restart that follows the update, when nothing holds the files anymore. An interrupted swap is picked up and completed on the next start. (Ships with the updated `camera.ui` launcher package.)

- **Plugins can be updated and uninstalled on Windows again.** Updating or removing a plugin failed with "EPERM: operation not permitted" because the plugin process was still running and Windows refuses to move or delete a folder that is in use. A running plugin is now stopped before its files are touched and started again afterwards — on an update it comes back up on the new version right away, and if an update fails the restored previous version is restarted.

- **No more red pip "not on PATH" errors during Python setup on Windows.** Installing Python dependencies logged pip's harmless "scripts are not on PATH" notices as errors on Windows. The scripts are never used via PATH, so pip is now told not to warn about them.

- **Cloudflare tunnels work on Windows again.** The bundled `cloudflared` binary was installed without the `.exe` extension, which Windows refuses to execute — every tunnel start failed with a "spawn ENOENT" error, and with a named or managed tunnel configured this even crashed the whole server in a restart loop. The binary now gets the proper extension on Windows, the leftover broken download is cleaned up automatically, and a failure to start `cloudflared` can no longer take the server down.

- **Remote clients no longer lock themselves out after a tunnel URL change.** The server now announces its remote URL (Cloudflare quick tunnel, named tunnel or custom domain) only after verifying it resolves on public DNS and answers a health check. Previously, apps learning a brand-new quick-tunnel hostname too early cached the failed DNS lookup and couldn't reconnect for several minutes after a server restart.

- **Dashboard snapshots now refresh automatically.** Camera cards on the dashboard subscribe to the server's snapshot auto-refresh again — previously the pushed snapshots never reached the dashboard, so the preview images (and now the age badge) stayed frozen until a page reload or manual refresh.

- **The plugin pairing dialog now has copy buttons.** The device-flow pairing dialog (e.g. when connecting the NVR plugin to cameraui.com) offers a copy button next to the verification link and the pairing code, and both are text-selectable — previously there was no way to copy either one, especially in the desktop app.

## [2.0.10] - 2026-07-12

### Added

- **MQTT triggers can now react to a value inside a JSON message.** An MQTT message trigger offers a match mode: fire on any message on the topic, on an exact payload, or on a specific value at a path inside a JSON payload — for example a field like `output` being `true`, including nested fields. Since most smart-home devices publish JSON, a flow can now trigger on exactly the state you care about without adding a separate condition step.

- **Sensor values in automations can be driven by a variable.** When controlling a sensor (or checking one in a condition), the value field has a variable toggle: instead of a fixed number or option, you can insert a value carried by the trigger — for example set a light's brightness from an incoming MQTT message with `{{ mqtt.brightness }}`.

- **Audio can be disabled per camera source.** Each source in the camera's settings has a "Mute audio" toggle that removes the audio track entirely — live view, recordings and connected integrations then receive video only. Useful for cameras with a broken or unwanted audio stream.

### Fixed

- **Automations using an MQTT trigger or publish action can now be saved.** Adding an MQTT message trigger or an MQTT publish action to a flow failed to save with a validation error; these node types are now accepted.

## [2.0.9] - 2026-07-12

### Fixed

- **The interface stayed a blank white screen on Windows.** The server started fine, but the desktop app only ever showed white, and other devices on the network couldn't reach it either. On Windows the server was listening on IPv6 only, so any connection over IPv4 — which is how the app and most local devices connect — was refused. The server now listens on IPv4 on Windows, so the interface loads again and the server is reachable from phones and other computers.

- **Python plugins couldn't reach external services over HTTPS.** Plugins such as Wyze failed to log in with a TLS certificate error (`CERTIFICATE_VERIFY_FAILED`) because the bundled Python interpreter ships without a certificate authority store. camera.ui now provisions one for it, so plugins can verify secure connections again.

- **Pairing a discovered HomeKit camera failed with "Unexpected end of JSON input".** A successful pairing returned no data to parse, which aborted the flow even though the camera had actually paired. Pairing now completes and adds the camera.

- **Empty camera snapshots are no longer treated as valid.** When go2rtc momentarily couldn't produce a frame it could return an empty image, which was stored as a blank thumbnail; camera.ui now treats a zero-byte frame as a failure instead.

- **Adopted cameras no longer reappear under "Discovered".** After adding a discovered camera (e.g. an ONVIF camera found via go2rtc), it kept showing up in the Discovered list on the next scan. camera.ui now matches an already-added camera against its discovered entry by the camera's real address, so it stays out of the list once adopted.

## [2.0.8] - 2026-07-11

### Fixed

- **The server failed to start on 2.0.7.** A code-ordering bug in the virtual-sensor module crashed the server during startup (`Cannot access 'VirtualSensorHost' before initialization`) — fresh installs never came up and existing installs crash-looped after their next restart. If you are on 2.0.7, update to this version.

## [2.0.7] - 2026-07-11

### Added

- **Virtual sensors.** You can now create sensors that camera.ui controls itself, with no plugin involved — for example a doorbell for a camera that has no physical button, or a switch, contact, occupancy, smoke, leak, light, siren, lock, garage or security-system sensor. Create and manage them per camera under the camera's **Settings → Virtual Sensors**. Once created, a virtual sensor behaves exactly like a plugin sensor: control it from the camera's overview, use it in automations, or drive it from an external device through a webhook automation (the camera.ui equivalent of mapping an external button as a doorbell).

- **MQTT integration.** camera.ui now speaks MQTT. It runs a built-in broker (or connects to your existing external one), publishes camera and sensor state, and accepts commands — with optional Home Assistant auto-discovery, so your cameras and sensors appear as entities in Home Assistant automatically. MQTT is also wired into automations: trigger a flow from an incoming MQTT message, and publish a message as an automation action. Configure it under **Settings → MQTT**.

- **Filter recordings to only those with footage.** The Recordings filter sidebar gains an "Only events with recordings" toggle, so detection events that never produced a saved clip can be hidden.

### Changed

- **Adding a camera is simpler.** The stream source is now a single field where you paste the complete URL including the scheme (e.g. `rtsp://user:pass@host:554/stream`), instead of a separate protocol dropdown plus a chip field that required pressing Enter to save each entry. The protocol is detected automatically and shown below the field, and the help and test buttons enable once a supported protocol is recognized.

- **Automation sensor steps are much easier to configure.** In a "control sensor" action or a "sensor state" condition, each property now shows a readable label (e.g. "Ring", "Current state") instead of the raw key, and the value field matches the property's type — a toggle for on/off, a number stepper with +/−, and a dropdown with named options for states like Locked/Unlocked or Armed/Disarmed. Doorbell and other trigger sensors can now also be targeted by a control-sensor action.

- **Detection zones and crossing lines are listed in camera settings.** The Zones section now lists each zone, privacy mask and crossing line with its color and name; the pencil opens the editor already on the right tab with that entry selected, and each can be deleted straight from the list.

### Fixed

- **Shutting down no longer hangs for a few seconds.** Stopping the server or quitting the desktop app could sit through a 5-second timeout before force-quitting, because of active connections.

- **Python plugins can reach HTTPS services.** Python plugins now start with a CA certificate bundle, so plugins that call HTTPS APIs (e.g. cloud services) no longer fail with certificate-verification errors.

- **Cameras with special characters in their credentials are discovered correctly.** Usernames and passwords are now URL-encoded when probing a discovered camera through go2rtc, so credentials containing characters like `@` or `:` no longer break the connection.

- **Minor UI polish** across the plugin-detail and version dialogs, the zone editor, and the console.

## [2.0.6] - 2026-07-10

### Added

- **Discovered cameras now show their network address.** The Cameras view lists the address in its own column, and the connect dialog shows it above the credential fields — so several cameras of the same model can be told apart before adopting one. Cameras discovered by the server and by plugins both report it (plugins need an update to the latest SDK to provide it).

- **More timelapse speeds in the recordings export.** The timelapse interval now also offers 2, 3, 4 and 5 minutes.

- **Plugins flag compatibility problems with a warning icon.** A yellow warning next to a plugin's name explains, on hover, when it asks for a newer camera.ui or Node.js version than you're running (the plugin still starts) or can't run on this system's OS/CPU (it won't start) — so a plugin misbehaving after an update is easier to spot.

### Changed

- **The Configuration editor switches between camera.ui and go2rtc with tabs.** The two configs were previously toggled through an easy-to-miss floating button; explicit tabs at the top now show which config is being edited.

- **Console polish.** The log-level filter is a single "Levels" menu with toggles instead of a row of buttons, and the empty state matches the rest of the app (centered icon and text).

- **Backups get more time.** Creating, restoring and downloading a backup now allows up to 5 minutes instead of 30 seconds, so larger installs no longer hit a timeout mid-backup.

### Fixed

- **Windows: the server crash-looped on startup.** go2rtc (and the remote tunnel) failed to launch with `spawn UNKNOWN` because they were started with a relative working directory, which Windows rejects — so the whole server never came up. They now start without it.

- **Restoring a backup during First Steps was blocked.** The restore step reported "Password change required before first use" and couldn't continue; restoring is now permitted during the initial setup.

- **Restoring a backup onto a different machine left the server unreachable** ("Cannot reach your home server", and cloud/mobile access broke). A backup no longer carries the source machine's TLS certificate, and a restored install now regenerates its own identity — certificate, server addresses, and cloud pairing — instead of inheriting the source machine's. The restored install is reachable on its own network again; because it is a new server, you may need to re-pair cloud access and sign in again.

- **Backups and restores no longer run concurrently.** Starting a backup while another backup or restore is running (a second tab, another user, or a scheduled backup) is rejected with a clear message instead of doing the same heavy work twice — and two restores can no longer interleave, which could corrupt the server's storage.

- **Failed recording downloads now say so.** Downloading or exporting an event that fails (for example an NVR licensing problem) shows an error with the actual reason instead of failing silently.

- **A stalled live-stream viewer no longer grows memory.** A stream consumer that stops reading now has its session ended instead of queueing video data without bound.

- **Motion detection reconnects properly after stream errors.** When the detection or audio stream dies with a read error, the worker now logs the reason and reconnects with backoff instead of treating it like a stream that simply ended.

- **Snapshot fetches release the camera connection immediately.** Grabbing a snapshot frame kept its stream connection and decoder open longer than needed; they are now closed as soon as the frame is captured.

- **The connection banner no longer flips between "Connecting…" and "Reconnecting…".** While retrying, the banner alternated between the two labels on every attempt. It now shows "Connecting to your home server…" for the whole first-time connect and "Reconnecting…" only after an established connection was lost.

- **Changing remote-access settings over remote access no longer fails with a 502.** Switching the connection mode (e.g. Cloudflare to custom domain) from the mobile app or a remote session tore down the tunnel the request itself came through, so the confirmation could never arrive. The server now confirms the change first and applies it right after; the app then reconnects over the new route.

## [2.0.5] - 2026-07-08

### Changed

- **Plugin storage was rebuilt.** Each plugin now keeps its settings in a single, self-contained file instead of an embedded per-plugin database. This change was necessary so that Node, Python, and Go plugins all read and write their configuration in exactly the same format — previously each language used its own database engine, which made behavior inconsistent between plugins and fragile in setups where a plugin runs on a remote worker (the master/worker model). The new format is shared by all three runtimes, and each plugin's data now has a single, unambiguous owner, which makes remote-hosted plugins and enable/disable/restart noticeably more stable.

  **Your data migrates automatically.** The first time each plugin starts after this update, its existing settings are converted to the new format — no action is required. Your old data is left in place as a fallback, and a backup is written alongside the new file.

  **If a migration should fail**, the affected plugin starts with default settings. In that case you may need to set that plugin up again — for example, re-pair HomeKit, or sign in again in the NVR plugin. Your recordings are never affected.

- **Enabling or disabling a plugin no longer blocks.** The action returns immediately and the interface now reflects the plugin's real state (started / error) as it happens, instead of the request hanging while the plugin shuts down.

- **Faster, cleaner plugin shutdown.** Plugins now shut down in a defined order with bounded timeouts, so stopping or restarting a plugin — and shutting down the server — completes quickly and reliably instead of waiting on slow teardown steps.

- **Desktop app: fixed unclickable controls** in the camera drawer and dialogs that overlapped the window's title-bar drag area.

- **Faster stream startup for newly added cameras.** Cameras discovered or adopted via ONVIF, HomeKit, and Dahua/dvrip now enable hot-mode and stream preloading by default; ONVIF streams whose profile makes an eager connect unsafe stay lazy.

### Added

- **Option to delete a plugin's data when uninstalling.** The uninstall dialog now offers "Also delete stored plugin data (settings, databases, caches)". Left off, your settings survive a reinstall; turned on, the plugin's storage is wiped. Recordings and other protected folders are preserved. This cannot be undone.

- **Unread-notification badge on the browser tab.** The favicon now shows a live badge for unread notifications.

- **Beta update channel.** A "Beta updates" toggle in System settings lets you opt into beta releases; the choice persists across sessions (and sets the update source on mobile). The old toggle and a redundant version row were removed from the About page.

- **Tunable PTZ autotracking.** Autotrack gains three settings — tracking speed (how aggressively the camera re-centers), motion prediction / lead frames (aim ahead of a moving target; 0 disables), and pan-rate calibration (per-camera step-size tuning for under- or overshoot).

- **Allow plugin build scripts.** A new toggle in the Plugins view controls whether plugin dependency installs may run npm lifecycle and native-build scripts. Off by default (dependencies install with scripts ignored); enable only for plugins you trust.

- **Low-disk warning in Recordings settings.** When the storage volume is small, a banner now explains that recordings will rotate frequently to keep space free.

### Fixed

- **Duplicate cameras.** A camera a plugin already manages is no longer added a second time when a duplicate "camera added" event arrives.

- **Plugin events now respect plugin state.** Camera added and released events are only delivered to plugins that are installed, enabled, and actually running, and these calls now time out instead of blocking on an unresponsive plugin.

- **Notifications without a title** are no longer published.

- **Windows: no more flashing console windows** from the background processes (streaming, plugin runtimes, tunnel, and installer) started by the server.

- **ONVIF cameras that expose MJPEG.** Discovery now prefers H.264/H.265 for the decodable roles, orders streams by real resolution, and picks a sensible snapshot source; a warning is logged when a camera offers only MJPEG.

- **Camera discovery for URLs without a hostname.** Path-only or scheme-relative inputs now resolve via the URL path instead of failing.

- **HomeKit pairing.** The pairing request is now sent as form-urlencoded, so pairing a HomeKit camera works again.

- **Recordings export dialog no longer pre-selects every camera** when none were chosen — it opens with an empty selection so you choose explicitly.

- **Windows crash on backslash paths.** A config value containing a Windows path (e.g. `C:\Users\…`) no longer crashes the server — the generated NATS config now escapes backslashes correctly.

## [2.0.4] - 2026-07-07

### Fixed

- **Default settings page could point to a page that doesn't exist.** The "default settings page" option under Settings > Appearance listed an "Instances" entry that has no matching page (selecting it led to a dead route) and was missing "Notifications". The list now matches the actual settings pages, and any previously saved invalid choice falls back to Account.
- **Interface language detection.** Regional system locales now resolve to their base language (e.g. `de-AT` and `de-CH` map to German), and any unsupported system language falls back to English.

## [2.0.3] - 2026-07-07

### Fixed

- **Plugin installs failed in the desktop app.** Installing or updating a plugin tried to launch a system `npm`, which the desktop app doesn't ship, so it failed with `spawn npm ENOENT`. The desktop app now uses its own bundled npm to install plugin dependencies.

## [2.0.2] - 2026-07-07

### Added

- **Custom ffmpeg path.** A new optional `ffmpegPath` config setting points camera.ui at a specific ffmpeg binary. When set and the file exists it takes precedence over the bundled one; otherwise the bundled ffmpeg (recommended) or system `ffmpeg` is used.

### Fixed

- **Snapshots and streams could fail with `ffmpeg: executable file not found`.** When the bundled ffmpeg wasn't detected at first launch, go2rtc's ffmpeg path fell back to a bare `ffmpeg` and stayed there even once the bundled binary became available. The path now re-points to the bundled ffmpeg on every start.

## [2.0.1] - 2026-07-07

### Added

- **Bind address option.** A new `host` config setting controls which address the server listens on (default `::`), so you can bind to a specific interface or to `127.0.0.1` behind a reverse proxy.
- **Release notes before updating.** The server update dialog now shows the release notes for the target version, so you can see what changed before you confirm.

### Fixed

- **Server wouldn't start with IPv6 disabled.** Binding to the IPv6 wildcard (`::`) now falls back to IPv4 (`0.0.0.0`) when IPv6 is turned off at the kernel level.

## [2.0.0] - 2026-07-06

camera.ui v2 is a **complete rewrite** — a new server, a new interface, and a new architecture. Listing every change here wouldn't do it justice; instead:

- **What camera.ui is now:** see the [documentation](https://docs.cameraui.com)
- **Coming from v1?** v2 is a fresh start — please read [Getting started](https://docs.cameraui.com/intro/getting-started)

Changes after this release will be documented here as usual.
