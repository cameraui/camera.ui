# Changelog

All notable changes to this project will be documented in this file.

## [2.0.18]

### Fixed

- **The same stationary object no longer shows up as a new event every few minutes.** Short motion events restarted the stationary detection each time, so a parked car or other unmoved object kept producing identical-looking events. It now settles across events and goes quiet after the first one or two.

## [2.0.17]

### Fixed

- **Parked vehicles stay quiet when something passes in front of them.** Someone walking past a parked car could fire a vehicle event and a burst of unreadable plate readings for a car that never moved. The detection now tells a blocked view apart from the car actually driving off, and a car that re-parks in a new spot goes quiet there too.

- **Detection snapshots respect your thresholds.** Face, plate and classifier readings below the configured confidence or plate length settings no longer produce image crops, they were created and thrown away on every frame before.

- **Some actions in the mobile app failed with a Capacitor error.** When connected through a remote domain, actions like switching a camera's plugins showed "The operation couldn't be completed" and did not apply. Affected every request the app sent without a body.

- **Camera shortcuts no longer disappear after jumping between cameras.** Opening a camera through a shortcut while the recording timeline was active could leave that camera's own shortcuts invisible until a new one was added. Data loaded right after such a jump could silently fail to arrive at all.

## [2.0.16]

### Added

- **camera.ui comes to Home Assistant.** Run it as a Home Assistant add-on and add the companion integration to bring your cameras onto your dashboards with live camera and PTZ cards, and open the full interface right in the sidebar.

- **Serve the interface over plain HTTP for reverse proxies.** Setups behind Nginx, Caddy or Traefik that already handle HTTPS can now reach camera.ui over an optional HTTP port, instead of dealing with its self-signed certificate.

- **Your cameras' sensors and detections are now available to other tools.** Every camera's sensors (contact, lock, light, alarm, and more) can be read and controlled over the API and MQTT, and the live event stream reports the objects, faces and license plates it recognizes. Home Assistant and similar integrations can mirror your cameras and use them in automations.

- **Building automations got much easier.** Every input in the automation editor now suggests what the connected trigger really produces: variables with readable names, one-click values like Locked/Unlocked for a lock or true/false for a switch, PTZ presets from the camera's real preset list, recently seen MQTT topics and known face names. Saving warns about problems directly on the affected nodes, like a missing trigger or a mistyped variable.

- **Automation runs are visible now.** The flow card shows whether the last run succeeded, and a history dialog lists recent runs with the path through the flow: which branch a switch took, how long each step ran, and any warnings. The test run replays the last real trigger event instead of running with empty values.

- **Recording is now a camera setting.** Enable or disable recording, the recording mode, pre-buffer and recorded streams moved from the NVR plugin's settings into the camera settings, with their own Recording section in the camera drawer. They can be changed even while no NVR plugin is installed, and existing values are carried over automatically.

- **Automations can control more camera settings.** The camera control action now also covers recording on/off and mode, PTZ autotracking, face and plate recognition thresholds, stationary-object suppression and HQ snapshots.

- **Bulk-select unknown face images.** The Faces page has a select mode now: pick any number of unknown face images across groups and assign them to a person, remove them from their group or discard them in one go.

- **Tune face and license plate recognition per camera.** The camera's detection settings now let you set a minimum face confidence, a minimum plate reading confidence and a minimum plate length, so you decide how strict recognition is for each camera.

### Fixed

- **camera.ui starts up quickly again.** With Go-based plugins installed (such as the NVR), the server could hang for minutes while starting.

- **Camera streaming sessions release their resources reliably.** When a HomeKit stream or recording ended, failed to start or was stopped twice at once, native video resources could stay behind and slowly drive up CPU and memory on long-running installations. Every shutdown path now waits for the same cleanup, and a failed start releases everything it opened. Thanks @JxnLexn!

- **Cameras with a broken snapshot endpoint show a picture again.** Some cameras return corrupted images on their snapshot URL. Snapshots now fall back to a frame from the video stream instead of showing nothing.

- **Downloading a plugin/camera log from the mobile app works now.** It failed with "Missing parent directory" because the plugin name's slash ended up in the file name. Slashes and other invalid characters are now replaced for every download.

- **The "Show hidden" button no longer disappears.** After hiding some discovered cameras and adopting all the rest, the button vanished and the hidden entries were unreachable. It now stays visible whenever hidden cameras exist.

