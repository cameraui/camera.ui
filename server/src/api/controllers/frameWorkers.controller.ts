import { orderBy } from '@camera.ui/common/utils';
import { container } from 'tsyringe';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CameraUiAPI } from '../../api.js';
import type { AuthLoginRequest, FrameWorker, FrameWorkerParamsNameRequest, PaginationRequest } from '../types/index.js';

export class FrameWorkersController {
  private api: CameraUiAPI;

  constructor(private app: FastifyInstance) {
    this.api = container.resolve<CameraUiAPI>('api');
  }

  public list(_req: FastifyRequest<AuthLoginRequest & PaginationRequest>, reply: FastifyReply): FastifyReply | FrameWorker[] {
    try {
      const cameraControllers = this.api.getCameras();
      const frameWorkers = cameraControllers.map((cameraController) => {
        const frameWorker = cameraController.frameWorker;

        return {
          name: frameWorker.name,
          status: frameWorker.status,
        };
      });

      return orderBy(frameWorkers, ['name'], ['asc']);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async restartByName(req: FastifyRequest<AuthLoginRequest & FrameWorkerParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const cameraControllers = this.api.getCameras();
      const cameraController = cameraControllers.find((cameraController) => cameraController.frameWorker.name === req.params.frameworkername);
      const frameWorker = cameraController?.frameWorker;

      if (!frameWorker) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Frame Worker not exists',
        });
      }

      await frameWorker.restart();

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async startByName(req: FastifyRequest<AuthLoginRequest & FrameWorkerParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const cameraControllers = this.api.getCameras();
      const cameraController = cameraControllers.find((cameraController) => cameraController.frameWorker.name === req.params.frameworkername);
      const frameWorker = cameraController?.frameWorker;

      if (!frameWorker) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Frame Worker not exists',
        });
      }

      await frameWorker.start();

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async stopByName(req: FastifyRequest<AuthLoginRequest & FrameWorkerParamsNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const cameraControllers = this.api.getCameras();
      const cameraController = cameraControllers.find((cameraController) => cameraController.frameWorker.name === req.params.frameworkername);
      const frameWorker = cameraController?.frameWorker;

      if (!frameWorker) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Frame Worker not exists',
        });
      }

      await frameWorker.close();

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }
}
