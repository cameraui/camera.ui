# Changelog

All notable changes to this project will be documented in this file.

## [2.1.14]

### Added

- **Camview shows what a camera sees.** Next to the red glow, small icons name the active detections on each tile (motion, person, vehicle, face and the rest). A new button in Camview's quick menu turns glow and icons off.

- **Mode switching without a tray icon.** The desktop app's mode switch now also sits in the app menu under File, and starting the app a second time with `--switch-mode` opens the mode picker in the running instance. For Linux desktops that show no tray icon.

- **The detection trace zooms.** Mouse wheel, pinch or a double tap zoom into the frames, with the same feel as the live view, so a distant animal is readable. Works in playback and on the episode trace pictures too.

### Fixed

- **Snoozing detections no longer risks losing them for good.** After a snooze, disable or a manual frame-worker stop, the worker no longer followed the camera: a stream hiccup later and detections stayed dead until a server restart, with "Failed to reconcile sensor triggers" timeouts in the log. Quick snooze toggles could also tangle the stop and start of the detection process, and a detection process that never finished starting now retries instead of hanging.

- **Uninstalling a plugin from its own page returns to the plugin list.** Before, the page of the removed plugin stayed open.

- **Changing a camera through the API by its id works.** The request reported success but changed nothing, only the camera name worked.

- **The desktop app no longer pushes the timeline header under the top bar.** On the camera page the date row sat half hidden behind the window buttons.

- **The updates page notices the next update after an update.** Once something was updated, a later release of the same component hid behind the green check of the finished one until the next restart, the page claimed everything was up to date while Manage listed the new version.

- **A stream no longer comes up without video after a restart.** When a viewer connected in the same moment its camera stream was starting or reconnecting, it could end up on a feed that carried audio but never a single picture, and stayed that way until the next restart. Recordings were hit hardest: one resolution kept recording, the other silently stopped, and scrubbing the timeline reported "No recording". That timing hole is closed. As a safety net the recorder also reconnects on its own if a feed ever stays without video for half a minute, and says so in the log. Needs the NVR plugin 1.3.20.

- **Live audio reaches every viewer and stays up.** The second viewer of the same camera got no sound, and a running view lost its sound as soon as any other viewer joined or left. Audio now reaches everyone, survives viewers coming and going, and comes back on its own after a short outage instead of staying silent until the view was reopened.

- **Switching a camera's microphone on no longer needs a restart for sound.** The stream notices the new audio track within seconds and picks it up on its own. Sessions already running carry it from their next reconnect on.

- **A Tapo camera can no longer freeze its stream for good.** One malformed piece of data from the camera wedged the feed permanently: frozen picture, no recovery until a restart. The feed now reconnects on its own.

- **A parked car no longer stretches events.** The detector blinking on something that never moved, parked cars at dusk mostly, could hold an event open for a minute after the action was over, and an episode built from it got a long empty tail in its clip, sometimes cutting out the actual moment. Such a flicker now counts as scenery within seconds and its later blinks stay silent.

- **Line crossings fire on the drawn line.** The check watched the direction arrow instead, so a real crossing went unnoticed while something moving near the arrow could report one it never made.

- **The detection trace skips the quiet stretches.** A long event with barely any real activity, a camera OSD flickering at night say, filled the trace with frames where nothing was found. Only a few of those around each activity are kept now.

- **Episode cuts keep every stop and open where the story starts.** A short crossing of the yard could vanish from an episode entirely, and when people stood at the door while one of them was already in the yard, the episode opened with the yard instead of the door. Needs the NVR plugin 1.3.22.

- **Two views of the same camera no longer fight over the picture.** A live card next to the open dialog, or the same camera in two grids, made one of them stutter while they pulled the stream back and forth. The second view now opens its own stream.

## [2.1.13]

### Added

- **Every event keeps a detection trace.** Open it from an event on the recordings page: the frames the detector worked on, each with the objects, tracks and readings it found on it, pulled straight from the recording. The trace can be exported for a bug report. Frames need a recording of the event; without one the detection data still shows. Needs the NVR plugin 1.3.19.

- **Episodes explain themselves.** The trace icon on an episode shows every event that was a candidate and why it stayed or went, how the events were linked, both AI passes with the pictures and text the model got and what it answered, and the cut. The bundle download packs it with the clip for a bug report.

- **Episode cards play on hover.** Resting on an episode card plays its cut the way the player would: each camera in turn, with the camera name and time shown. Holding the card does the same on the phone.

- **camera.ui cards for Home Assistant dashboards.** A camera card that shows the snapshot tile from the home view or the full live player, an events strip, and a camview view as a widget with drag and drop. A click opens the camera.ui dialog with the timeline, right inside Home Assistant. The cards are served by your camera.ui server, so they always match it, and keep working from a local copy while the server is down. Card access is admins only by default; the integration settings can open it to all users, with an optional viewer token. They replace the integration's old built-in cards: the camera card switches over by itself, the old grid card is gone, rebuild those dashboards with the view card. Needs the Home Assistant integration 0.4.0.

- **Recordings in the Home Assistant media browser.** Events with a recording and a detection appear under camera.ui, by camera and day, with thumbnails; a click plays the clip right away while it is still being exported, and any entry can be sent to a TV or Chromecast with `media_player.play_media`. Needs the Home Assistant integration 0.4.0.

- **Camview cards can show the whole picture.** "Fit inside" joins keep, crop and stretch: the entire frame stays visible, with black bars where the card has a different shape.

- **Stream and connection timeouts per source.** Two new fields in the source settings: how many seconds without video the stream is given before it reconnects, and how many seconds the camera gets for each connection step. Raise the second one for cameras that wake up slowly. Plugin sources come with 60 seconds, since their plugin already watches the camera itself; direct camera sources keep the 5 second default.

### Changed

- **Streams default to Auto.** New cameras start with streaming mode Auto, which picks the transport the connection supports best. The small embedded players, the zone editor, shortcut previews, the floor plan hover and the event dialog, always use Auto now instead of forcing WebRTC; the camera view keeps following the camera's setting.

### Fixed

- **Home Assistant cards reconnect after a Home Assistant restart.** They kept retrying with the old signed address for up to 20 minutes and filled the Home Assistant log with failed logins. Needs the Home Assistant integration 0.4.0.

- **A camera on shaky WiFi no longer loses a whole minute over a few seconds of hiccup.** Every stage of the pipeline gave up after 5 seconds without video and reconnected on its own, so a short stall turned into a reconnect cascade with 20 seconds of nothing and a "disrupted" band on the timeline. Plugin streams and the analysis now wait out a stall; the recording gets a hole as long as the stall itself, nothing more. Needs the NVR plugin 1.3.19.

- **Adopted sensors survive plugin and server restarts.** camera.ui keeps the list of adopted sensors now; a plugin cannot lose it anymore. Entities adopted with the Home Assistant plugin 1.0.11 show up as discovered once more after this update, adopt them again. Needs the Home Assistant plugin 1.0.12.

- **Home Assistant notifications carry their picture now.** The image link only worked inside the LAN, so phones away from home showed text-only notifications. Needs the Home Assistant plugin 1.0.12 and integration 0.4.0.

- **Notifications through the Home Assistant plugin arrive once.** The plugin treated Home Assistant's catch-all service, the phone's own service and the phone's notify entity as three targets, so one push showed up three times on the same phone. Needs the Home Assistant plugin 1.0.12.

- **Renaming an entity in Home Assistant keeps the sensor.** Camera assignments, automations and history stay with it.

- **A sensor deleted at its source says so.** It stays in camera.ui, marked "removed in Home Assistant", until you delete it; nothing disappears on its own. The sensors page also tells "unavailable" from "not connected" now, and discovered sensors can be adopted in bulk.

- **A desktop worker reaches a server master without typing the port, and a failed pairing says why.** Without a port the worker knocked on the desktop port instead of 3443, then restarted five times and only showed "keeps exiting". A wrong address, port or code now goes straight back to the setup screen with the actual reason.

## [2.1.12]

### Changed

- **WebRTC uses one port for UDP and TCP.** Video ran over a random UDP port per connection, so a firewall or a Docker port mapping only ever let TCP through. Everything now goes through 2004 (UDP with TCP as fallback), existing installs are switched on the next start.

### Fixed

- **The streaming service finds camera.ui's own certificate again.** Freshly issued certificates were written next to the old location instead of into the `certs` folder, so go2rtc and the worker link could point at a file that was not there, which showed up right after removing your own certificate.

- **Streams, recordings and detections no longer slow each other down.** Every video stream in a process waited for its camera data on the same handful of worker threads, so with several cameras active they starved each other: HomeKit live views drifted behind real time and froze, on macOS the Home app dropped the stream, and browser live views, snapshots and detection could stall the same way. Each stream now reads on a thread of its own.

- **Choosing a server address no longer cuts off local WebRTC.** The selected addresses also limited the network sockets the streaming service listens on, so a browser that reaches the server another way (a proxy, another VLAN, IPv6) could only play in MSE mode. The addresses now only decide which of them the browser is offered; the old limit is removed on the next start.

- **Scrubbing close to live no longer hitches.** Dragging the timeline within the last minute rebuilt it once a second and could nudge the strip under your finger. It now stays put until you let go.

## [2.1.11]

### Added

- **Two-way audio can be switched off per source.** Next to "Mute audio" each source now has "Disable two-way audio". The microphone button disappears for that source and the talk channel is no longer offered to any client.