- **Discovered cameras from different plugins can no longer hide each other.** When two plugins reported a device under the same internal id, only one of them showed up under Discovered, and adopting it could go through the wrong plugin. Discovery entries are now tracked per plugin.

- **Two cameras can no longer end up with the same name.** Adopting discovered cameras that report identical names (common with ONVIF) or renaming a camera to an existing name created duplicates, which broke streams and blocked adding the cameras to Camview. Adopted cameras now get a free name suggested ("Camera 2"), and saving a taken name is rejected with a clear message. Names that only differ in casing or spaces count as taken too.

- **Plugins on two different Python versions no longer wipe each other during install.** When plugins needed both supported Python versions, installing the newer one could delete the older one mid-install, so plugins failed on first start until the next restart. Cleanup now only removes outdated builds of the same version.

- **Slow first-time plugin setup on a worker no longer gets cut off.** Assigning a heavy plugin to a worker could hit the 5 minute limit while Python and dependencies were still downloading, and the master pulled the plugin back to run locally. The master now keeps waiting while the worker reports installation progress, up to 10 minutes.

- **Python plugins start on paired workers now.** Hosting a Python plugin like CoreML on a remote worker failed during provisioning ("No module named virtualenv", then "Cannot read properties of undefined") until the master gave up and ran it locally. The worker now sets up the same Python base environment as the master before starting the plugin, and skips a check that only applies on the master.

- **Notifications from cameras with built-in smart detection carry an image again.** On cameras whose person/vehicle detection comes from the camera itself (like Reolink) without an AI plugin assigned, detection pushes arrived without a picture and only at the end of the detection. The snapshot now attaches to the detection as soon as it arrives, so the push fires promptly with the image.

- **Connecting your own Cloudflare domain works reliably again.** Setting up remote access with a Cloudflare account often failed right away with "Login failed: cloudflared exited with code null" and the browser login never opened: the server restarted its tunnel processes mid-setup and killed the login. The login window is now left alone until it finishes.

- **Automation flows with several triggers or merged branches run now.** Wiring two triggers to the same action, or joining the two sides of an If/Else back together, silently never ran the rest of the flow.

- **PTZ and other complex sensor values are usable in automations.** Values like the PTZ position arrived as one unmatchable JSON blob; their parts are now separate variables (like sensor.value.pan), and pickers no longer offer write-only commands as trigger properties.

- **Sensor automations survive plugin restarts.** After a plugin restarted, flows triggered by its sensors never fired again until they were re-saved.

- **Automation schedules follow real cron rules.** Ranges with steps like 8-18/2 fired at the wrong times, day-of-month steps were shifted and Sunday as 7 was rejected. Schedules now run on a proper cron engine.

- **Editing automations on the phone saves again.** Changing a node's settings in the mobile editor never showed the save button, so the changes were lost when leaving the page.

- **License plate readings settle on one plate instead of a wall of guesses.** A car passing the camera used to produce dozens of conflicting plate strings, and the event kept several of them ("C2443", "3J77", "5544" for the same car). Readings of the same plate are now grouped and the one seen most consistently across frames wins, unreadable and too-short readings are dropped, and the number of plate crops kept per event is capped so long clips no longer pile up memory.

- **A camera's own plugin can be selected as detection provider again after unchecking it.** Removing a camera plugin (like Reolink) from a detection type made it disappear from the provider list for good, only the AI plugin remained. The plugin now stays selectable for every sensor type the camera actually supports.

- **Restoring a large backup works now.** Uploading a backup over 100 MB failed with "request file too large". The size limit is gone and the upload is streamed to disk instead of being held in memory. Restoring from the setup wizard on a fresh installation could also lose part of the settings while the server was still starting up in the background; restoring now asks you to wait until startup is finished.

- **Several smaller automation fixes.** The repeat counter variable was stuck at 0, results after parallel repeats never reached later nodes, HTTP action headers could not be set at all, the first location report after a server restart could swallow an enter/leave event, events with several detection types matched no switch case, and typos in template variables now log a warning instead of silently becoming empty.

## [2.0.15]

### Added

- **API tokens for external integrations.** Create long-lived tokens under Settings > Account for tools like Home Assistant, instead of pasting your session token. Tokens work for the REST API and live updates, show when they were last used, and can be revoked at any time.

