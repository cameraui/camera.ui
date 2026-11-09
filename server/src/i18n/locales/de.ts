import type { Messages } from '../index.js';

export default {
  plugins: {
    crashed_title: 'Plugin abgestürzt',
    crashed_body: '{plugin} ist unerwartet abgestürzt',
    recovered_title: 'Plugin wieder da',
    recovered_body: '{plugin} läuft nach einem Absturz wieder',
    not_started_title: 'Plugin nicht gestartet',
    needs_plugin_update: '{plugin} braucht ein Update für diese camera.ui-Version',
    needs_server_update: '{plugin} braucht eine neuere camera.ui-Version',
  },
  updates: {
    update_title: 'Update',
    beta_update_title: 'Beta-Update',
    server_available: 'camera.ui {version} ist verfügbar',
    server_available_unknown: 'Neues camera.ui-Update verfügbar',
    app_ready: 'camera.ui {version} kann installiert werden',
    plugin_title: 'Plugin-Update',
    plugin_available: 'Neue Plugin-Updates verfügbar',
    worker_title: 'Worker-Update',
    worker_available: 'Neue Worker-Updates verfügbar',
    failed_title: 'Update fehlgeschlagen',
    failed_body: 'Nicht aktualisiert: {names}.',
  },
  backup: {
    failed_title: 'Geplantes Backup gescheitert',
  },
  cloud: {
    reauth_title: 'Cloud-Anmeldung nötig',
    reauth_body: 'Von cameraui.com abgemeldet. Unter Einstellungen, Remote Zugriff neu verbinden.',
  },
  notifications: {
    flood_title: '{source} hat {count} Benachrichtigungen in einer Minute gesendet',
    flood_held: '{count} wurden zurückgehalten.',
    flood_held_one: 'Eine wurde zurückgehalten.',
  },
  remote: {
    down_title: 'Remote Zugriff ausgefallen',
    down_body: 'Seit 10 Minuten von außerhalb deines Netzwerks nicht erreichbar.',
    up_title: 'Remote Zugriff wieder da',
    up_body: 'Von außerhalb deines Netzwerks wieder erreichbar.',
  },
  workers: {
    online_title: 'Worker wieder online',
    online_body: '{worker} ist wieder online.',
    offline_title: 'Worker offline',
    lost_no_heartbeat: '{worker} antwortet nicht mehr.',
    lost_not_connected: '{worker} hat sich nach dem Start nicht verbunden.',
    lost_fenced: '{worker} bekommt keine Antwort vom Hauptserver.',
    lost_not_back: '{worker} kam nach einem Neustart nicht zurück.',
    lost_other: '{worker}: {reason}.',
    all_moved: 'Kameras und Plugins laufen bis dahin auf dem Hauptserver.',
    all_waiting: 'Kameras und Plugins warten auf ihn.',
    some_moved: 'Ein Teil läuft auf dem Hauptserver, der Rest wartet.',
  },
} satisfies Messages;