- **Sensors are found first, added by choice.** A plugin facing a large outside inventory, like Home Assistant with hundreds of entities, no longer imports everything it understands. The sensors page gets a Discovered section listing what was found with name, type and room; a click and a confirmation add a sensor, deleting it tells the plugin to stop importing it. Needs the matching plugin update.

- **Draw your home: the floor plan.** The new view under Manage maps levels, rooms, doors and stairs, with cameras, their view cones and sensors placed where they stand. Activity lights up the cones, hovering a camera shows its live picture, sensors show state and controls right on the plan, and a toggle hatches the ground no camera sees. What you draw becomes knowledge: walking times decide what belongs to one episode, unrelated things at the same time become separate episodes, titles name the places, and descriptions know how your rooms connect. Two cameras on the same room give the episode player a second angle to flip to, and the recordings filter gains a room select. The camera groups setting is gone, every camera takes part. Needs the camera-ui-nvr update.

- **Your own certificate, without a reverse proxy.** Settings → System takes a certificate and key and serves them for the names they cover, so the browser stops complaining on your domain; the apps keep verifying camera.ui's own certificate. All certificates now live in a `certs` folder instead of paths in the config file. Renewals apply as soon as the files change, only the streaming service asks for a quick restart.

- **Recordings show all cards, only events or only episodes.** The new switch at the top of the filter sidebar picks one of the three. Episodes have no detections of their own, so in that view only camera and time range narrow them down.

- **Detection settings can go back to their defaults.** Every section in the camera's detection settings (motion, object, audio, face, license plate, sensors) has a reset button next to its heading.

- **The zone settings say what they mean.** Info icons explain when something counts as inside, what the face options do, how "detections inside" is counted and which crossing direction a line watches.

### Fixed

- **The browser stops asking about the certificate after every restart.** When the internet provider handed out a new IPv6 address, the next start issued a new certificate and the exception stored in the browser was gone. Public addresses are no longer baked into the certificate or offered to the apps unless you pick them under Server addresses; the log now says when and why a certificate is issued.

- **The apps use the local address from Settings → Remote.** With the server in Docker the apps only tried the container's own addresses and then went out through the tunnel, the address entered under Network never got a try. It is now the first local candidate on every path the apps discover the server on.

- **Saving a source change reconnects everyone to the new source.** Open players, the recorder and the detection stayed on the old stream until they reconnected on their own. Now they are reconnected right away, a saved change is live within seconds. Needs the go2rtc build that ships with this release.

- **A new camera source can be renamed after picking a name that is already taken.** Typing an existing name locked the field, so the only way out was deleting the source. Saved sources keep their name locked, and a duplicate name now shows an error under the field.

- **A zoomed picture stays zoomed while you scrub.** Zooming into the live view or a recording and then moving the mouse to the timeline reset the zoom. The crop now holds until you double-click the picture or zoom back out.

- **Importing hundreds of sensors no longer floods the log with timeouts.** On a large Home Assistant setup the first sync fired every registration at once, and on a server still starting up most of them timed out before the next sync repaired it. Registrations are now paced, and a failed value update logs one quiet line.

- **Long outages stay visible on the timeline.** A camera offline for hours showed no disruption band near live; the band appeared and disappeared while scrolling. It now shows wherever it covers, including the running outage up to the live edge. Needs the matching NVR plugin update.

- **Detection events can no longer run forever.** A hiccup at the wrong moment could leave an event open for days: the timeline showed motion up to the live edge while every detector sat idle. A stuck event now clears itself within a minute, and leftovers from crashes are closed on restart.

- **The timeline no longer stalls and jumps while watching close behind live.** Playing a recording a minute or two behind the live edge froze the timeline for up to a minute while the clock kept counting, then it caught up in one jump, roughly every quarter hour.

- **Auto streaming mode actually falls back.** Auto only ever tried WebRTC, so on networks that block it the live view stayed black even though MSE worked fine. It now races both, skips WebRTC when the codec cannot travel through it and switches to MSE when a connection carries no video.

- **Auto streaming mode no longer keeps a second stream running.** Once WebRTC played, the MSE stream it raced against kept flowing in the background for the whole session, doubling the bandwidth of every live view on auto. It is now stopped the moment WebRTC wins. Needs the go2rtc build that ships with this release.

- **Episodes end when the action ends.** A parked car or a sitting cat kept an episode and its clip running minutes after everyone left. Story, player and push clip now stop with the last real activity. Needs the camera-ui-nvr update.

- **Deleting a camera takes its sensors with it.** Sensors a plugin provides for a camera (battery, doorbell or motion of an imported Eufy camera, for example) stayed behind greyed out in the sensors view after the camera was removed. They are deleted with the camera now; standalone sensors that were merely assigned to it only lose the assignment. Open sensor views also drop a deleted sensor right away instead of after a reload.

- **Snapshots are current again after the app was in the background.** The home view showed pictures that were hours old until the camera's refresh interval came around. It now fetches a fresh one right after reconnecting.

- **License plates are read again.** Every plate was thrown away as unreadable, whatever the camera saw; no read ever cleared the confidence set in the camera's detection settings. Needs the matching ML plugin update.

- **A stopped plugin no longer looks like an empty archive.** While the NVR plugin restarts or updates, recordings and events claimed there was nothing recorded. They now say the plugin is not running and fill themselves as soon as it answers again.

- **Picking a name for a face shows the names you already have.** The field opens the full list instead of waiting for you to type enough of a name; a new name still just gets typed in.

- **Shortcuts near the bottom edge are clickable again.** The player control bar swallowed every click in the bottom strip, even where it has no buttons, so a shortcut placed there could not be pressed. The bar now only catches clicks on its actual controls.

- **The update dot disappears after an update run.** It kept sitting on the Updates entry in the navigation although the page already said everything was up to date. A plugin that was not running while it got updated still reported its old version.

- **The Plugins page holds still during an update run.** Plugins are stopped while the run goes on, so start, stop, restart and "Update all" are disabled with a note instead of failing.

- **The update banner names the plugin**, not its package name.

- **Episode downloads no longer fail while the export is still being prepared.** An episode export assembles clips from several cameras before the file appears; the download gave up after 5 seconds and answered "not found", and a retry was rejected too. It now waits as long as the export is actually running.

- **Bare-metal installs no longer hang silently.** Two causes could leave the install waiting until it timed out: a leftover temp folder owned by another user, and a Node installed via snap, nvm or a custom prefix that the service could not find. Both are fixed, a failed start exits with a clear message, and the install output points at `journalctl` for logs.

- **Downloading a backup works again after an upgrade from v1.** The old theme setting made the export fail with "dark is not valid JSON".

- **Detection uses the second stream when hardware decoding is on.** Event pictures and full-resolution detection could stay on the low stream although the machine decodes in hardware, and the second stream stayed open while the camera was idle.

- **The recordings card on the camera page shows every activity on its own.** An event with several activity phases got one collapsed card there; now each phase gets its own card, like on the Recordings page. Every card also carries the time of the moment it pictures instead of the event's start.

- **The action button comes back as soon as you scroll up.** On Home, Recordings, Faces and the other lists the round button in the corner disappeared while scrolling and only returned at the very top. It now hides on the way down and shows again after a short scroll up, like a browser toolbar.

- **The reindex button stays out of the recordings sidebar.** It sat on top of the sidebar while that was open over the list.

## [2.1.10]

### Added

- **Playback picks the best available quality by itself.** The new playback source setting defaults to Auto: a hole in the high recording plays the next quality that has footage, with a badge, and switches back once high resumes. Needs the camera-ui-nvr update.

- **Outage bands match the footage.** Bands start where the recording actually ended and close where it resumed; reconnect blips under 15 seconds paint no band. An outage that rolls through phases (one stream lost, then all, then back in steps) shows each phase in its own color and names the length of the whole disruption instead of the offline part alone.

- **The timeline tells outages apart.** If only the high stream stops recording, a "recording without high" band shows instead of offline; offline means the camera records nothing.

- **Timeline data arrives with the first frame.** Opening playback from a push no longer shows video next to an empty timeline.

- **Player settings live in one place.** Streaming mode, streaming source and activity mode moved into camera settings → interface; picture-in-picture sits in the control bar.

- **Detection looks where the movement is.** Detection zooms into the moving regions at full resolution instead of squeezing the whole picture into the model, so a distant car or a cat at night arrives big enough to be recognized. The Metrics view counts the zooms.

- **Parked objects show on the live view.** Settled objects appear as dimmed boxes with a timer, without triggering events or notifications.

- **Confidence per object type.** Person, vehicle and animal each get their own confidence in the camera settings; automations can set each one.

- **Smart-camera events get framed pictures.** Cameras that report detections without coordinates (Reolink AI, ONVIF) get the moving region framed instead of the whole scene.

- **Audio detection needs no plugin settings anymore.** YAMNet listens for the standard sound list and follows the camera's audio confidence; its own settings are gone.

- **The search index rebuilds after a model change.** A reindex button in Recordings re-embeds old events in the background; search keeps working, current events are skipped. Needs the camera-ui-nvr update.

- **Search percentages tell the truth for every CLIP model.** Match scores are scaled per model, so a strong match reads high whatever model is selected and the score filter no longer hides good matches. Needs the camera-ui-nvr update.

- **Every update in one place.** The new Updates page lists server, plugins and workers with versions and release notes; "Update all" runs them in the right order.

