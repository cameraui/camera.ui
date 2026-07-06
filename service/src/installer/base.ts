import type { CameraUiCLI } from '../cameraui.js';

export class BasePlatform {
  constructor(public cli: CameraUiCLI) {}

  public async install(): Promise<void> {
    this.cli.logger('This command has not been implemented on this platform.', 'fail');
    process.exit(0);
  }

  public async uninstall(): Promise<void> {
    this.cli.logger('This command has not been implemented on this platform.', 'fail');
    process.exit(0);
  }

  public async reinstall(): Promise<void> {
    this.cli.logger('This command has not been implemented on this platform.', 'fail');
    process.exit(0);
  }

  public async start(): Promise<void> {
    this.cli.logger('This command has not been implemented on this platform.', 'fail');
    process.exit(0);
  }

  public async stop(): Promise<void> {
    this.cli.logger('This command has not been implemented on this platform.', 'fail');
    process.exit(0);
  }

  public async restart(): Promise<void> {
    this.cli.logger('This command has not been implemented on this platform.', 'fail');
    process.exit(0);
  }

  public async beforeStart(): Promise<void> {
    this.cli.logger('This command has not been implemented on this platform.', 'fail');
    process.exit(0);
  }

  public async getId(): Promise<{ uid: number; gid: number }> {
    return {
      uid: 0,
      gid: 0,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public getPidOfPort(port: number): string | null {
    return null;
  }
}
