import { isIP } from 'node:net';
import * as zod from 'zod';

import { EDGE_PROTOCOLS } from '../../remote/services/cloudflaredBinary.js';
import { isHostAddress } from '../../services/config/platform-values.js';
import { isProxyAuthHeader, MIN_PROXY_AUTH_SECRET_LENGTH } from '../../services/config/proxy-auth.js';
import { trustEntry } from '../../utils/trusted-addresses.js';
import { logLevelSchema } from './config.schema.js';
import { logLevelGo2rtcSchema } from './go2rtc.schema.js';
import { listenPortSchema, streamingSettingsSchema } from './streaming.schema.js';

const serverPortSchema = zod.number({ error: 'Required' }).int().min(1024, 'Minimum 1024').max(49151, 'Maximum 49151');
const addressSchema = zod
  .string()
  .trim()
  .refine((value) => !!trustEntry(value), 'Not an IP address or CIDR range');

export const settingsPatchSchema = zod
  .object({
    server: zod
      .object({
        port: serverPortSchema,
        insecurePort: serverPortSchema.nullable(),
        host: zod
          .string()
          .trim()
          .refine((host) => isIP(host) !== 0 && isHostAddress(host), 'Not an address of this machine'),
        mdns: zod.boolean(),
      })
      .partial()
      .strict(),
    logging: zod
      .object({
        level: logLevelSchema,
        streamingLevel: logLevelGo2rtcSchema,
      })
      .partial()
      .strict(),
    proxy: zod
      .object({
        trustedProxies: addressSchema.array(),
        corsOrigins: zod
          .string()
          .trim()
          .refine((origin) => URL.canParse(origin) && /^https?:$/.test(new URL(origin).protocol), 'Not a web address')
          .transform((origin) => new URL(origin).origin)
          .array(),
        cloudflaredProtocol: zod.enum([...EDGE_PROTOCOLS, '']),
        proxyAuth: zod
          .object({
            port: listenPortSchema,
            header: zod.string().trim().toLowerCase().refine(isProxyAuthHeader, 'Not a usable header name'),
            trust: addressSchema.array(),
            secret: zod.union([zod.literal(''), zod.string().trim().min(MIN_PROXY_AUTH_SECRET_LENGTH, `Minimum ${MIN_PROXY_AUTH_SECRET_LENGTH} characters`)]),
            logoutUrl: zod.union([zod.literal(''), zod.url({ protocol: /^https?$/, error: 'Not a web address' })]),
          })
          .partial()
          .strict()
          .nullable(),
      })
      .partial()
      .strict(),
    streaming: streamingSettingsSchema,
  })
  .partial()
  .strict();

export type SettingsPatchInput = zod.output<typeof settingsPatchSchema>;