- **The desktop app updates from anywhere.** A desktop-app server or worker shows up on the Updates page like any other install: one click downloads the app update, installs it and relaunches. Needs the desktop app update; older apps keep updating locally.

- **The beta channel reaches the desktop app.** The toggle in Settings → System switches the app's update feed too, and a beta server pulls its desktop workers onto the matching beta.

- **Settings → System manages, the Updates page updates.** The update buttons moved out; version display, restart, installing a specific version and the beta channel stay. Update notifications and the red dot lead to the Updates page on every client.

- **The app says how it is connected.** A short notice shows whether the connection went over the local network, the internet or the cloud, and again whenever the path changes.

- **The detection table can be copied.** A copy button puts both views for every camera on the clipboard as text. The benchmark dialog starts empty and got a select-all button.

- **Metrics tabs switch with a swipe.** Overview, Cameras and Storage swipe left and right on the phone.

- **The console follows new entries.** New log lines scroll into view as they arrive, unless you scrolled up.

### Fixed

- **Cancelling a selection puts you back where you were.** Leaving export or delete mode always jumped to live, even when you had scrubbed to a spot beforehand. It now returns to that spot, paused or playing as before; only a selection started from live goes back to live.

- **Export and delete selections open sane.** Starting a selection while zoomed all the way in could place the two handles on top of each other or swapped, sorting itself out only after touching one. The selection now always opens as a proper range, and near the live edge it grows backwards instead of reaching into the future.

- **The fine scrubbing hint stays out of the way.** It no longer floats below an empty spot when the date button is hidden, and it disappears while an export or delete selection is active.

- **Timeline scrubbing is smooth on the phone.** Dragging on iPhone moved in visible little steps; it now follows the finger.

- **Episodes respect the recordings filters.** Type, search, audio, attribute and sensor filters apply to episode cards too, and episodes follow a custom date range.

- **Detection boxes show up in the live view again.** Since 2.1.9 the overlay stayed empty on cameras without object zones, or drew from the wrong one of two detection plugins.

- **Event pictures frame the person, not a spot.** A misread face could zoom onto a shoulder; the picture now frames the whole person. A recognized face also removes its earlier "Unknown" crop.

- **The timeline never jumps on its own anymore.** Gaps and damaged spots used to snap the playhead back into a loop; it now only moves forward.

- **Playback starts where you let go.** No more replaying the seconds before the chosen position.

- **Event previews follow the action.** Hovering a card steps through the clip zoomed to the subject, with a clock for the shown frame; cards without playable footage say "No preview".

- **Fine scrubbing steps forward cleanly.** Slow dragging no longer flickers between neighboring frames.

- **The export selection shows its real duration.** Near the live edge a 10 minute range could read as an hour; the duration sits in its own label now.

- **Events refresh reliably after a reconnect.** Connection blips and view switches during an outage backfill what happened, episodes included.

- **Smart-camera detection gets real event pictures.** With the camera's own detection and a plugin assisting, events carry a proper subject picture in cards, pushes and AI descriptions.

- **PTZ autotracking can be switched on again.** Turning it on failed with a validation error.

- **A worker no longer claims to be connected when it is not.** Startup and later link failures show in the log, with the reason.

- **Metrics show what runs on a worker.** Cameras and plugins on a worker are listed again with the worker's name and its load; the benchmark names the machine and its hardware.

- **Back on WiFi means back on the local network.** The app returns to the local path within seconds instead of staying on the internet path until the next reconnect.

- **The automation run history is readable on the phone again.** Entries were squashed to a few pixels.

- **The notification list stays open.** Closing a notification's detail view no longer closes the list with it.

- **The same camera event no longer opens twice.** Tapping it again brings the open window to the front.

## [2.1.9]

### Added

- **Object zones can switch off recognition per area.** A zone can now count people and cars without identifying them: pick the area, drop "Recognize faces" and "Read plates", and nothing there is matched against your enrolled faces or read as a plate. Nothing from that area lands in your face list or on an event. Existing zones keep recognizing as before.

- **Alert zones decide which faces and plates notify you.** A zone can now name the people it pushes for, with entries for unknown faces and for anyone enrolled, and the same for license plates. Nothing selected keeps notifying for everyone, as before.

- **Camera notification settings are in the camera.** Push notifications, video in push, sounds, sensors, cooldown and speed sit in the camera settings next to the recording options now, translated and in one place. They start on the defaults, so have a look after the update.

- **Camview decides how the picture sits in the card.** A new button in rearrange mode offers three choices: keep the aspect ratio and live with the black bars, stretch the picture over the whole card, or crop it to fit. The choice is remembered per view and applies to live and playback alike.

- **Apps can reach the server by name on your network.** A new "Local address" under Network takes something like `https://camera.home.lan`, for a reverse proxy or just a nicer name. Apps try it first on the local network and fall back to the IP when it does not answer. Camera streams keep using the IP addresses next to it, so leave those alone.

- **The connection status says how it got there.** An info button next to it opens the details: which way is in use, which addresses were tried, how long each took and why they failed. Handy when the app connects over the internet although the server sits in the same network. One button copies the whole thing for a support message.

- **Resizing a card shows its size.** While dragging the handle, the card's pixel size sits in its top left corner.

### Changed

- **The camera metrics show what detection actually costs.** The Cameras tab has its own detection table now: decoding, scaling and tracking, and the way to the detection plugin and back, each per camera. A second view lists the time spent inside every detector, from motion and objects to faces, plates and CLIP, and names the model and the device it runs on. Numbers can be reset, and a benchmark loads the detector with test frames across the cameras you pick and reports detections per second.

- **Line crossing dropped the package label.** Lines that only watched for packages are removed on update.

- **Detection confidence is set on the camera only.** The ML plugins no longer carry their own confidence thresholds. Object, face and plate detection follow the value in the camera's detection settings, and a change applies immediately. Needs the matching plugin update.

- **The face match threshold is set per camera.** It used to sit in the NVR plugin and applied to every camera at once. It now sits in the camera's detection settings under the face confidence, so a camera that looks down the street can demand more certainty than the one at the door. If you had changed the value in the plugin, set it again here. Needs the camera-ui-nvr update.

- **License plates got a second setting.** Finding a plate in the picture and reading its text are two different jobs, so each has its own confidence now. Your current value stays on the reading side, where it always applied.

- **The AI no longer invents names and plates.** It read them off the picture, so a description could name a plate the plate recognition never confirmed. It now only uses what was actually recognized. Needs the camera-ui-nvr update.

- **Zones dropped the include/exclude mode.** Every zone now simply means "only what is inside here counts", which is what almost everyone used it for. Zones that were set to exclude are removed on update, so if you had one muting an area, check that camera. To keep an area out of detection entirely, use a privacy zone with detections dropped.

- **Rearranging camview is calmer.** Every card now carries a faint outline so you can see the slots, and the motion glow stays off while you are moving cards around.

- **Update notifications name the version and say when it is a beta.** They used to read "New camera.ui update available" and nothing else.

### Fixed

- **A working tunnel is no longer swapped for a throwaway one.** camera.ui checked its own public address by calling it from the server, which fails on setups where the machine cannot route back to itself, for example with split DNS or a router without hairpin NAT. A Cloudflare tunnel now reports its own connections instead, and a custom domain is only given up when it stops resolving publicly.

- **A named Cloudflare tunnel comes back on its own.** If the tunnel was briefly unreachable, camera.ui switched to a Quick Tunnel and stayed there until a restart. Only a custom domain was ever checked again. Both are now.

- **Connecting your own Cloudflare domain gets used once it is up.** After the browser login the tunnel started correctly, but camera.ui kept handing out the temporary Quick Tunnel address next to it and left both running. It now switches over as soon as the tunnel connects. Setting it up while a Quick Tunnel was running could also cut the browser login short before you had a chance to authorize.

- **Zones stay on the picture.** In a wide dialog the editor let you draw into the black next to the image, and those points ended up somewhere else than where you put them. The drawing area is now the picture itself. Zones drawn that way sit a little off, so give them a look.

- **Detection types are translated everywhere.** In the zone editor and the camera automations they showed up in English regardless of the language.

- **Drawing zones no longer gets stuck.** Deleting a zone while drawing it, or switching to another zone type in between, left the editor in a state where clicks did nothing, and it could remove a zone from the tab you switched to.

- **Camview keeps every camera in its template slot.** In a template that was not filled completely, the cameras slid up to the top and the lower rows refused to take a card, as if something invisible sat there.

- **Running a beta with the beta channel switched off no longer leaves you stuck.** The sidebar showed a dot for the newer beta, the system page offered nothing to install.

- **Cameras that report motion themselves no longer miss the first seconds.** With a Reolink or Eufy sensor the detection had to open the stream first and only saw the scene a second or three later, long enough for a car to be gone again. It now looks at the picture right away, as long as Hot mode is on for the source.

- **The picture in a push is no longer a narrow square for android.** It arrived cut to a square and shrank the notification, then jumped to full size as soon as the clip frames loaded. It now has the same shape as the frames. Needs the camera-ui-nvr plugin update.

## [2.1.8]

### Added

- **Privacy zones hide what you don't want to see.** Draw an area in the new Privacy tab and camera.ui covers it in black, in live view, in playback and in every picture it produces. Per zone you pick whether detections inside still count. The recording itself, RTSP and HomeKit still show the area.

- **The zone editor has one tab per purpose.** Motion, Objects, Alerts, Privacy and Line crossing, each with only the settings that kind needs. Existing zones are split up automatically.

