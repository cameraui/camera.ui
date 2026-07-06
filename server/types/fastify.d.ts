import type { DBUser } from '../src/api/database/types.ts';
import type { JwtTokenDecoded } from '../src/api/types/index.ts';

export interface CustomLocals {
  user?: DBUser;
  items?: any[];
  jwt?: JwtTokenDecoded;
}

declare module 'fastify' {
  interface FastifyRequest {
    locals: CustomLocals;
  }
}