- **Set a custom aspect ratio for a camera.** The aspect ratio field opens a dialog where you pick a preset or type any width:height (like 21:9 or 3:2), with a live preview of the camera framed at that ratio so you see exactly what fits before saving.

### Fixed

- **ONVIF cameras stream and snapshot reliably again, in the right quality.** Discovered ONVIF sources got malformed addresses, with two visible symptoms: cameras that offered their high-resolution stream over ONVIF (like the 2K main stream of Vatilon cameras) fell back to a low-resolution default, and Reolink cameras rejected streaming and snapshots with authentication errors ("streams: 401", "wrong user/pass"). New discoveries produce clean addresses, and already saved sources are repaired on the fly, without re-adding the camera.

- **Changing camera settings while its frame worker is busy no longer logs an unhandled error.** Pushing a new name, zones or detection settings to an unresponsive frame worker timed out with "unhandledRejection: RPC call ... timed out after 30000ms". It now logs a short warning instead; the settings still apply on the next worker start.

- **The default settings page is respected everywhere.** Opening Settings from the mobile menu always landed on Account instead of the page chosen under Appearance. Only the sidebar honored the choice; now every path into Settings does.

- **The navigation sidebar no longer gets out of sync after logging out and back in.** If the sidebar was open before logging out, the page content stayed shifted aside after logging back in while the sidebar itself rendered collapsed, and the toggle button stopped working. Same fix for the settings sub-menu.

- **"Open at login" in the desktop app no longer shows as turned off on Windows.** The setting kept working, but its checkmark disappeared whenever the menu refreshed, for example after restarting the server from within the app. The checkbox now reflects the real state.

- **Adding a source with the snapshot role works now.** Saving failed with "Snapshot source can not be used with hotMode/preload" even though those switches are not shown for snapshot sources. Snapshot sources now ignore these options instead of rejecting the save.

- **Renaming a camera no longer breaks its settings panel.** After saving a new name, the panel kept looking for the old one: the Plugins tab showed "Camera not exists" and further changes failed until the panel was reopened. It now follows the new name right away.

- **Python plugins shut down cleanly again.** Stopping the server could log an error ("dictionary changed size during iteration") while a Python plugin closed its storage, which could stall shutdown until it timed out. Its storages now close from a stable snapshot.

- **A "camera offline" marker on the timeline no longer keeps growing after the camera is back.** It stretched toward the current time for up to a minute once a camera recovered, then snapped to its real, much shorter length. It now settles at the moment the camera came back right away.

- **System event markers on the timeline have rounded ends.** They now match the recording and event bars instead of having square corners.

## [2.0.14]

### Fixed

- **Exporting recordings works over remote access again.** When the interface was opened through the cloud address (proxy.cameraui.com) but the server ran on its own domain, the export download was blocked by the browser (CORS). Streamed downloads now send the same cross-origin headers the rest of the API already did.

- **A Docker worker starts without listing its capabilities.** A worker started without `CAMERA_UI_WORKER_CAPABILITIES` refused to boot ("no capabilities configured"). It now offers everything by default; the master still assigns only what you give it. Set the variable to restrict a worker to a single job.

- **Connecting to ONVIF cameras that use non-standard service paths works now.** Hikvision, TP-Link Tapo and others put their media service at a different address than most cameras, and the connection failed with "wrong response 404". Their reported stream address is also corrected to the address the camera was reached on, so cameras behind a port forward or reporting a stale internal IP connect too.

- **Installing or updating the desktop app on Windows no longer gets stuck asking to close camera.ui.** Reinstalling or updating over an existing install could halt with a repeated "camera.ui can't be closed" prompt even when the app wasn't running. It installs cleanly now, and if the app really is open it asks you to close it once instead of looping. The fix lives in the installer itself, so it takes effect once this version is installed: updating to it from an older build can still show the prompt one last time (click Cancel to let it finish, or uninstall and install fresh).

- **Uninstalling the desktop app on Windows no longer silently deletes your data.** The uninstaller now asks whether settings and recordings should be removed too. Updates never touch them.

## [2.0.13]

### Fixed