- **The camera action in automations reaches more settings.** New: which streams it records, the object timeout, and for PTZ autotrack the tracked object types, the return to home and the minimum confidence. So "record just the main stream while the disk is full" is an automation now.

- **PTZ autotracking can be told how close and when to follow.** Two size limits stop the camera from chasing specks in the distance or someone standing right at the lens, where the picture says nothing anyway. An optional time window runs it only between two times, for example at night.

- **Automations can mute a single camera's notifications.** The notification action now applies to everyone, one camera or one user. Muting a camera stops its push while every other camera keeps notifying, and its events still show up in the app and on the timeline. Handy for silencing the street camera during the day and turning it back on at night.

### Changed

- **Object and alert types are picked in the zone editor now.** The Objects tab says what a camera detects and where, the Alerts tab what may notify you and from where. The lists in the camera settings and in the recording settings are gone, and a new zone covers the whole image. A camera without an alert zone notifies for everything it detects, so look at that tab if yours got chattier. Needs the camera-ui-nvr plugin update.

- **PTZ has its own controls on the camera, including presets.** Top right of the player there is now a bar with the home position, the positions saved on the camera and the switch for the pan/tilt/zoom controls. It appears on hover like the rest of the player controls and replaces the PTZ entries in the three dot menu.

- **NVR Recording settings save again when a dropdown was never touched.** An option list nobody had picked from counted as an invalid entry, and since the whole page is checked at once, every save button on it stopped working.

- **Camview only shows the slots you actually filled.** Pick the 10 slot layout for 8 cameras and you get 8 tiles instead of two dark boxes you cannot get rid of. The free space goes to the remaining cameras, and while assigning cameras the empty slots are back so you can still drop into them.

- **The navigation keeps its logo and your profile in place.** Only the list of entries in between scrolls now, so the way out is always where you left it. Same in edit mode, where reset and done stay at the bottom, and dragging an entry towards the top or bottom of a long list now scrolls along.

- **Sensors show the id they carry in the system they come from.** Two sensors with the same name are hard to tell apart, so the sensor list, the table and the edit dialog now show the source id underneath, for Home Assistant entities that is the entity id. The search finds sensors by it too.

### Fixed

- **The animated Android notification is readable now.** The frames ran at triple speed and shared their width with the still picture, so you could hardly tell what happened. Each frame stays up for a second and the animation uses the full width. Needs the Android app update.

- **Android notifications no longer cut the AI description off after one line.** The expanded notification ended the text in "…" whenever a picture was attached. It wraps onto several lines now, with the picture underneath. Needs the Android app update.

- **The PTZ camera stops rocking back and forth when someone stands still.** A standing person makes the detection box breathe, and the camera chased every twitch, up and down or left and right. It now only turns for an offset that holds across several frames, and the motion prediction fades out as the target slows down.

- **An object zone without a single selected label no longer blocks everything.** Clearing the labels used to drop every detection on the camera. The zone now applies to all types instead.

- **Cameras that report a detection without a position get through their zones.** A camera that only says "person" gives no location, so a zone set to "object fully inside" always dropped it. Those reports skip the zone check now.

- **Desktop app: the last entry in the settings navigation is fully reachable again.** The list stopped a bit short, so "System" at the bottom stayed half cut off. The filter sidebar in the recordings had the same problem.

- **Desktop app: the edit button in the navigation works again.** Clicking it, or the camera.ui name next to it, moved the window instead of opening the edit mode.

## [2.1.7]

### Added

- **Cameras can limit which object types get detected.** A new label picker in the camera's object detection settings drops unwanted types entirely, on the frame worker as well as for camera-reported objects. Empty means all.

- **Alert zones: detect everywhere, get notified only where it matters.** The zone editor has a third tab: draw a zone and pick the object types it should alert on. As long as a camera has an alert zone, it only notifies for those types and only from inside the zone, so the road keeps landing on the timeline while only the driveway rings your phone. A type that should notify anywhere gets a zone over the whole image. Detection and recording stay untouched. Needs the camera-ui-nvr plugin update.

- **Android pushes animate now.** With Video in Push on, the expanded notification cycles through frames of the clip, an episode push shows the camera switches of the whole story. Needs the Android app update.

### Changed

- **The camera metrics fall back to an average instead of showing nothing.** In Metrics, Cameras a quiet minute left most columns at "-" or 0. When the last minute had nothing to measure, the value now comes from the whole run since the camera started, marked with a ~.

- **A zone now only applies to the labels selected on it.** Labels you deselect pass that zone unfiltered instead of being blocked across the whole image. This fixes zones silently disabling other detections: an exclude zone no longer kills the remaining labels everywhere, package detection survives having zones, and camera-side motion sensors work again next to an object-only zone. To drop an object type completely, use the new label picker in the camera settings.

### Fixed

- **The app notices when push notifications stopped reaching this phone.** After reinstalling the app the phone could go quiet without saying so, and it only came back if you happened to open the notification settings and tap Sync. The app now checks with the server itself, repairs it in the background where it can, and otherwise shows a note with a Fix button on any screen. The settings also stop asking for a re-sync when everything is fine. Needs the camera-ui-nvr plugin update.

- **Updating the desktop app from inside the app works on Windows again.** The Update button in the system settings brought up the splash and then sat on "Starting…" forever, and the update only went through after closing and reopening camera.ui. It installs right away now.

- **Filtered recordings stay filtered when new events come in.** A live event no longer jumps to the top of the recordings list when it doesn't match the active filter.

## [2.1.6]

### Added

- **Pushes play video now.** Turn on "Video in Push" for a camera and its pushes carry a short clip of the recording instead of just a picture: the iPhone plays it right in the notification, the in-app notification opens with a player, Android keeps the picture and jumps into the clip on tap. An episode push plays the whole story, switching cameras exactly like the episode player; the episode settings pick when (off, following the camera settings, or always). The clip streams from your own server and stays end-to-end encrypted like the rest of the push, the cloud never sees a frame. Uses the lowest recorded quality, off by default. Needs the camera-ui-nvr plugin update and the app update.

- **The cameras page is there for every user.** Users get the camera list with a tap straight to each camera, on the phone as the fifth tab. Discovery, adding and camera settings stay with admins.

### Changed

- **The Adminpanel became Metrics.** Three tabs now: Overview keeps the system and process tables, Cameras shows what each camera is actually doing (decoded FPS, analyses per second, how often something is going on, inference time and the detections of the last minute), Storage holds the storage ring and the per-camera usage that used to live in the recordings settings. The recordings settings keep license and configuration only.

- **The logged-in users table moved to Settings, Users.** User management and the active sessions with their sign-out button now live in one place.

- **Workers say when they need an update.** An outdated worker shows the same dot on the Workers entry that the server and plugins already use.

- **One push instead of a push flood with Moments on.** A camera with AI Moments no longer stacks the detection alert, the name update, the picture update and the AI summary; the AI description itself is now the camera's push. The timing sits in the camera's GenAI tab: one push per moment (default), or one per event. If the AI does not answer in time, the normal detection push arrives instead. Doorbell and alarms stay instant, and cameras without Moments keep their pushes as before. Needs the camera-ui-nvr plugin update.

### Fixed

- **Silent push updates are truly silent now.** A push that replaces an earlier one, like a better picture or a recognized name, no longer wakes the iPhone screen or slides a banner over what you are doing. It updates the existing notification quietly.

## [2.1.5]

### Added

- **The navigation is yours to arrange.** A pencil at the top of the sidebar starts edit mode: drag pages into another order or another group, hide single settings pages with the eye, done with the check. The settings pages can join the sidebar as their own group, and every group can be made collapsible, both in Appearance. The layout is saved with your account, so it follows you to every browser and device, and a reset brings back the default.

- **The timeline filters by zone.** The filter menu in the camera view can now do what the recordings list below already did: mark areas on the camera picture, and the timeline and the detections tab only keep events with a detection in those areas.

- **A stretch of recording can be deleted from the timeline.** Admins tap the red trash button next to the timeline filter, drag the red range and confirm: the footage and the events in it are gone for good. Deletion is per minute, the minute being written stays untouched, and open apps drop the deleted range live. Needs the camera-ui-nvr plugin update.

- **Export and delete live on the timeline now.** Both sit as buttons next to the filter instead of hiding in the camera menu, on the phone too.

- **An object timeout for smart-camera detection.** Cameras whose own AI acts as the object sensor sometimes report a detection but never the end. The camera's detection settings take a timeout now (default 15s) after which such a detection is considered over; an end report from the camera still closes it immediately. Frame-based detection ignores the setting.

### Changed

- **The sidebar is grouped by purpose.** The daily pages sit on top, a labeled Manage group holds cameras, sensors, faces, automations, plugins and instances, and a collapsible System group keeps the diagnostic pages. Settings split into Personal and System sections, the phone menu follows the same grouping, and logging out no longer needs the expanded sidebar.

- **Editing shortcuts starts on the picture.** While shortcuts are shown, a pencil sits on the camera picture; tapping it starts moving and arranging them. The entry in the camera menu is gone.

### Fixed

- **Episodes show for every user.** Accounts without admin rights got endless loading instead of episode cards; the episode mosaics, fine scrubbing in the player and the episode export were affected the same way.

- **Shortcuts near the player controls can be used again.** A shortcut placed in the lower part of the picture was swallowed by the player controls: taps opened the controls instead, and while editing it could never be picked up. Shortcuts win now where they sit, the controls keep working everywhere else.

