import * as zod from 'zod';

export const createRoomSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Room name is required').max(64),
    levelId: zod.string().trim().min(1).nullable().default(null),
    outdoor: zod.boolean().default(false),
    publicSpace: zod.boolean().default(false),
    note: zod.string().trim().max(240).default(''),
  })
  .strict();

export const roomParamsSchema = zod.object({
  roomid: zod.string().trim().min(1),
});

export type CreateRoomInput = zod.output<typeof createRoomSchema>;
