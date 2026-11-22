export class MqttTopics {
  constructor(public readonly prefix: string) {}

  get availability(): string {
    return `${this.prefix}/status`;
  }

  get serverState(): string {
    return `${this.prefix}/server/state`;
  }

  get serverEvent(): string {
    return `${this.prefix}/server/event`;
  }

  get serverNotification(): string {
    return `${this.prefix}/server/notification`;
  }

  pluginStatus(pluginName: string): string {
    return `${this.prefix}/plugin/${sanitizeTopicSegment(pluginName)}/status`;
  }

  cameraPrefix(cameraId: string): string {
    return `${this.prefix}/camera/${sanitizeTopicSegment(cameraId)}`;
  }

  cameraStatus(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/status`;
  }

  cameraFrameWorker(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/frameworker`;
  }

  cameraMeta(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/meta`;
  }

  cameraEvent(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/event`;
  }

  cameraMotion(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/motion`;
  }

  cameraDetection(cameraId: string, label: string): string {
    return `${this.cameraPrefix(cameraId)}/detection/${sanitizeTopicSegment(label)}`;
  }

  cameraSnapshot(cameraId: string): string {
    return `${this.cameraPrefix(cameraId)}/snapshot`;
  }

  sensorPrefix(sensorId: string): string {
    return `${this.prefix}/sensor/${sanitizeTopicSegment(sensorId)}`;
  }

  sensorMeta(sensorId: string): string {
    return `${this.sensorPrefix(sensorId)}/meta`;
  }

  sensorProperty(sensorId: string, property: string): string {
    return `${this.sensorPrefix(sensorId)}/${sanitizeTopicSegment(property)}`;
  }

  sensorVacuumState(sensorId: string): string {
    return `${this.sensorPrefix(sensorId)}/vacuum_state`;
  }

  sensorLockState(sensorId: string): string {
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