- **Exporting from the horizontal timeline works.** The export mode could be turned on there but never showed the range handles or the export button, so exporting from the phone's landscape view silently went nowhere. Both are there now, with draggable handles like on the vertical timeline.

- **Episode cards stay in place while scrolling.** Episodes older than the loaded events kept collecting at the end of the list, so scrolling the home moments or the recordings view showed the same episodes again and again. They now appear only once their place in the timeline is reached, and no longer pop up before the recordings have loaded.

- **The episode timeline keeps every camera bar inside the strip.** A very short pass right at the end of an episode could stick out past the right edge of the timeline.

- **Cameras using their own AI as the object sensor get their events back.** With a smart camera's detection (Reolink AI, ONVIF and similar) selected as the object sensor, 2.1.4 recorded only short motion events and no person or vehicle detections at all. Frame-based detection (Coral, OpenVino, ...) was not affected.

## [2.1.4]

### Added

- **Several cameras, one story.** When cameras see the same activity around the same time, the AI bundles the sightings into one episode with a title and a short story. Episodes show up on the home screen and in the recordings view as mosaic cards, and recordings that belong to one can open it. The episode player runs the whole sequence and switches between the cameras on its own, with a strip below to jump around. Also on the Apple TV app. Works when AI descriptions are enabled.

- **A zone can require the whole object.** Every detection zone has a mode now: object touches the zone, as before, or object fully inside the zone. The strict mode stops a car that only clips the edge of your driveway zone from triggering it.

- **A face can be ignored for good.** Unknown faces and whole groups in Faces have an ignore button now. The mail carrier you deleted every week stops coming back: new sightings of an ignored person are dropped right away. Ignored faces sit in their own list at the bottom of the page, restoring one lets the person show up again. Needs the camera-ui-nvr plugin update.

- **Camera sensors can drive automations.** Motion, object, face, license plate and classifier sensors from your cameras now show up in the sensor trigger and the sensor state condition. Face sensors carry the recognized names, license plate sensors the read plates and classifiers their labels, a bird classifier for example the species, so an automation can react to a specific person, car or result. Several at once are kept as a list, and matching ignores upper and lower case. The sensor history lists the recognized names, plates and labels with the time they appeared.

- **Home lists every moment of an event, the way the timeline does.** A visit that pauses and picks up again gives you one card per phase, each with its own picture and time. Before that, a whole event shared a single card.

- **The Apple TV app says what to update.** With a server or recording plugin older than the app needs, it shows a clear screen naming the update instead of empty lists and missing pictures.

- **Flip through a recording card's pictures in place.** When a moment has more than its scene picture, a recognized face or a read license plate, the card gets arrows to browse them right there, with the name or plate shown. The small tiles below mark the shown picture and jump straight to one. The moment cards on the home screen get the same arrows, kept lean: visible arrows say there is more, the details appear on hover.

- **Hold a card for the video preview on the phone.** The short preview that plays when hovering a card on desktop now plays on touch devices while the finger rests on the card; letting go stops it, a normal tap still opens the event. Works on the home screen moment cards and in the recordings view.

- **Own instructions for AI descriptions.** The recording plugin settings take free-text guidance for moment descriptions and episode stories separately, added on top of the built-in prompt. The AI settings are split into GenAI (provider), Moments and Episodes groups for that.

- **One AI summary push per event.** The AI description no longer replaces the notification after every moment; the texts collect and arrive as one summary once the event stays calm for a bit, or when it ends. The first push for a person and the name upgrade stay as fast as before, and tapping the summary opens the start of the event.

### Changed

- **A card shows the time of the picture on it.** A card could read 08:01 while its picture was taken at 08:28, somewhere in the middle of a long event. Clicking it now starts playback a few seconds before that moment, and it works the same way on the home screen, in the timeline and in the recordings view.

- **The detection rate setting is gone.** How often a camera is analysed follows what is happening in front of it, so a fixed number only got in the way. Your old value is dropped on update, nothing to set. The high quality snapshots switch is now called main stream analysis and keeps its setting.

- **Events follow the scene instead of a stopwatch.** An event ends when the scene is quiet, not after a fixed countdown. Someone who stops for a moment or is briefly hidden keeps their event instead of starting a second one, and a parked car no longer holds an event open or takes over its picture. When that car drives off, it counts as activity again.

- **Detection keeps hold of people in poor conditions.** Bad light, a partly hidden person or quick movement used to split one visit into several events with several notifications. It stays one visit now.

- **Grouped recordings show what else happened in the event.** The other moments sit as small previews on the card and are visible without hovering, and each preview opens its own moment. Repeats of the same picture are gone.

- **The recordings view remembers your grouping choice.** Grouped or split into moments is saved with your account now and follows you across devices. Split cards show their place in the event, like 2/3, and pointing at one highlights the other cards of the same event.

- **The rescan button in Faces moved up.** It sits at the top of the page now, like the view options button in Recordings, and on the phone it lives in the top bar.

- **Camera offline and online notifications open the camera log.** Tapping one now lands on the home screen with the console of that camera open, where the reason for the outage is usually visible. Needs the camera-ui-nvr plugin update.

### Fixed

- **The buttons over the recordings view hide while scrolling.** Scrolling through recordings kept them on screen before, covering the bottom row of cards. In selection mode they stay, as intended.

- **The picture on a push shows the moment the text describes.** Before, it could be one that appeared nowhere else. A push now waits a moment for the right picture instead of leaving without one, and when a better picture follows shortly after, it replaces the push silently instead of buzzing twice. Needs the camera-ui-nvr plugin update.

- **Plugin logos stay with their plugin.** After installing or removing a plugin, the remaining cards could show their neighbour's logo and a freshly installed plugin often fell back to the camera.ui logo until a reload.

- **Long camera names no longer break the layout.** On home screen cards, in the camera view on the phone and in camera lists, a long name wrapped onto a second line and pushed things around. It is shortened with three dots now, everywhere.

- **Saving files from the app works on your home network.** Downloading a recording or an event clip failed with "The operation failed with an error" on a direct connection to the server, because downloads did not use the certificate trust the rest of the app runs on. They do now. The server certificate also covers all server addresses including IPv6 from now on, renewed on its own at the next start.

- **Beta updates are announced everywhere, not just on the system page.** With beta updates switched on, the system page offered the new version while the badge in the sidebar and the notification stayed quiet. The setting now lives with the server instead of in the browser, so every place agrees, and on the mobile app it also picks the channel for app updates. It is per installation now, not per browser, so switch it on once again if you had it on.

- **A running event no longer disappears from the home screen.** Live events could vanish from the camera strip after a few seconds and only came back when the page was reloaded.

- **AI descriptions show up while the event is still open.** The description written for an event only appeared after a reload, so a card you were watching stayed blank. It now arrives on its own.

- **What you see live matches what you find later.** An event on screen and the same event after a reload could show different pictures, because live and stored events came from two different places. There is one source now.

- **Buttons in the settings of Python plugins work again.** Pressing one, "Reset to defaults" for example, failed with a "takes 1 positional argument but 3 were given" error in the log and did nothing. Affected every button in every Python plugin.

- **Downloads take the quality you are watching.** Exporting from the timeline or downloading from the event view always produced the highest quality, no matter which one was playing. Both now follow the picked quality, so a low quality clip stays small. The export dialog under Recordings keeps its own quality choice.

- **Camera shortcuts open at the time you are watching.** During playback, hovering a shortcut always showed the other camera from the moment playback had started, so after a few minutes the preview was minutes behind. It now picks up the position on screen, at the same speed, and opening the camera from the shortcut lands there too.

- **Removing the PiP source of a camera source sticks.** Clearing it reported a successful save, but the old source was still there after a reload, because the cleared field never made it into the request. Changing it to another source always worked.

- **Tapo cameras added over ONVIF have working snapshots.** They offer a third, low quality MJPEG stream that we took as the snapshot source, but the camera only serves two streams at a time, so that source could never connect while the video was running. Snapshots now come from a stream that is already open, which also spares the camera a connection. Cameras you already added are corrected on the next start.

- **Zone edits stick now.** The zone editor saved zones and lines in two requests at the same time, and they could overwrite each other, so a changed zone was back to its old shape the next time you opened the editor, even though the save reported success. Windows setups were hit hardest.

- **Two changes at the same time no longer cancel each other out.** Anything saved in parallel, from a phone and a browser at once, or by the server itself while you were editing, could quietly lose one of the two. It affected camera settings, shortcuts and camview layouts, backup and worker settings, share counters and notification history. Every change is written as one indivisible step now.

- **Plugins keep saving when their storage folder disappears.** If that folder is removed while camera.ui runs, a failed restore was one way to cause it, every setting a plugin tried to save failed until it was restarted, with "failed to persist" errors in the log. The folder is recreated on the next save now.

- **Restoring a backup works on Windows.** The restore replaced the database while the server was still using it, which Windows does not allow, so it stopped with a "resource busy" error. The uploaded backup is now put aside and applied during the restart that follows, when nothing is holding the files.

- **Windows: snapshots and streams work again when camera.ui is installed for all users.** In that setup the bundled ffmpeg sits under "C:\Program Files", and the space in that path cut the ffmpeg command in half, so snapshots and transcoded streams died with an exec error. Paths with spaces are handled now, nothing to change in your setup.

- **Opening an event no longer starts the video too late.** A passing car was often already halfway through the frame, and you had to rewind by hand to see it enter. Events now play from a few seconds before the motion that started them, so the beginning of the scene is on screen right away.