- **Fresh installs no longer fail with an npm error.** Installing the server or a plugin's dependencies aborted with "EALLOWSCRIPTS" on current npm versions, visible as a restart loop on new Docker setups. Existing installations were not affected. The packages allowed to run install scripts are now declared explicitly instead of being approved wholesale.

## [2.0.12]

### Added

- **Select multiple cameras at once on the home screen.** A new select button (bottom right) puts the camera grid into selection mode: tapping a card selects it (marked with a round check badge in its corner), and the action buttons let you disable/enable, snooze/resume detections, turn NVR recording on/off, or remove all selected cameras in one go. Removal asks for confirmation first, and the recording button appears once the NVR plugin is set up. The per-card buttons and drag-and-drop pause while selecting, and the buttons flip direction automatically (e.g. "Enable" when every selected camera is disabled).

- **Parked cars no longer trigger on every event.** Objects that stay put, like a car parked in the driveway, keep their identity across detection events and are suppressed as long as they don't move: they no longer re-trigger object detection every time something else causes an event. Identity attributes (faces, license plates, classifiers) are captured in full during the first event and then pause as well, so a stationary object stops producing new snapshots and inference load entirely. The moment the object actually moves, everything kicks back in immediately, and a new object showing up in the same spot is detected as usual. Enabled by default, can be turned off per camera under Detection settings ("Ignore stationary objects").

- **New cameras start with the NVR plugin active.** When the NVR plugin is installed, a newly added camera (manual or discovered) gets it enabled right away instead of requiring a manual activation in the camera drawer.

- **Exports with a single video download as a plain MP4.** The ZIP wrapper is only used when the export contains more than one file, and the format badge in the export dialog shows what you'll get.

- **Setting up a second machine as a worker got easier.** Worker mode can now be enabled via the `CAMERA_UI_WORKER=true` environment variable instead of the `--worker` flag, which makes a Docker worker a pure compose setup (see `docker-compose.worker.yml` in the docker repo). `cameraui install --worker` now also keeps worker mode across reboots; previously the installed service silently started as a normal server.

- **The desktop app can run as a worker.** New option in the mode picker: enter the master's address and a pairing code (generated on the master in the Workers view) and the machine joins as a worker. It runs no UI of its own, a small status window shows the connection, and together with "Close to tray" and "Open at login" an old laptop becomes a headless worker.

- **The desktop app can live in the tray.** Two new options in the tray menu: "Close to tray" keeps camera.ui (and a local server) running in the background when you close the window, and "Open at login" starts the app automatically with your system, minimized to the tray. Handy when the desktop app acts as your server and you only connect from other devices. On Windows a left-click on the tray icon brings the window back.

### Fixed

- **Settings added in updates now reach existing installations automatically.** Fields introduced by newer versions stayed empty on records created earlier, visible as blank inputs in the camera settings (e.g. tracking speed, motion prediction and pan rate calibration under PTZ autotracking). On every start the server now fills missing fields with their defaults across cameras, users, instances, automations, virtual sensors, shares, notification settings and the MQTT/remote-access/server settings; existing values are never changed. The camera validation also learned the sensor types added over time (CLIP, lock, temperature, humidity, occupancy, smoke, leak, garage door), which it previously rejected as unknown.

