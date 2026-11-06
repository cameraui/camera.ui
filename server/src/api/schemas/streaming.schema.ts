import * as zod from 'zod';

export const listenPortSchema = zod.number({ error: 'Required' }).int().min(1, 'Minimum 1').max(65535, 'Maximum 65535');

export const rtspLoginSchema = zod
  .string()
  .trim()
  .min(1, 'Required')
  .max(64, 'Maximum 64 characters')
  // RTSP clients put the login into the URL unencoded
  .regex(/^[A-Za-z0-9._~-]+$/, 'Only letters, digits and - . _ ~');

export const streamingSettingsSchema = zod
  .object({
    rtsp: zod
      .object({
        port: listenPortSchema,
        username: rtspLoginSchema,
        password: rtspLoginSchema,
        defaultQuery: zod.string().trim().min(1, 'Required'),
      })
      .partial()
      .strict(),
    onvif: zod.object({ enabled: zod.boolean(), port: listenPortSchema }).partial().strict(),
    webrtc: zod
      .object({
        port: listenPortSchema,
        candidates: zod
          .string()
          .trim()
          .regex(/^\S+:\d+$/, 'Address and port, like stun:8555 or 192.168.1.10:8555')
          .array(),
      })
      .partial()
      .strict(),
    srtpPort: listenPortSchema,
    rtmpPort: listenPortSchema,
  })
  .partial()
  .strict();

export type StreamingSettingsInput = zod.output<typeof streamingSettingsSchema>;