## [2.1.3]

**Home Assistant plugin users: update the plugin (1.0.4) and the camera.ui integration too.** The device-flood fix needs all three pieces: the plugin marks imported sensors on its next start, and the updated integration stops exporting them. After updating, reload the camera.ui integration in Home Assistant once so the stray devices disappear.

### Added

- **Events can be deleted from the Recordings page.** A new select mode behind the floating button lets you pick single events, several or all loaded ones and delete them. They disappear everywhere at once, camera events on Home, the timeline and the recordings list, on every open browser. Recorded video stays on disk until the normal cleanup removes it.

- **Bulk actions are single server calls now.** Selecting many cameras, sensors, plugins, automations or instances and deleting, disabling, hiding or updating them sends one request for the whole selection instead of one per item, and reports per item what worked.

### Fixed

- **Sensors imported from a smart home are never exported back to it.** Sensors now remember where they came from, and export bridges towards that system skip them no matter what. This stops the device flood some Home Assistant plugin users saw, where every import re-appeared in Home Assistant as a camera.ui device. Existing setups heal themselves: over MQTT the stray entities are cleaned up automatically on the next start, and for the camera.ui integration one reload in Home Assistant clears them.

- **A car driving past no longer wakes the parked car behind it.** The tracker can briefly hand a parked car's box to a passing vehicle; the parked car then counted as active again, stretched the running event and labelled it, and the next passer-by repeated the show. Worst with motion sensors that report on a timer, where events stayed open for minutes. Waking now requires the object to actually move, not just its box to jump.

## [2.1.2]

**New plugin: Home Assistant.** Imports your Home Assistant devices into camera.ui. Motion, occupancy, contacts, doorbells, smoke, leak and more become sensors you can assign to cameras as detection triggers. Locks, garage doors, alarm panels, switches, lights and sirens come in as controls and can be switched right from camera.ui. Home Assistant notify services (companion app, TTS, Telegram) can be added as notification targets, so camera.ui alerts reach every channel Home Assistant knows. Inside the Home Assistant add-on it connects without any configuration; everywhere else it takes your Home Assistant URL and an access token.

### Added

- **Plugins update with one click, or all at once.** Cards with an available update get a direct update button, no dialog, the card just shows a spinner and clicking it again opens the live install output. A new "Update all" button in the toolbar updates every outdated plugin and reports the result. The dialog with release notes and version picker is still there behind the menu.

- **Plugin installs run through a queue.** Installs, updates and uninstalls now queue up on the server and run two at a time, so updating many plugins no longer floods a small box. Every open browser sees which plugins are waiting and which are running, no matter who started them.

- **The Plugins page has a table view.** A button next to the plus switches between the cards and a compact table with status, version and the full action set per row, update, log and the familiar menu, handy for many plugins. The choice sticks, and both views now also show the package name under the display name.

- **Table page size is adjustable.** Settings > Appearance has a new "Table rows per page" option (5 to 100) that every table follows, plugins, sensors, admin panel and the rest. The choice is saved per browser.

- **Ten new sensor types.** Gas, carbon monoxide, carbon dioxide, heat, cold, vibration, tamper, problem, power and illuminance. Plugins can provide them, virtual ones can be created like any other sensor, and each comes with its own widget, icon and history. The binary ones can start camera events as sensor triggers, and such events stand out on the timeline with the full event bar.

- **The Sensors page catches up with Plugins.** A card view next to the table, switched via the floating buttons, and a select mode to hide, unhide or delete many sensors at once. Sensor icons also light up while a sensor is active, a glowing icon means motion running, door open, light on, doorbell ringing.

- **Detection sensors show their state in the sensor dialog.** Motion, object, audio, face, license plate and classifier sensors had no widget there; they now show a live state with what is currently detected, and audio includes the level.

- **Doorbells ring into the timeline out of the box.** A doorbell sensor that lands on a camera now becomes a detection trigger automatically, so a press starts an event without ticking it under Detection > Sensor Triggers first. Applies to newly added doorbells, existing setups keep their configuration.

- **Server updates restart on their own.** After updating from Settings > System the server now restarts right away instead of waiting for a click on Restart. The interface was not usable in between anyway, now it just comes back on the new version.

- **Plugins can be managed in bulk.** A select button next to the plus starts a selection in both views, then update, enable, disable or uninstall everything selected in one go, with a summary at the end.

- **The Apple TV app has a Sensors page.** Every sensor as a tile like in Apple's Home app, grouped by type, with live states straight from the server. A click switches lights, switches, sirens, locks and the garage; holding select opens a panel with brightness, volume or the alarm modes. New sensors appear on their own, removed ones disappear.

- **Events on the Apple TV line up with the web app.** Doorbell rings and sensor events now show in Recent Events and on the Events page with their own icons instead of going missing, there are new Doorbell and Sensors filters, and scrolling down reaches older days instead of stopping after yesterday.

- **CamView on the Apple TV keeps cameras unique.** Rotating a tile's camera or letting a wall fill itself could put the same camera on two tiles. That can't happen anymore, and saved layouts that already carry duplicates clean themselves up on open.

### Fixed

- **Doorbell rings and alarms stand out on the timeline.** A doorbell press, siren, security system or contact event without any visual detection used to render as a thin motion-style strip, invisible between regular motion marks. These now get the full event bar with icon and snapshot marker, like a person detection. Requires the camera-ui-nvr plugin update for such events to also pass the recordings confidence filter.

- **A doorbell press during a running motion event shows up immediately.** When someone walked up and rang, the motion event was already running and the ring stayed invisible until that event timed out, up to a minute later. The ring is now stamped into the running event right away, so the timeline and detections show the doorbell the moment it happens. Same for contact and other sensor triggers.

- **The update dot on Settings leads to the update.** With a pending server update, clicking Settings in the navbar used to land on the last visited settings page, usually Account. It now opens System directly, where the update button is.

- **A PiP source can be removed again.** Clearing the PiP source of a camera stream showed "Invalid input" and the settings refused to save; the only way out was picking another source. Clearing via the x or selecting none now validates and saves.

- **Detection sensors keep a history again.** Motion, object, face, license plate and audio sensors never recorded their triggers, so their history tab stayed empty no matter how often they fired; only virtual and plugin-state sensors had entries. Every detection sensor now logs when it triggered, when it cleared, and what it saw (person, a recognized name, a plate, an audio label).

- **A person staying in view is one event, not several.** Two things used to break this. Motion sensors that report on a timer, like many ONVIF cameras, made detection stop watching while someone was still in the picture. And a person standing still for a few seconds was treated like a parked car: the event lost its person label and picture, and empty follow-up events opened every half minute. Detection now keeps watching as long as it sees someone. Only vehicles, packages and resting animals count as parked; a person would have to stand frozen for ten minutes, which only a poster or statue manages.

- **Frame worker memory no longer climbs the longer the server runs.** The video scaler kept an internal buffer for every object size it ever cropped, so memory grew for as long as detections came in and only a restart freed it. It now reuses a small fixed set of buffers.

- **A wrongly learned parked spot no longer swallows new arrivals.** A misdetection could permanently teach the camera that something is parked at a spot, and an animal or person that later rested there was never reported. Only solidly detected objects count as parked now, and a spot whose object stays gone while the camera keeps looking is forgotten.

- **Event thumbnails show the person or car, not the empty scene.** The picture used to be the frame from the moment motion tripped, often before anything interesting was in view, so consecutive events all looked alike. The thumbnail now switches to the best shot of the detected object and is finalized when the event ends. Object thumbnails are also cropped tighter around the subject.

- **Event cards no longer get stuck on an outdated thumbnail.** With the app open while an event started, a card could keep the initial scene forever, sometimes with a face label over a picture that shows no face. Finished events now fetch their stored thumbnails once more.

## [2.1.1]

### Added

- **Push notifications are end-to-end encrypted.** Camera name, detection text and the snapshot are sealed on your server and only your phone can unlock them, not camera.ui cloud, not Google or Apple. Update the app, then press Resync in Settings, Notifications once per phone. Android notifications also get the Mute buttons the iPhone already had.

- **The timeline has an event filter.** The new filter button picks which event types show up, on the timeline and in its detections tab alike, and the choice sticks. In camview it also decides whether an opened camera shows only its own events or those of every camera in the view; with all cameras shown, clicking another camera's event jumps straight to it. Detection entries name their camera when more than one is listed.

### Fixed

- **The camview timeline drives one camera instead of all of them.** With a camera expanded, scrubbing and playback used to run every camera in the view at once, five and more hidden video sessions on a phone made scrubbing spin forever and end in a false "No recording". Expanded means: only that camera decodes, and the timeline shows its recordings and events; the event filter can bring the other cameras' events back into view.

- **Playback starts at the event, not behind it.** After picking an event the timeline already ran while the clip was still loading, and the video then skipped forward to catch up. The clock now starts with the first rendered frame.

- **Panning a zoomed camera no longer closes it.** Dragging with the left mouse button inside a zoomed, expanded camera counted as a click on release and shrank the view back into the grid.

- **Worker updates show what they are doing.** Pressing Update on the Workers page looked like nothing happened for a few seconds, and when the update failed, the reason hid in the status dot's tooltip. The button now spins immediately and a failure shows up as a message, also when the same attempt fails twice in a row.

- **A playback error no longer shows as "No recording".** When reading a recording actually fails, playback now retries quietly first and then says "Playback failed", instead of claiming a recording gap that isn't there. Requires the camera-ui-nvr plugin update.

