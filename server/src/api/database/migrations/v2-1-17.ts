import { DEFAULT_GO2RTC_CONFIG_WEBRTC } from '../../../services/config/defaults.js';

import type { Migration } from './types.js';

const migration: Migration = {
  version: '2.1.17',
  description: 'webrtc listens on its port for udp as well, not only tcp',
  async up(ctx) {
    const listen = ctx.configService.go2rtcConfig.webrtc.listen;
    if (listen !== `${DEFAULT_GO2RTC_CONFIG_WEBRTC.listen}/tcp`) return;

    await ctx.configService.writeGo2RtcConfigFile({ webrtc: { listen: DEFAULT_GO2RTC_CONFIG_WEBRTC.listen } });
    ctx.logger.log(`WebRTC: listen "${listen}" is now "${DEFAULT_GO2RTC_CONFIG_WEBRTC.listen}", the port carries TCP and UDP`);
  },
};

export default migration;
