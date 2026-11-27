import { inject } from '../../container.js';
import { nvrRpcNamespace } from '../../plugins/nvr.js';
import { isAdminRequest } from '../middlewares/authPermission.middleware.js';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { NvrEventParams, NvrEventThumbnailQuery } from '../schemas/nvr.schema.js';
import type { AuthLoginRequest } from '../types/index.js';

type ThumbnailMap = Record<string, Uint8Array>;

interface EventThumbnails {
  attributes?: ThumbnailMap;
  strips?: ThumbnailMap;
  cards?: ThumbnailMap;
  event?: Uint8Array;
}

interface NvrRpc {
  getEventThumbnails(cameraId: string, startMs: number, eventId: string, keys: string[], asViewer: boolean): Promise<EventThumbnails | undefined>;
}

export class NvrController {
  private proxyServer = inject('proxy');

  public async getEventThumbnail(
    req: FastifyRequest<AuthLoginRequest & { Params: NvrEventParams; Querystring: NvrEventThumbnailQuery }>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const namespace = nvrRpcNamespace();
    if (!namespace) {
      return reply.code(404).send({ statusCode: 404, message: 'NVR plugin is not running' });
    }

    try {
      const rpc = this.proxyServer.proxy.createProxy<NvrRpc>(namespace);
      const thumbnails = await rpc.getEventThumbnails(req.query.cameraId, req.query.startMs, req.params.eventId, ['card:cover'], !isAdminRequest(req));
      const image = this.pickPrimaryThumbnail(thumbnails);
      if (!image) {
        return reply.code(404).send({ statusCode: 404, message: 'No thumbnail for this event' });
      }
      return reply.code(200).header('content-type', 'image/jpeg').send(Buffer.from(image));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  private pickPrimaryThumbnail(thumbnails: EventThumbnails | undefined): Uint8Array | undefined {
    if (!thumbnails) return undefined;

    const moments = thumbnails.cards ?? thumbnails.strips ?? {};
    const first = Object.keys(moments).sort((a, b) => Number(a) - Number(b))[0];
    return first !== undefined ? moments[first] : thumbnails.event;
  }
}
