// MQTT topic layout, all rooted at the configurable prefix:
//
//   <p>/status                                    online|offline (retained, LWT)
//   <p>/server/state                              JSON (retained)
//   <p>/server/event                              JSON { type, timestamp }
//   <p>/server/notification                       JSON (system notifications only)
//   <p>/plugin/<name>/status                      started|stopped|error|crashed (retained)
//   <p>/camera/<id>/status                        online|offline (retained)
//   <p>/camera/<id>/frameworker                   online|offline (retained)
//   <p>/camera/<id>/meta                          JSON (retained)
//   <p>/camera/<id>/event                         JSON detection event lifecycle
//   <p>/camera/<id>/motion                        ON|OFF (retained)
//   <p>/camera/<id>/detection/<label>             ON|OFF (retained)
//   <p>/camera/<id>/snapshot                      JPEG (retained)
//   <p>/camera/<id>/sensor/<stableId>/meta        JSON (retained)
//   <p>/camera/<id>/sensor/<stableId>/<property>  JSON value (retained)
//
// States are retained, events are not. Sensor topics use the stable id, never
// the per-instance runtime UUID.
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

  sensorPrefix(cameraId: string, sensorStableId: string): string {
    return `${this.cameraPrefix(cameraId)}/sensor/${sanitizeTopicSegment(sensorStableId)}`;
  }

  sensorMeta(cameraId: string, sensorStableId: string): string {
    return `${this.sensorPrefix(cameraId, sensorStableId)}/meta`;
  }

  sensorProperty(cameraId: string, sensorStableId: string, property: string): string {
    return `${this.sensorPrefix(cameraId, sensorStableId)}/${sanitizeTopicSegment(property)}`;
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
