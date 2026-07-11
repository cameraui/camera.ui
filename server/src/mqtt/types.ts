export type MqttConnectionState = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface MqttStatus {
  state: MqttConnectionState;
  connectedAt: number | null;
  lastError: string | null;
  broker?: {
    running: boolean;
    port: number;
  } | null;
}

export interface MqttTestResult {
  ok: boolean;
  message?: string;
}

export interface MqttInfo {
  settings: MqttMaskedSettings;
  passwordSet: boolean;
  status: MqttStatus;
}

export interface MqttMaskedSettings {
  enabled: boolean;
  mode: 'external' | 'embedded';
  broker: {
    port: number;
    username: string | null;
    password: string | null;
  };
  host: string | null;
  port: number;
  protocol: 'mqtt' | 'mqtts';
  username: string | null;
  password: null;
  clientId: string;
  topicPrefix: string;
  tls: {
    rejectUnauthorized: boolean;
    ca: string | null;
    cert: string | null;
    key: string | null;
  };
  haDiscovery: {
    enabled: boolean;
    prefix: string;
  };
}
