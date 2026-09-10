export interface AssistantClientToolSpec {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

export const ASSISTANT_SETTINGS_PAGES = [
  'account',
  'appearance',
  'assistant',
  'backup',
  'mqtt',
  'notifications',
  'permissions',
  'recordings',
  'remote',
  'system',
  'users',
] as const;

export const ASSISTANT_PAGES: Record<string, { path: string; description: string }> = {
  home: { path: '/home', description: 'Start page with the camera overview' },
  cameras: { path: '/cameras', description: 'Camera list, add and manage cameras' },
  sensors: { path: '/sensors', description: 'Sensors and accessories' },
  camview: { path: '/camview', description: 'Several cameras at once' },
  recordings: { path: '/recordings', description: 'Recordings, events and episodes' },
  floorplan: { path: '/floorplan', description: 'Floor plan with cameras and sensors' },
  faces: { path: '/faces', description: 'Known faces' },
  training: { path: '/training', description: 'Model training contributions' },
  plugins: { path: '/plugins', description: 'Installed plugins and the plugin store' },
  automations: { path: '/automations', description: 'Automations editor' },
  metrics: { path: '/metrics', description: 'System metrics' },
  updates: { path: '/updates', description: 'Updates for server, plugins and apps' },
  logs: { path: '/logs', description: 'Server log' },
  workers: { path: '/workers', description: 'Remote analysis workers' },
  instances: { path: '/instances', description: 'Other camera.ui servers' },
  assistant: { path: '/assistant', description: 'This assistant' },
};

export const ASSISTANT_CLIENT_TOOLS: AssistantClientToolSpec[] = [
  {
    name: 'open_page',
    description: 'Open a page of the app for the user. Only when the user asks to open, show or go to it.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          enum: Object.keys(ASSISTANT_PAGES),
          description: Object.entries(ASSISTANT_PAGES)
            .map(([id, page]) => `${id}: ${page.description}`)
            .join('; '),
        },
      },
      required: ['page'],
    },
  },
  {
    name: 'ui_actions',
    description:
      'List what the page the user is looking at can do right now (for example jump the timeline of the open camera). ' +
      'Call it first when the user asks to do something on the current page, then call ui_action.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ui_action',
    description: 'Run one of the actions ui_actions listed, with the arguments it describes.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Action name from ui_actions' }, args: { type: 'object', description: 'Arguments as described by ui_actions' } },
      required: ['name'],
    },
  },
  {
    name: 'open_camera',
    description: 'Open the live view of a camera in the app for the user. Use the camera name from the camera list.',
    inputSchema: { type: 'object', properties: { camera: { type: 'string', description: 'Camera name' } }, required: ['camera'] },
  },
  {
    name: 'open_recording',
    description: 'Open the recording of a camera at a point in time in the app, for example the moment of an event. Time as ISO 8601 with offset.',
    inputSchema: {
      type: 'object',
      properties: { camera: { type: 'string', description: 'Camera name' }, time: { type: 'string', description: 'ISO 8601 timestamp' } },
      required: ['camera', 'time'],
    },
  },
  {
    name: 'open_camview',
    description: 'Open the Camview page that shows several cameras at once.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'open_settings',
    description: 'Open a settings page in the app. Only when the user explicitly asks to open or go to it, not for questions about how a setting works.',
    inputSchema: { type: 'object', properties: { page: { type: 'string', enum: [...ASSISTANT_SETTINGS_PAGES], description: 'Settings page' } }, required: ['page'] },
  },
];