- **Switching the detector for a camera really switches it.** Picking another plugin for Object, Motion or any other detection type left the previous one running. Only the plugin you picked feeds the camera now, and a detection plugin that is enabled but not picked stays out of the picture instead of analyzing frames for nothing.

- **Objects on wide cameras are detected again.** The picture was squeezed into the detector's square input, so on a dual lens camera at 8:3 a person turned into a sliver that no model recognized. The picture now keeps its proportions.

- **Slow detection hardware reports detections again.** On machines that only manage a detection every second or two, objects were confirmed too late or not at all, and a walking person outran the tracker entirely. Detection now adapts to the pace the hardware actually delivers: a person crossing the yard is reported after about two seconds instead of never.

- **Sensors reach a camera's detection right after start.** Cameras that are disabled or still offline made camera.ui wait for their frame worker on every single sensor a plugin registered. With a few cameras in that state, detection on the running ones only came alive a minute and a half after start.

- **Face recognition finds faces it used to miss.** The image section around a person was distorted before faces, classifiers and CLIP looked at it. Faces of standing people, squashed the most, went undetected entirely. The section now keeps its proportions.

- **Smart-camera detections get undistorted face and plate checks.** When a camera reports a detection without a picture position, the checks run on the whole picture, which was squeezed on wide cameras just like object detection used to be. Fixed the same way.

- **Parked cars no longer label every event.** Objects that camera.ui already knows are stationary could not open events, but still tagged each one with their label. A person walking past two parked cars created events labeled person and vehicle, and searching for vehicles surfaced them. Known-stationary objects now stay out of event labels entirely, their live bounding boxes remain visible.

## [2.1.0]

### Added

- **Workers update from the server.** A worker running an older version gets an update button on the Workers page, installs the server's version and restarts itself. Workers running inside the desktop app still update with that app, and workers older than this release need one manual update first.

- **The Sensors page hides camera sensors by default.** Cameras that bring their own sensors, motion, battery, PTZ and the like, used to bury the sensors you actually manage. The new settings button next to the search field brings them back into the list.

- **Incompatible plugins are stopped with a clear message instead of failing.** A plugin built for a different camera.ui plugin API no longer starts into cryptic errors: its card now says whether the plugin or camera.ui needs the update, and you get a notification. Installing a version that can't run on your server is refused with the reason, and the store marks plugins that need a newer camera.ui.

### Changed

- **The phone apps use your local network at home.** They went through the internet even while the phone was on the same WiFi as the server, which made live streams slower to start and added lag. The local connection works on its own now.

- **Updating a Python plugin keeps its packages.** Plugins like ONNX or CoreML re-downloaded their whole Python environment on every update, a few hundred MB each time. The environment carries over now and only packages that actually changed are installed. Uninstalling a plugin still removes everything, environment included.

- **The old sensor compatibility paths are gone.** 2.0.23 kept the pre-rework sensor API alive for one release so outdated plugins and the old Home Assistant integration kept partly working. That window is over: update your plugins and the Home Assistant integration if you haven't yet.

- **The plugin tab in the camera drawer stopped jumping around.** While something loaded, whole blocks were swapped for a spinner and the chips greyed out; now the section that is loading shows a small spinner next to its title and the chips stay usable. Sections without settings are gone instead of saying "No configuration available", the category row keeps its order with a Camera entry that is simply inactive for cameras without a camera plugin, and the plugin that is actually in use is marked right away instead of a moment later.

### Fixed

- **Python plugins start on Windows.** Every one of them hung at "Initializing process" for two minutes and was then killed. Node plugins made it, but needed twenty seconds instead of two.

- **A plugin that can't reach camera.ui says so.** It used to sit there with an empty log until the timeout ended it.

- **Dragging cameras on a PC with a touch screen behaves like a normal drag now.** The card showed the not-allowed cursor, then hung on the pointer after releasing the mouse and only dropped on a second click, which also opened that camera. Dragging cameras into a CamView had the same problem.

- **The worker decoder can be set back to "Same as server".** Saving it failed with "Validation failed", and the previous choice would have stayed in place even if it had saved.

- **No more timeout warning after changing frames per second or the decoder.** Both settings restart the frame worker, and the log complained 30 seconds later that the worker had not accepted them. It had, through the restart.

- **The camera drawer only shows the sensors of the plugin you picked.** Under Detection, Core and Accessories the sensor list held every sensor of that type on the camera, so a Reolink camera with CoreML enabled showed both plugins' object sensors no matter which plugin was selected, and the settings below could belong to the other plugin.

- **Virtual sensors assigned to a camera show up in its drawer.** A virtual sensor assigned on the Sensors page stayed invisible under Accessories, because that list was built from the camera's plugins and a virtual sensor has none.

- **Object assist no longer sticks to a detector that doesn't need it.** Assist adds labels to a camera or plugin that detects objects without video frames. Switching the object detector to one that works on frames left the old assist plugin assigned, invisible in the drawer and silently active again after switching back.

## [2.0.24]

### Changed

- **Sensors moved from the bottom bar to the menu.** On the phone, the Sensors page now sits at the top of the menu instead of taking a slot in the bottom bar.

### Fixed

- **Plugin settings in the camera drawer no longer get stuck on "No configuration available".** Switching between plugins, sensor types or sensors while a settings request was still running could permanently swallow the request for the new selection, the panel then stayed empty even though the plugin answered.

- **Toggling a plugin off and on for a camera no longer breaks or resets its settings.** The toggle deleted the plugin's stored per-camera settings and could leave that plugin's settings panel permanently empty until the plugin was restarted. Settings now survive the toggle, values included.

- **Clearing a plugin or sensor setting returns it to its default.** A cleared value used to become undefined until the next restart; motion detectors reading such a value then failed on every frame and flooded the log with "Motion detection error". Cleared values now fall back to their default everywhere.

- **Camera-bound sensors find their camera again.** Toggling a plugin off for a camera dropped its sensors' camera assignment for good: they showed "Not assigned to a camera" on the Sensors page and their settings vanished from the camera drawer. The assignment is restored when the plugin registers the sensor again, so existing installs heal on the next restart.

## [2.0.23]

**This release rebuilds the sensor system. A few things need your attention after updating:**

- **Update your plugins.** Plugins built against the old sensor system can't provide sensors anymore; their sensors stay unavailable until the plugin is updated, and the log tells you which plugin is affected. Updates for all official plugins are available.
- **Automations that use sensors were disabled** and are marked on the Automations page. Open each one, pick the sensor again and re-enable it.
- **Sensor cascade triggers** in the camera detection settings and **sensor shortcuts** on camera views need to be set up again.
- **Home Assistant users:** update the camera.ui integration so sensors show up correctly. Over MQTT, sensors re-appear as their own devices with new entity ids, so Home Assistant automations pointing at them need to be re-pointed.

Virtual sensors carry over automatically.

**A native Apple TV app is coming.** It is in review at Apple right now. As soon as it passes, the TestFlight beta starts, the links land in #apple-tv on Discord.

### Added

- **Play on TV.** A cast button on the camera player lists the Apple TVs running the camera.ui TV app, one tap opens that camera there, live or at the current playback position. Works from any server the TV has been signed into, even if the TV currently shows another one. Admin accounts only.

- **Notifications show their event image.** The notification list gets a small preview per entry, and opening one shows the picture above the text, so you can tell at a glance whether it's worth a look. Tapping the picture or the text jumps straight to the event, same as the Go to message button. Images now stay available for as long as the notification is in the list.

- **Cameras on a worker can use their own GPU for decoding.** A second decoder selection in the camera's frame worker settings applies while the camera decodes on its assigned worker, while the first one keeps applying on the server, for example when the worker is offline and decoding falls back. On Same as server the worker uses the server's choice, as before.

- **Sensors are independent of cameras now.** The new Sensors page lists every sensor, whether it comes from a plugin or was created there as a virtual sensor. A sensor can be assigned to any number of cameras, renamed, and an Expose toggle per sensor decides what MQTT, HomeKit and Home Assistant get to see. Sensors keep their identity across restarts and plugin updates, so exports, automations and history stay stable from here on.

### Fixed

- **Restart and similar buttons work behind Home Assistant and other proxies.** Pressing Restart through the Home Assistant panel failed with "Unsupported Media Type" because some proxies tag empty requests with a content type the server rejected. The server now accepts them.

- **The Home Assistant integration survives reloads without a camera.ui restart.** With camera.ui in Docker, the network announcement also carried Docker's internal bridge addresses. Home Assistant could store one of those, and the next reload of the integration or restart of Home Assistant then failed to connect until camera.ui was restarted. Announcements now only carry real network addresses.

- **Dragging cameras with a mouse works on touch screen PCs.** On a computer with both a touch screen and a mouse, reordering cameras on the home page and building a CamView grid only worked by touch, the mouse could not grab the cards. Mouse and touch now both work on such devices.

- **Connecting a server whose account uses two-factor authentication works again.** The code step when adding such a server, or when finishing a pending 2FA challenge later, always failed even with the right code.

- **Plugin and sensor settings no longer come up empty while a plugin is starting.** Opening a camera's plugin settings right after enabling a sensor could show "No configuration available" because the plugin was still loading its models and missed the request. The panel now retries for a bit and fills in once the plugin answers.

