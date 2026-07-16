import { sleep } from '@camera.ui/common/utils';
import { startViewTransition } from 'vue-view-transitions';
import CctvIcon from '~icons/bx/cctv';
import InstancesIcon from '~icons/bx/server';
import CctvIconActive from '~icons/bxs/cctv';
import InstancesIconActive from '~icons/bxs/server';
import SettingsBackupIcon from '~icons/clarity/backup-restore-line';
import SettingsBackupIconActive from '~icons/clarity/backup-restore-solid';
import SettingsAppearanceIcon from '~icons/ic/outline-design-services';
import SettingsAppearanceIconActive from '~icons/ic/round-design-services';
import WorkersIcon from '~icons/icon-park-outline/circular-connection';
import LogsIcon from '~icons/icon-park-outline/log';
import TerminalIcon from '~icons/icon-park-outline/terminal';
import WorkersIconActive from '~icons/icon-park-solid/circular-connection';
import LogsIconActive from '~icons/icon-park-solid/log';
import TerminalIconActive from '~icons/icon-park-solid/terminal';
import AutomationsIconActive from '~icons/material-symbols/automation';
import AutomationsIcon from '~icons/material-symbols/automation-outline';
import SettingsRemoteIconActive from '~icons/material-symbols/cloud';
import SettingsRemoteIcon from '~icons/material-symbols/cloud-outline';
import HomeIcon from '~icons/material-symbols/home-outline-rounded';
import HomeIconActive from '~icons/material-symbols/home-rounded';
import SettingsAccountIconActive from '~icons/mdi/account-circle';
import SettingsAccountIcon from '~icons/mdi/account-circle-outline';
import SettingsNotificationsIconActive from '~icons/mdi/bell';
import SettingsNotificationsIcon from '~icons/mdi/bell-outline';
import ConsoleIconActive from '~icons/mdi/bug';
import ConsoleIcon from '~icons/mdi/bug-outline';
import SettingsIconActive from '~icons/mdi/cog';
import SettingsIcon from '~icons/mdi/cog-outline';
import FacesIcon from '~icons/mdi/face-recognition';
import ConfigIconActive from '~icons/mdi/note-edit';
import ConfigIcon from '~icons/mdi/note-edit-outline';
import SettingsMqttIcon from '~icons/mdi/transit-connection-variant';
import SettingsUsersIconActive from '~icons/mdi/users';
import SettingsUsersIcon from '~icons/mdi/users-outline';
import GridIconActive from '~icons/mingcute/grid-fill';
import GridIcon from '~icons/mingcute/grid-line';
import RecordingsIconActive from '~icons/mingcute/photo-album-fill';
import RecordingsIcon from '~icons/mingcute/photo-album-line';
import SettingsSystemIconActive from '~icons/mingcute/settings-2-fill';
import SettingsSystemIcon from '~icons/mingcute/settings-2-line';
import MenuIcon from '~icons/proicons/grid-dots';
import AdminpanelIconActive from '~icons/solar/graph-bold';
import AdminpanelIcon from '~icons/solar/graph-outline';
import PluginsIcon from '~icons/tabler/puzzle';
import PluginsIconActive from '~icons/tabler/puzzle-filled';

import { isCapacitor, isInCloudSession, useConnection } from '@/connection/index.js';
import Home from '@/views/Home.vue';
import Login from '@/views/Login.vue';

const NotFound = () => import('@/views/404.vue');
const FirstSteps = () => import('@/views/FirstSteps.vue');
const Cameras = () => import('@/views/Cameras.vue');
const Camera = () => import('@/views/Camera.vue');
const Camview = () => import('@/views/Camview.vue');
const Recordings = () => import('@/views/Recordings.vue');
const Faces = () => import('@/views/Faces.vue');
const Plugins = () => import('@/views/Plugins.vue');
const Plugin = () => import('@/views/Plugin.vue');
const Adminpanel = () => import('@/views/Adminpanel.vue');
const Config = () => import('@/views/Config.vue');
const Logs = () => import('@/views/Logs.vue');
const Terminal = () => import('@/views/Terminal.vue');
const Automations = () => import('@/views/Automations.vue');
const Automation = () => import('@/views/Automation.vue');
const Instances = () => import('@/views/Instances.vue');
const Workers = () => import('@/views/Workers.vue');
const Settings = () => import('@/views/Settings.vue');
const Menu = () => import('@/views/Menu.vue');
const About = () => import('@/views/About.vue');
const Console = () => import('@/views/Console.vue');

