import { CamerasService } from '../services/cameras.service.js';
import { FloorPlanService } from '../services/floorplan.service.js';
import { RoomsService } from '../services/rooms.service.js';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CreateRoomInput } from '../schemas/rooms.schema.js';
import type { AuthLoginRequest } from '../types/index.js';

export class RoomsController {
  private service: RoomsService;
  private floorPlanService: FloorPlanService;
  private camerasService: CamerasService;

  constructor() {
    this.service = new RoomsService();
    this.floorPlanService = new FloorPlanService();
    this.camerasService = new CamerasService();
  }

  public list(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply {
    try {
      return reply.code(200).send(this.service.get());
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async create(req: FastifyRequest<AuthLoginRequest & { Body: CreateRoomInput }>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(201).send(await this.service.create(req.body));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async remove(req: FastifyRequest<AuthLoginRequest & { Params: { roomid: string } }>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const room = this.service.byId(req.params.roomid);
      if (!room) return reply.code(404).send({ statusCode: 404, message: 'Room not found' });

      await this.floorPlanService.dropRoom(room.id);
      await this.service.remove(room.id);

      const fallback = await this.service.fallback();
      for (const camera of this.camerasService.list()) {
        if (camera.roomId === room.id) await this.camerasService.assignRoom(camera._id, fallback.id);
      }

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }
}