- **PTZ autotracking has been overhauled.** Cameras that support ONVIF displacement moves (relative FOV moves or absolute positioning, requires the updated ONVIF plugin) are now driven by exact distances instead of timed velocity pulses: one straight move to the target instead of a staircase of corrections. The camera keeps up with a person walking close by (it re-aims faster and predicts where they'll be after each move), re-finds a briefly lost target instead of waiting for the return-home timeout, approaches a person standing still off-center, keeps turning toward someone half out of frame, and stops pushing an axis that sits at its mechanical limit. Manual PTZ control always wins: any movement not commanded by the autotracker (joystick, vendor app) suspends it for 45 seconds. All decisions are visible in the trace log.

- **PTZ movements no longer flood motion and object detections.** While the camera repositions (an autotracking pulse, the PTZ controls or the vendor app), the tracker silently keeps following its target, but detections no longer reach sensors, events or notifications: previously every pan shifted all bounding boxes at once and fired motion and object triggers like crazy. The motion detector now keeps learning the scene during the move (instead of comparing against the pre-move image afterwards), remembered stationary objects reset cleanly since their position is no longer valid, and the quiet period after a movement also applies to movements not initiated by camera.ui.

- **Bounding boxes in the live view stay accurate.** Object boxes now keep updating while a PTZ camera moves instead of vanishing for the whole pan. Face and license-plate boxes no longer freeze on screen: they clear when the camera starts moving and expire after a couple of seconds once nothing is detected anymore.

- **System events on the timeline no longer draw into each other.** Events close together (camera offline, plugin restarted) rendered as overlapping thin lines when zoomed out, looking like a glitch. They now collapse into one marker showing the most severe message plus a "+N" count, and separate again when zooming in.

- **Timeline playback no longer loops at recording gaps.** Playing across a spot where the camera stopped recording bounced the playhead a few seconds back and replayed them forever, with "No Recording" flashing every two seconds. The playhead now keeps ticking through the gap with the overlay shown and playback picks up on its own once recordings resume. Short gaps that the player bridges internally no longer leave the overlay stuck on top of running video.

- **Recording exports work again when the UI runs over HTTPS in the browser.** The download never started and the export dialog kept spinning forever.

- **ONVIF camera discovery now finds cameras on Windows and multi-network machines.** The search probed only one network interface (often a VPN or virtual adapter) and the Windows firewall swallowed the answers. Every network is now scanned directly, which also works through the firewall without extra rules. Cameras that report their address twice (IPv4 and IPv6) no longer get dropped from the results.

- **Camera snapshots refresh without flashing.** Auto-refreshed snapshots swapped in before the browser had decoded the new image, so every refresh flashed briefly. With several cameras the whole dashboard blinked at once. New images are now decoded in the background and swapped in seamlessly.

- **A snapshot source no longer drags the camera status down to "partial".** Snapshot sources never stream, but they were counted as idle in the connection status.

- **Empty sensor categories are hidden in the camera drawer.** Sensor types a plugin offers in general but not for this specific camera (e.g. face on a camera without face detection) no longer show up as empty categories under Plugins.

- **Classifier plugins now contribute their results to events.** Classifier detections computed on object crops in the standard detection loop were collected but silently dropped before reaching their sensor and the running event; only externally reported classifier results ever made it through. They now appear as detections, event types and thumbnails just like face and license-plate results. An error from a classifier plugin during inference could previously also crash the camera's detection worker; it is now handled and logged like errors from the other detectors.

- **Disabled cameras no longer keep their streams warm.** Sources with "always active" (hot mode) were still preloaded by go2rtc while their camera was disabled: the boot-time config sync wrote the preload entry regardless of the disabled state, and go2rtc happily connected to the camera on its own startup. Disabled cameras are now excluded from the generated preload config, any leftover preload is stopped on server start, and toggling a camera on/off updates the go2rtc config immediately so a go2rtc restart can't bring the stream back.

- **Desktop app updates on Windows no longer stop at "camera.ui cannot be closed".** When shutting down took too long, helper processes (go2rtc, ffmpeg, the tunnel client) could be left running: invisible in a quick Task Manager check, but enough for the installer to refuse to continue since they run from the installation directory. The server now reaps its helper processes on every exit path, and the desktop app additionally sweeps any leftovers before the installer starts.

- **Plugin updates no longer ask for a restart they don't need.** Since a plugin restarts itself as part of an update, the "restart to apply" hints were stale: the install log, the update dialog's restart button and the restart indicator on the plugin card all claimed a restart was still required. The log now finishes with the plugin already running the new version, the dialog simply closes, and the indicator only appears when a restart is genuinely needed.

## [2.0.11]

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

## [2.0.10]

### Added

- **MQTT triggers can now react to a value inside a JSON message.** An MQTT message trigger offers a match mode: fire on any message on the topic, on an exact payload, or on a specific value at a path inside a JSON payload — for example a field like `output` being `true`, including nested fields. Since most smart-home devices publish JSON, a flow can now trigger on exactly the state you care about without adding a separate condition step.

- **Sensor values in automations can be driven by a variable.** When controlling a sensor (or checking one in a condition), the value field has a variable toggle: instead of a fixed number or option, you can insert a value carried by the trigger — for example set a light's brightness from an incoming MQTT message with `{{ mqtt.brightness }}`.

- **Audio can be disabled per camera source.** Each source in the camera's settings has a "Mute audio" toggle that removes the audio track entirely — live view, recordings and connected integrations then receive video only. Useful for cameras with a broken or unwanted audio stream.

### Fixed

- **Automations using an MQTT trigger or publish action can now be saved.** Adding an MQTT message trigger or an MQTT publish action to a flow failed to save with a validation error; these node types are now accepted.

## [2.0.9]

### Fixed

- **The interface stayed a blank white screen on Windows.** The server started fine, but the desktop app only ever showed white, and other devices on the network couldn't reach it either. On Windows the server was listening on IPv6 only, so any connection over IPv4 — which is how the app and most local devices connect — was refused. The server now listens on IPv4 on Windows, so the interface loads again and the server is reachable from phones and other computers.

- **Python plugins couldn't reach external services over HTTPS.** Plugins such as Wyze failed to log in with a TLS certificate error (`CERTIFICATE_VERIFY_FAILED`) because the bundled Python interpreter ships without a certificate authority store. camera.ui now provisions one for it, so plugins can verify secure connections again.

- **Pairing a discovered HomeKit camera failed with "Unexpected end of JSON input".** A successful pairing returned no data to parse, which aborted the flow even though the camera had actually paired. Pairing now completes and adds the camera.

- **Empty camera snapshots are no longer treated as valid.** When go2rtc momentarily couldn't produce a frame it could return an empty image, which was stored as a blank thumbnail; camera.ui now treats a zero-byte frame as a failure instead.

- **Adopted cameras no longer reappear under "Discovered".** After adding a discovered camera (e.g. an ONVIF camera found via go2rtc), it kept showing up in the Discovered list on the next scan. camera.ui now matches an already-added camera against its discovered entry by the camera's real address, so it stays out of the list once adopted.

## [2.0.8]

### Fixed

- **The server failed to start on 2.0.7.** A code-ordering bug in the virtual-sensor module crashed the server during startup (`Cannot access 'VirtualSensorHost' before initialization`) — fresh installs never came up and existing installs crash-looped after their next restart. If you are on 2.0.7, update to this version.

## [2.0.7]

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

## [2.0.6]

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

## [2.0.5]

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

## [2.0.4]

### Fixed

- **Default settings page could point to a page that doesn't exist.** The "default settings page" option under Settings > Appearance listed an "Instances" entry that has no matching page (selecting it led to a dead route) and was missing "Notifications". The list now matches the actual settings pages, and any previously saved invalid choice falls back to Account.
- **Interface language detection.** Regional system locales now resolve to their base language (e.g. `de-AT` and `de-CH` map to German), and any unsupported system language falls back to English.

## [2.0.3]

### Fixed

- **Plugin installs failed in the desktop app.** Installing or updating a plugin tried to launch a system `npm`, which the desktop app doesn't ship, so it failed with `spawn npm ENOENT`. The desktop app now uses its own bundled npm to install plugin dependencies.

## [2.0.2]

### Added

- **Custom ffmpeg path.** A new optional `ffmpegPath` config setting points camera.ui at a specific ffmpeg binary. When set and the file exists it takes precedence over the bundled one; otherwise the bundled ffmpeg (recommended) or system `ffmpeg` is used.

### Fixed

- **Snapshots and streams could fail with `ffmpeg: executable file not found`.** When the bundled ffmpeg wasn't detected at first launch, go2rtc's ffmpeg path fell back to a bare `ffmpeg` and stayed there even once the bundled binary became available. The path now re-points to the bundled ffmpeg on every start.

## [2.0.1]

### Added

- **Bind address option.** A new `host` config setting controls which address the server listens on (default `::`), so you can bind to a specific interface or to `127.0.0.1` behind a reverse proxy.
- **Release notes before updating.** The server update dialog now shows the release notes for the target version, so you can see what changed before you confirm.

### Fixed

- **Server wouldn't start with IPv6 disabled.** Binding to the IPv6 wildcard (`::`) now falls back to IPv4 (`0.0.0.0`) when IPv6 is turned off at the kernel level.

## [2.0.0]

camera.ui v2 is a **complete rewrite** — a new server, a new interface, and a new architecture. Listing every change here wouldn't do it justice; instead:

- **What camera.ui is now:** see the [documentation](https://docs.cameraui.com)
- **Coming from v1?** v2 is a fresh start — please read [Getting started](https://docs.cameraui.com/intro/getting-started)

Changes after this release will be documented here as usual.