- **A plugin that hangs while starting can't wedge itself in anymore.** A plugin stuck at "Initializing process" now gets killed after two minutes with a clear error instead of sitting in that state forever. On Windows, stopping a plugin now also ends its whole process tree; a hidden leftover process used to keep files locked and made plugin updates fail with "EPERM: operation not permitted".

- **Number fields accept decimals on the phone.** Editing a value like 0.3 in plugin or sensor settings was impossible on mobile, the keyboard came up without a decimal separator and typing one was ignored. Number fields also show step arrows now, so stepped values can be set by tapping.

- **The iOS app no longer crashes after muting from a notification.** Using Mute 1 hour or Mute 8 hours on a push notification, or looking at one right after, could kill the app.

## [2.0.22]

### Added

- **Pick which GPU decodes each camera.** A new decoder option in the camera's frame worker settings chooses the hardware (CUDA, VAAPI, Quick Sync, ...) and the exact device, so machines with more than one GPU can split duties, for example decoding on the integrated GPU while the NVIDIA card runs detection. Auto keeps today's behavior, and a selection that doesn't work on that machine falls back to it. The nvidia Docker image now ships the Intel/AMD video drivers, so both GPUs work in one container.

- **H.265 cameras now play on devices that can't decode H.265.** Live view and playback switch to the next stream the device can play instead of loading forever or showing "No recording" although recordings exist. A small icon on the player tells you when you are watching a lower quality stream because of this, and if no stream is playable at all you get a clear message.

- **The app reopens your last server.** Starting the iOS or Android app connects straight to the server you used last instead of stopping at the server list. Switch server in the menu still brings the list back, and a tapped notification for another server always wins.

- **Settings open as a list on the phone.** Tapping Settings in the menu now slides to a list of all settings sections, just like the menu itself, and each section slides in from there. The back button top left returns to the list; the sidebar overlay on small screens is gone.

- **Pick your start page.** A new option under Appearance chooses which page opens after login and when visiting the address directly, for example CamView or Recordings instead of Home. Everyone picks from the pages their role can access, per device.

- **Webhook automations are easier to call.** The webhook trigger now also accepts its secret as a plain X-Webhook-Secret header, so tools that can't compute an HMAC signature can fire automations too. Signed requests keep working as before.

- **Workers can be renamed and show their version.** A pencil button on the Workers page gives a worker a friendlier name without touching its config file. A new version column shows each worker's version; on an outdated worker it shows both the worker's and the server's version so you see what to update to. In the desktop app, worker mode now also asks for a name during setup.

- **Read-only fields have a copy button.** Values you can't edit, like generated addresses or tokens in plugin and connection forms, can now be copied with one tap instead of selecting the text by hand.

### Fixed

- **Plugins on a worker get camera streams again.** A plugin running on a worker could fail to open the camera stream because the request to the main server lost its stream credentials, for example HomeKit answered with "no response" and HKSV only showed snapshots. Streams from workers now authenticate properly.

- **Update indicators disappear without a page reload.** The update dot in the navbar stayed on after installing the plugin or server update, and the System page kept offering an update the server already had. Both now clear on their own.

- **Toggling a camera off and on in a plugin's camera list keeps its sensors working.** Turning a camera off there released its sensors, but turning it back on didn't bring them back, so motion, object and the rest stayed off until you re-enabled each one in the camera settings. Toggling on now activates the plugin's sensors again, except ones already owned by another plugin.

- **Object assist works on its own.** On cameras that detect by themselves it used to run only when face or plate recognition was assigned. Now it always gives those detections real bounding boxes, so zones apply properly and events show boxes, with or without recognition on top.

## [2.0.21]

**The Android app is in review at Google.** As soon as it passes, the closed beta starts. More on that on Discord once the review is through.

### Added

- **The Android app has picture-in-picture.** The PiP button shrinks the live stream into a small floating window that stays on top while you use other apps. On the single camera view the stream also pops out on its own when you swipe home, as long as it is the only one playing.

- **A Permissions page in the settings.** It shows whether this device lets camera.ui use the microphone, location and notifications, asks for missing ones and jumps into the system settings when something is blocked. The notification settings point there when notifications are turned off at the system level.

### Fixed

- **The Android app connects reliably.** It could search for the server forever, both on the server picker and at login, while iOS connected fine. One dead address could cancel the whole search and take the reachable ones down with it; every address now gets its chance, so picking a server and logging in settle in a second or two.

- **Two-way audio works in the Android app.** Pressing the talk button always came back with permission denied, even with the microphone allowed in the app settings.

- **Push notifications arrive on new Android phones.** The app never asked Android for permission to show them, so on Android 13 and newer nothing was delivered until you enabled it by hand in the system settings. Enabling push for a device now asks first.

- **Accounts with the user role load snapshots and recordings again.** Camera images stopped refreshing and recordings, events and playback failed for members without admin rights. Sensor switches they cannot use now show as read-only instead of doing nothing.

- **A loading stream no longer shows a gray play button on Android.** The picture stays black until the first frame arrives.

## [2.0.20]

### Added

- **Face and plate recognition now works on cameras that detect by themselves.** Cameras like Reolink report that they saw a person, but not where in the picture, so the recognition had to search the whole scene and rarely found anything. Pick a second detection plugin as object assist under Object in the camera's plugins, it finds the person or car first and the recognition gets a proper close-up.

- **Audio detection has a confidence threshold.** Sounds the detector is unsure about no longer count, so false gunshot and glass break alarms get rarer. It sits above the volume threshold under Audio in the camera's detection settings and starts at 0.7.

- **Automations can turn notifications on and off.** A new "Notifications On/Off" action mutes or unmutes push for everyone or a single user, so any automation can pause the pings when you don't want them and turn them back on later. Critical alerts still come through, and muted notifications still show up in the in-app history.

### Fixed

- **The close button on a recording closes it on the first click.** Pressing X moved the dialog away instead, sometimes three times in a row before it gave in. Dragging a dialog by its header still works.

- **The page behind a dialog no longer jumps when it closes.** Closing a recording scrolled the list and the header out of place for a moment.

- **Expanding a camera in CamView no longer restarts the recording.** It jumped back and began a fresh playback every time, and after the first expand the small cards stopped playing altogether until expanded again. Playback now follows the card and keeps running, the way live already did.

- **A long readme no longer stretches the plugin page.** Readme and changelog keep a readable height and scroll on their own, and a button in their corner opens them to full height.

- **Clicking a detection jumps to it and plays.** Nothing happened before, so you had to scroll the timeline until you found the spot yourself. Dragging the list to scroll still works.

- **Capture snapshot works during playback.** The button did nothing while a recording was playing and only worked on the live picture. The file is named after the moment on screen, not the time you clicked.

- **A parked object no longer starts producing events again after a while.** It went quiet, then hours later the same picture came back as a new event, over and over. It also settles faster now, usually after the first event. A car that only stops briefly still counts as an event.

- **Your own domain is no longer dropped for a temporary tunnel it can't get back from.** The address was checked once at startup, before the server was ready to answer, so it looked unreachable and camera.ui switched to a Cloudflare tunnel until the next restart, even though Test connection said the address was fine. It now checks after the server is up and switches back on its own once your domain answers.

- **The app no longer briefly reconnects when you return to it.** On phones, opening the app after it sat in the background could show it reconnecting and reload everything, a moment after it had already come back on its own. It now recognizes the connection is still alive and keeps it running.

- **Faster recovery after the server restarts.** A server restart or short outage left the app retrying for several seconds before it reconnected. It now looks for the server again right away, so live, playback and the timeline come back in a second or two.

## [2.0.19]

### Fixed

- **Detections from cameras with built-in smart detection show a picture again.** On cameras that detect people themselves with a face or classifier plugin assigned, the event kept the image taken at the start of the motion, usually before anyone was in frame, and the detection itself had none at all. A new image is now taken the moment the camera reports the person.

- **Faces from those cameras appear on the Faces page.** The recording was tagged as containing a face, but the person never showed up under unknown faces.

- **Event images are no longer capped by the snapshot source.** Picking a low-resolution stream as a camera's snapshot source also shrank every event image. Event images now come from the camera's own picture where it offers one, the dashboard and auto-refresh keep using the source you picked.

- **A failed start says what went wrong.** The desktop app showed only "camera.ui keeps exiting" after five attempts. It now names the actual error, and a problem that restarting cannot fix (like a damaged database) is reported right away instead of after five tries.

- **The recording timeline follows every time you pick.** Choosing a time in the date picker worked once. Every jump after that moved the playback but left the timeline sitting where it was, so it looked like nothing happened.

- **A failed backup restore tells you why.** The reason vanished with a short toast and was never written to the log, so a restore that dropped you back to the setup screen left nothing to go on. The message now stays on screen and lands in the log.

## [2.0.18]

### Fixed

- **The same stationary object no longer shows up as a new event every few minutes.** Short motion events restarted the stationary detection each time, so a parked car or other unmoved object kept producing identical-looking events. It now settles across events and goes quiet after the first one or two.

- **Removing a camera source now asks for confirmation.** The remove button sits right next to the expand arrow in the source list, a stray tap could silently drop a source and the next save made that permanent.

- **HomeKit live streams failed.** The negotiated stream bitrate clashed with the encoder's default and the stream ended right after starting. Stopping a stream also logged a misleading pipeline error, shutdowns are quiet now.

- **"cameraui logs" works from any user account.** On bare-metal installs the service runs as its own user, but commands like logs, status and update-server looked in the calling user's home and failed with "Log file does not exist". They now use the location recorded at install time, -H still overrides.

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
