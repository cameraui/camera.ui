export class MqttTopics {
  constructor(public readonly prefix: string) {}

  public get availability(): string {
    return `${this.prefix}/status`;
  }

  public get serverState(): string {
    return `${this.prefix}/server/state`;
  }

  public get serverEvent(): string {
    return `${this.prefix}/server/event`;
  }

  public get serverNotification(): string {
    return `${this.prefix}/server/notification`;
  }

  public pluginStatus(pluginName: string): string {
    return `${this.prefix}/plugin/${sanitizeTopicSegment(pluginName)}/status`;
  }

  public cameraPrefix(cameraId: string): string {
    return `${this.prefix}/camera/${sanitizeTopicSegment(cameraId)}`;
  }

  public cameraStatus(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/status`;
  }

  public cameraFrameWorker(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/frameworker`;
  }

  public cameraMeta(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/meta`;
  }

  public cameraEvent(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/event`;
  }

  public cameraMotion(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/motion`;
  }

  public cameraDetection(cameraId: string, label: string): string {
    return `${this.cameraPrefix(cameraId)}/detection/${sanitizeTopicSegment(label)}`;
  }

  public cameraSnapshot(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/snapshot`;
  }

  public cameraPrivacy(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/privacy`;
  }

  public cameraPrivacyCommand(cameraId: string): string {
    return `${this.cameraPrivacy(cameraId)}/set`;
  }

  public sensorPrefix(sensorId: string): string {
    return `${this.prefix}/sensor/${sanitizeTopicSegment(sensorId)}`;
  }

  sensorMeta(sensorId: string): string {
    return `${this.sensorPrefix(sensorId)}/meta`;
  }

  public sensorProperty(sensorId: string, property: string): string {
    return `${this.sensorPrefix(sensorId)}/${sanitizeTopicSegment(property)}`;
  }

  public sensorVacuumState(sensorId: string): string {
    return `${this.sensorPrefix(sensorId)}/vacuum_state`;
  }

  public sensorLockState(sensorId: string): string {
    return `${this.sensorPrefix(sensorId)}/lock_state`;
  }
}

export function sanitizeTopicSegment(segment: string): string {
  return segment.replace(/[#+/\s]+/g, '-');
}

export function topicMatchesFilter(filter: string, topic: string): boolean {
  const filterParts = filter.split('/');
  const topicParts = topic.split('/');

  for (let i = 0; i < filterParts.length; i++) {
    if (filterParts[i] === '#') return true;
    if (i >= topicParts.length) return false;
    if (filterParts[i] !== '+' && filterParts[i] !== topicParts[i]) return false;
  }

  return filterParts.length === topicParts.length;
}
