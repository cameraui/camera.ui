import '@/plugins/logger.js';

import '@/assets/css/tailwind.css';

import '@/assets/css/extras.css';
import '@/assets/css/inter.css';
import '@/assets/css/main.css';
import '@/assets/css/markdown.css';
import '@/assets/css/overrides.css';
import '@/assets/css/theme.css';
import '@/assets/css/transitions.css';
import '@/assets/css/utils.css';

import { Logger } from '@camera.ui/logger';
import { createApp } from 'vue';

import { bridgeConnectionToQueryOnline, installApiErrorHandling } from '@/api/index.js';
import AppRoot from '@/App.vue';
import { bootApp, consumeAuthParam, isCapacitor } from '@/connection/index.js';
import { instanceOverride } from '@/connection/instance.js';
import { registerEcosystemPlugins } from '@/plugins/cameraui.js';
import { registerCapacitor } from '@/plugins/capacitor/index.js';
import { registerUiPlugins } from '@/plugins/index.js';
import Router from '@/router/index.js';

window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('cui-chunk-reload')) return;
  sessionStorage.setItem('cui-chunk-reload', '1');
  window.location.reload();
});

const { connection } = await bootApp({
  logger: new Logger('Connection'),
});

installApiErrorHandling();

const app = createApp(AppRoot);

const vueLog = new Logger('Vue');
app.config.errorHandler = (err, _instance, info) => vueLog.error(`[${info}]`, err);

registerUiPlugins(app);
bridgeConnectionToQueryOnline(connection);
registerEcosystemPlugins(app, connection);

app.use(Router);

useInstanceStore().restoreActiveOverride();

const seeded = await consumeAuthParam(connection, {
  onUser: (user) => useAuthStore().setUserFromLogin(user),
  onRedirectInfo: (info) => {
    useInstanceStore().redirectInfo = info;
  },
  onReset: () => {
    useInstanceStore().activeId = null;
    instanceOverride.value = null;
  },
});

app.mount('#app');

if (isCapacitor) {
  registerCapacitor();
}

if (!seeded) {
  connection.boot('default');
}
