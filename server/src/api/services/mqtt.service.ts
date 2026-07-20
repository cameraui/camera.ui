import { container } from 'tsyringe';

import type { MqttManager } from '../../mqtt/manager.js';
import type { MqttInfo, MqttStatus, MqttTestResult } from '../../mqtt/types.js';
import type { Database } from '../database/index.js';
import type { DBMqtt } from '../database/types.js';
import type { PatchMqttInput } from '../schemas/mqtt.schema.js';

export class MqttService {
  private dbs: Database;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
  }

  public info(): MqttInfo {
    const settings = this.settings();

    return {
      settings: { ...settings, password: null },
      passwordSet: !!settings.password,
      status: this.mqttManager.getStatus(),
    };
  }

  public status(): MqttStatus {
    return this.mqttManager.getStatus();
  }

  public topics(): string[] {
    return this.mqttManager.getRecentTopics();
  }

  public async patch(patch: PatchMqttInput): Promise<MqttInfo> {
    const settings = this.mergeSettings(this.settings(), patch);

    await this.dbs.mqttDB.put('mqtt', settings);
    await this.mqttManager.applySettings();

    return this.info();
  }

  public async test(patch: PatchMqttInput): Promise<MqttTestResult> {
    const settings = this.mergeSettings(this.settings(), patch);
    return this.mqttManager.test(settings);
  }

  private get mqttManager(): MqttManager {
    return container.resolve<MqttManager>('mqttManager');
  }

  private settings(): DBMqtt {
    return this.dbs.mqttDB.get('mqtt')!;
  }

  private mergeSettings(current: DBMqtt, patch: PatchMqttInput): DBMqtt {
    const { tls, haDiscovery, broker, password, ...rest } = patch;

    return {
      ...current,
      ...rest,
      password: password === undefined ? current.password : password,
      broker: { ...current.broker, ...broker },
      tls: { ...current.tls, ...tls },
      haDiscovery: { ...current.haDiscovery, ...haDiscovery },
    };
  }
}
