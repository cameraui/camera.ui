import type { DBUser } from '../src/api/database/types.ts';
import type { JwtTokenDecoded } from '../src/api/types/index.ts';

export interface CustomLocals {
  user?: DBUser;
  items?: any[];
  jwt?: JwtTokenDecoded;
  authKind?: 'session' | 'api';
}

declare module 'fastify' {
  interface FastifyRequest {
    locals: CustomLocals;
  }
  interface FastifyContextConfig {
    uploadToDisk?: boolean;
  }
}
