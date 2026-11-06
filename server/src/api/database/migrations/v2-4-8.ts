import { DEFAULT_GO2RTC_CONFIG_RTSP } from '../../../services/config/defaults.js';

import type { Migration } from './types.js';

const ALL_TRACKS_QUERY = 'video=all&audio=all';

const migration: Migration = {
  version: '2.4.8',
  description: 'rtsp clients without a query get the video and the audio of the camera, not every track',
  async up(ctx) {
    if (ctx.configService.go2rtcConfig.rtsp.default_query !== ALL_TRACKS_QUERY) return;

    await ctx.configService.writeGo2RtcConfigFile({ rtsp: { default_query: DEFAULT_GO2RTC_CONFIG_RTSP.default_query } });
    ctx.logger.log(`RTSP: default_query "${ALL_TRACKS_QUERY}" is now "${DEFAULT_GO2RTC_CONFIG_RTSP.default_query}"`);
  },
};

export default migration;