const SettingsAccount = () => import('@/subviews/SettingsAccount.vue');
const SettingsAppearance = () => import('@/subviews/SettingsAppearance.vue');
const SettingsBackup = () => import('@/subviews/SettingsBackup.vue');
const SettingsRecordings = () => import('@/subviews/SettingsRecordings.vue');
const SettingsRemote = () => import('@/subviews/SettingsRemote.vue');
const SettingsMqtt = () => import('@/subviews/SettingsMqtt.vue');
const SettingsSystem = () => import('@/subviews/SettingsSystem.vue');
const SettingsUsers = () => import('@/subviews/SettingsUsers.vue');
const SettingsNotifications = () => import('@/subviews/SettingsNotifications.vue');

const { smBreakpoint } = useSharedCuiBreakpoint();

export const routes: RouteRecordRaw[] = [
  {
    name: 'NotFound',
    path: '/:pathMatch(.*)*',
    component: NotFound,
    meta: {
      name: 'notfound',
      auth: {
        requiresAuth: false,
        role: 'none',
      },
    },
  },
  {
    name: 'Login',
    path: '/login',
    alias: '/',
    component: Login,
    meta: {
      name: 'login',
      auth: {
        requiresAuth: false,
        role: 'none',
      },
      ui: {
        background: computed(() => {
          return smBreakpoint.value ? 'var(--card-background)' : undefined;
        }),
      },
    },
  },
  {
    name: 'FirstSteps',
    path: '/first-steps',
    component: FirstSteps,
    meta: {
      name: 'firststeps',
      auth: {
        requiresAuth: true,
        role: 'user',
      },
    },
  },
  {
    name: 'Home',
    path: '/home',
    component: Home,
    meta: {
      name: 'home',
      auth: {
        requiresAuth: true,
        role: 'user',
      },
      ui: {
        containerSettings: {
          showTitle: true,
          padding: true,
          allowOverflowX: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'top',
        icon: {
          default: HomeIcon,
          active: HomeIconActive,
        },
      },
      bottombar: {
        icon: {
          default: HomeIcon,
          active: HomeIconActive,
        },
      },
    },
  },
  {
    name: 'Cameras',
    path: '/cameras',
    component: Cameras,
    meta: {
      name: 'cameras',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        containerSettings: {
          showTitle: true,
          padding: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'top',
        icon: {
          default: CctvIcon,
          active: CctvIconActive,
        },
      },
      bottombar: {
        icon: {
          default: CctvIcon,
          active: CctvIconActive,
        },
      },
    },
  },
  {
    name: 'Camera',
    path: '/cameras/:cameraname',
    component: Camera,
    meta: {
      name: 'camera',
      auth: {
        requiresAuth: true,
        role: 'user',
      },
      ui: {
        containerSettings: {
          // padding: computed<boolean>(() => !mdBreakpoint.value),
          // disableScroll: computed<boolean>(() => smBreakpoint.value),
          disableScroll: true,
          ignoreSafeAreaBottom: computed(() => smBreakpoint.value),
          noExtraPadding: computed(() => smBreakpoint.value),
        },
        showNavbar: true,
        showTopbar: computed(() => !smBreakpoint.value),
        showBottombar: computed(() => !smBreakpoint.value),
        showRouterLoading: true,
      },
    },
  },
  {
    name: 'Camview',
    path: '/camview',
    component: Camview,
    meta: {
      name: 'camview',
      auth: {
        requiresAuth: true,
        role: 'user',
      },
      ui: {
        containerSettings: {
          disableScroll: true,
        },
        background: '#000000',
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'top',
        icon: {
          default: GridIcon,
          active: GridIconActive,
        },
      },
      bottombar: {
        icon: {
          default: GridIcon,
          active: GridIconActive,
        },
      },
    },
  },
  {
    name: 'Recordings',
    path: '/recordings',
    component: Recordings,
    meta: {
      name: 'recordings',
      auth: {
        requiresAuth: true,
        role: 'user',
      },
      ui: {
        containerSettings: {
          showTitle: false,
          padding: false,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'top',
        icon: {
          default: RecordingsIcon,
          active: RecordingsIconActive,
        },
      },
      bottombar: {
        icon: {
          default: RecordingsIcon,
          active: RecordingsIconActive,
        },
      },
    },
  },
  {
    name: 'About',
    path: '/about',
    component: About,
    meta: {
      name: 'about',
      auth: {
        requiresAuth: true,
        role: 'user',
      },
      ui: {
        containerSettings: {
          showTitle: true,
          padding: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
    },
  },
  {
    name: 'Faces',
    path: '/faces',
    component: Faces,
    meta: {
      name: 'faces',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        containerSettings: {
          showTitle: true,
          padding: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      menu: {
        icon: {
          default: FacesIcon,
          active: FacesIcon,
        },
      },
      navbar: {
        position: 'top',
        icon: {
          default: FacesIcon,
          active: FacesIcon,
        },
      },
    },
  },
  {
    name: 'Plugins',
    path: '/plugins',
    component: Plugins,
    meta: {
      name: 'plugins',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        containerSettings: {
          showTitle: true,
          padding: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'top',
        icon: {
          default: PluginsIcon,
          active: PluginsIconActive,
        },
      },
      menu: {
        icon: {
          default: PluginsIcon,
          active: PluginsIconActive,
        },
      },
    },
  },
  {
    name: 'ScopedPlugin',
    path: '/plugins/:scope/:pluginname',
    component: Plugin,
    meta: {
      name: 'plugin',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        containerSettings: {
          padding: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
    },
  },
  {
    name: 'Plugin',
    path: '/plugins/:pluginname',
    component: Plugin,
    meta: {
      name: 'plugin',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        containerSettings: {
          padding: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
    },
  },
  {
    name: 'Adminpanel',
    path: '/admin',
    component: Adminpanel,
    meta: {
      name: 'adminpanel',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        containerSettings: {
          showTitle: true,
          padding: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'bottom',
        group: 'more',
        icon: {
          default: AdminpanelIcon,
          active: AdminpanelIconActive,
        },
      },
      menu: {
        icon: {
          default: AdminpanelIcon,
          active: AdminpanelIconActive,
        },
      },
    },
  },
  {
    name: 'Config',
    path: '/config',
    component: Config,
    meta: {
      name: 'config',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        containerSettings: {
          disableScroll: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'bottom',
        group: 'more',
        icon: {
          default: ConfigIcon,
          active: ConfigIconActive,
        },
      },
      menu: {
        icon: {
          default: ConfigIcon,
          active: ConfigIconActive,
        },
      },
    },
  },
  {
    name: 'Logs',
    path: '/logs',
    component: Logs,
    meta: {
      name: 'logs',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        background: '#000000',
        containerSettings: {
          disableScroll: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'bottom',
        group: 'more',
        icon: {
          default: LogsIcon,
          active: LogsIconActive,
        },
      },
      menu: {
        icon: {
          default: LogsIcon,
          active: LogsIconActive,
        },
      },
    },
  },
  {
    name: 'Console',
    path: '/console',
    component: Console,
    meta: {
      name: 'console',
      auth: {
        requiresAuth: true,
        role: 'user',
      },
      ui: {
        background: '#000000',
        containerSettings: {
          disableScroll: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'bottom',
        group: 'more',
        icon: {
          default: ConsoleIcon,
          active: ConsoleIconActive,
        },
      },
      menu: {
        icon: {
          default: ConsoleIcon,
          active: ConsoleIconActive,
        },
      },
    },
  },
  {
    name: 'Terminal',
    path: '/terminal',
    component: Terminal,
    meta: {
      name: 'terminal',
      disabledInElectron: true,
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        background: '#000000',
        containerSettings: {
          disableScroll: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'bottom',
        group: 'more',
        icon: {
          default: TerminalIcon,
          active: TerminalIconActive,
        },
      },
      menu: {
        icon: {
          default: TerminalIcon,
          active: TerminalIconActive,
        },
      },
    },
  },
  {
    name: 'Automations',
    path: '/automations',
    component: Automations,
    meta: {
      name: 'automations',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        containerSettings: {
          showTitle: true,
          padding: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'bottom',
        group: 'more',
        icon: {
          default: AutomationsIcon,
          active: AutomationsIconActive,
        },
      },
      menu: {
        icon: {
          default: AutomationsIcon,
          active: AutomationsIconActive,
        },
      },
    },
  },
  {
    name: 'Automation',
    path: '/automations/:id',
    component: Automation,
    meta: {
      name: 'automation',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        containerSettings: {
          disableScroll: true,
          paddingBottom: false,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
      },
    },
  },
  {
    name: 'Instances',
    path: '/instances',
    component: Instances,
    meta: {
      name: 'instances',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        containerSettings: {
          showTitle: true,
          padding: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'bottom',
        group: 'more',
        icon: {
          default: InstancesIcon,
          active: InstancesIconActive,
        },
      },
      menu: {
        icon: {
          default: InstancesIcon,
          active: InstancesIconActive,
        },
      },
    },
  },
  {
    name: 'Workers',
    path: '/workers',
    component: Workers,
    meta: {
      name: 'workers',
      auth: {
        requiresAuth: true,
        role: 'admin',
      },
      ui: {
        containerSettings: {
          showTitle: true,
          padding: true,
        },
        showNavbar: true,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
      },
      navbar: {
        position: 'bottom',
        group: 'more',
        icon: {
          default: WorkersIcon,
          active: WorkersIconActive,
        },
      },
      menu: {
        icon: {
          default: WorkersIcon,
          active: WorkersIconActive,
        },
      },
    },
  },
  {
    name: 'Menu',
    path: '/menu',
    component: Menu,
    meta: {
      name: 'menu',
      auth: {
        requiresAuth: true,
        role: 'user',
      },
      ui: {
        containerSettings: {
          padding: false,
        },
        showNavbar: false,
        showTopbar: true,
        showBottombar: true,
        showRouterLoading: true,
        minifiedTopbar: true,
      },
      bottombar: {
        icon: {
          default: MenuIcon,
          active: MenuIcon,
        },
      },
    },
  },
  {
    name: 'Settings',
    path: '/settings',
    component: Settings,
    meta: {
      name: 'settings',
      path: '/settings/account',
      auth: {
        requiresAuth: true,
        role: 'user',
      },
      navbar: {
        position: 'bottom',
        icon: {
          default: SettingsIcon,
          active: SettingsIconActive,
        },
      },
      menu: {
        icon: {
          default: SettingsIcon,
          active: SettingsIconActive,
        },
      },
    },
    children: [
      {
        name: 'SettingsAccount',
        path: 'account',
        component: SettingsAccount,
        meta: {
          name: 'account',
          description: 'account_description',
          auth: {
            requiresAuth: true,
            role: 'user',
          },
          ui: {
            showNavbar: true,
            showTopbar: true,
            showBottombar: true,
            showRouterLoadingSub: true,
          },
          settingsBar: {
            icon: {
              default: SettingsAccountIcon,
              active: SettingsAccountIconActive,
            },
          },
        },
      },
      {
        name: 'SettingsAppearance',
        path: 'appearance',
        component: SettingsAppearance,
        meta: {
          name: 'appearance',
          description: 'appearance_description',
          auth: {
            requiresAuth: true,
            role: 'user',
          },
          ui: {
            showNavbar: true,
            showTopbar: true,
            showBottombar: true,
            showRouterLoadingSub: true,
          },
          settingsBar: {
            icon: {
              default: SettingsAppearanceIcon,
              active: SettingsAppearanceIconActive,
            },
          },
        },
      },
      {
        name: 'SettingsUsers',
        path: 'user',
        component: SettingsUsers,
        meta: {
          name: 'user',
          description: 'user_description',
          auth: {
            requiresAuth: true,
            role: 'admin',
          },
          ui: {
            showNavbar: true,
            showTopbar: true,
            showBottombar: true,
            showRouterLoadingSub: true,
          },
          settingsBar: {
            icon: {
              default: SettingsUsersIcon,
              active: SettingsUsersIconActive,
            },
          },
        },
      },
      {
        name: 'SettingsNotifications',
        path: 'notifications',
        component: SettingsNotifications,
        meta: {
          name: 'notifications',
          description: 'notifications_description',
          auth: {
            requiresAuth: true,
            role: 'user',
          },
          ui: {
            showNavbar: true,
            showTopbar: true,
            showBottombar: true,
            showRouterLoadingSub: true,
          },
          settingsBar: {
            icon: {
              default: SettingsNotificationsIcon,
              active: SettingsNotificationsIconActive,
            },
          },
        },
      },
      {
        name: 'SettingsRecordings',
        path: 'recordings',
        component: SettingsRecordings,
        meta: {
          name: 'recordings',
          description: 'recordings_description',
          auth: {
            requiresAuth: true,
            role: 'admin',
          },
          ui: {
            showNavbar: true,
            showTopbar: true,
            showBottombar: true,
            showRouterLoadingSub: true,
          },
          settingsBar: {
            icon: {
              default: RecordingsIcon,
              active: RecordingsIconActive,
            },
          },
        },
      },
      {
        name: 'SettingsRemote',
        path: 'remote',
        component: SettingsRemote,
        meta: {
          name: 'remote',
          description: 'remote_access_description',
          auth: {
            requiresAuth: true,
            role: 'admin',
          },
          ui: {
            showNavbar: true,
            showTopbar: true,
            showBottombar: true,
            showRouterLoadingSub: true,
          },
          settingsBar: {
            icon: {
              default: SettingsRemoteIcon,
              active: SettingsRemoteIconActive,
            },
          },
        },
      },
      {
        name: 'SettingsMqtt',
        path: 'mqtt',
        component: SettingsMqtt,
        meta: {
          name: 'mqtt',
          description: 'mqtt_description',
          auth: {
            requiresAuth: true,
            role: 'admin',
          },
          ui: {
            showNavbar: true,
            showTopbar: true,
            showBottombar: true,
            showRouterLoadingSub: true,
          },
          settingsBar: {
            icon: {
              default: SettingsMqttIcon,
              active: SettingsMqttIcon,
            },
          },
        },
      },
      {
        name: 'SettingsBackup',
        path: 'backup',
        component: SettingsBackup,
        meta: {
          name: 'backup',
          description: 'backup_description',
          auth: {
            requiresAuth: true,
            role: 'admin',
          },
          ui: {
            showNavbar: true,
            showTopbar: true,
            showBottombar: true,
            showRouterLoadingSub: true,
          },
          settingsBar: {
            icon: {
              default: SettingsBackupIcon,
              active: SettingsBackupIconActive,
            },
          },
        },
      },
      {
        name: 'SettingsSystem',
        path: 'system',
        component: SettingsSystem,
        meta: {
          name: 'system',
          description: 'system_description',
          auth: {
            requiresAuth: true,
            role: 'admin',
          },
          ui: {
            showNavbar: true,
            showTopbar: true,
            showBottombar: true,
            showRouterLoadingSub: true,
          },
          settingsBar: {
            icon: {
              default: SettingsSystemIcon,
              active: SettingsSystemIconActive,
            },
          },
        },
      },
    ],
  },
];

function getTransitionInfo(path: string): { group: string; key: string; ignore?: string; depth?: number } | null {
  const p = path.toLowerCase();
  if (p === '/home') return { group: 'main', key: 'home', ignore: 'camview' };
  if (p === '/camview') return { group: 'main', key: 'camview', ignore: 'home' };
  if (p.startsWith('/cameras/')) return { group: 'main', key: 'cameras' };
  // Menu group: menu is depth 0, sub-pages are depth 1
  if (p === '/menu') return { group: 'menu', key: 'menu', depth: 0 };
  if (p === '/faces') return { group: 'menu', key: 'faces', depth: 1 };
  if (p === '/plugins') return { group: 'menu', key: 'plugins', depth: 1 };
  if (p.startsWith('/plugins/')) return { group: 'menu', key: 'plugin-detail', depth: 2 };
  if (p.startsWith('/settings')) return { group: 'menu', key: 'settings', depth: 1 };
  if (p === '/admin') return { group: 'menu', key: 'admin', depth: 1 };
  if (p === '/config') return { group: 'menu', key: 'config', depth: 1 };
  if (p === '/console') return { group: 'menu', key: 'console', depth: 1 };
  if (p === '/terminal') return { group: 'menu', key: 'terminal', depth: 1 };
  if (p === '/instances') return { group: 'menu', key: 'instances', depth: 1 };
  if (p === '/workers') return { group: 'menu', key: 'workers', depth: 1 };
  if (p === '/automations') return { group: 'menu', key: 'automations', depth: 1 };
  if (p === '/about') return { group: 'menu', key: 'about', depth: 1 };
  if (p.startsWith('/automations/')) return { group: 'menu', key: 'automation-detail', depth: 2 };
  return null;
}

const scrollPositions = new Map<string, number>();

const router = createRouter({
  history: isCapacitor ? createWebHashHistory() : createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: async (to, from, savedPosition) => {
    // Use browser's saved position if available (back/forward navigation)
    if (savedPosition) {
      return savedPosition;
    }

    if (from.path === to.path || to.path === '/') {
      return { top: 0, left: 0 };
    }

    await sleep(10);

    // Use our saved position for view transitions
    const saved = scrollPositions.get(to.path);
    if (saved !== undefined) {
      // Clear the saved position after using it (one-time restore)
      scrollPositions.delete(to.path);
      return { top: saved, left: 0 };
    }

    return { top: 0, left: 0, behavior: 'smooth' };
  },
});

router.absUrl = (url: string = '#', newTab: boolean = true): void => {
  const link = document.createElement('a');
  link.href = url;
  link.target = newTab && url !== '#' ? '_blank' : '';

  if (newTab) {
    link.rel = 'noopener noreferrer';
  }

  link.click();
};

router.beforeEach(async (to, from) => {
  if (isCapacitor && !isInCloudSession()) {
    window.location.replace(`${window.location.origin}/`);
    return false;
  }

  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const routerStore = useRouterStore();

  if (to.meta.disabledInElectron && (queryClient.getQueryData(['api']) as { electron?: boolean } | undefined)?.electron) {
    return '/home';
  }

  const pageName = (to.name as string).toLowerCase();

  routerStore.routerLoading = true;
  routerStore.setRoutes(from.fullPath, to.fullPath);

  scrollPositions.set(from.path, window.scrollY);

  if (authStore.user) {
    queryClient.cancelQueries(undefined, { revert: false });

    if (authStore.user.firstLogin && to.path !== '/first-steps') {
      return '/first-steps';
    } else if (
      (!authStore.user.firstLogin && to.path === '/first-steps') ||
      (to.meta.auth?.requiresAuth &&
        to.meta.auth.role &&
        authStore.user.role !== to.meta.auth.role &&
        authStore.user.role !== 'admin' &&
        authStore.user.role !== 'master')
    ) {
      return '/home';
    } else if (pageName === 'login') {
      return '/home';
    } else if (to.path === '/settings') {
      const view = useUiStore().uiSettings.interface.selectedSettingsView;
      return `/settings/${settingsViews.includes(view) ? view : 'account'}`;
    }
  } else if (pageName !== 'login') {
    return '/';
  }
});

router.beforeResolve(async (to, from) => {
  const fromInfo = getTransitionInfo(from.path);
  const toInfo = getTransitionInfo(to.path);

  if (!fromInfo || !toInfo || fromInfo.group !== toInfo.group || fromInfo.key === toInfo.key || fromInfo.ignore === toInfo.key || toInfo.ignore === fromInfo.key) {
    return;
  }

  if (fromInfo.group === 'menu' && fromInfo.depth !== undefined && toInfo.depth !== undefined) {
    if (window.innerWidth > 640) return; // desktop: no slide
    if (fromInfo.depth === toInfo.depth) return; // same depth (e.g. /faces → /plugins): no slide

    const direction = toInfo.depth > fromInfo.depth ? 'forward' : 'back';
    document.documentElement.dataset.menuDirection = direction;
  }

  if (to.path === '/home') {
    const queryClient = useQueryClient();
    const cached = queryClient.getQueriesData({ queryKey: ['camerasList'] });
    const hasData = cached.some(([, data]) => data != null);
    if (!hasData) return;
  }

  const hasMenuDirection = !!document.documentElement.dataset.menuDirection;
  const routerStore = useRouterStore();
  routerStore.isTransitioning = true;
  const viewTransition = startViewTransition();
  await viewTransition.captured;

  viewTransition.finished.finally(() => {
    routerStore.isTransitioning = false;
    if (hasMenuDirection) {
      delete document.documentElement.dataset.menuDirection;
    }
  });
});

const CHUNK_RELOAD_FLAG = 'cui-chunk-reload';
function isDynamicImportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|importing a module script failed|failed to (load|fetch) module script|expected a javascript|chunkloaderror|loading( css)? chunk/i.test(
    message,
  );
}

router.afterEach(() => {
  const routerStore = useRouterStore();
  routerStore.routerLoading = false;
  sessionStorage.removeItem(CHUNK_RELOAD_FLAG);

  const connection = useConnection();
  if (connection.bannerMode.value === null) adoptUpdateIfPending();
});

router.onError((error, to) => {
  const routerStore = useRouterStore();
  routerStore.routerLoading = false;

  if (isDynamicImportError(error) && !sessionStorage.getItem(CHUNK_RELOAD_FLAG)) {
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
    window.location.assign(to.fullPath);
  }
});

export default router;
