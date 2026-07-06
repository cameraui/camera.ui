export interface ProxyAuth {
  cluster: AuthConfig;
  server: AuthConfig;
  viewer: AuthConfig;
}

export interface AuthConfig {
  user: string;
  password: string;
}

export interface NatsAuthConfig extends AuthConfig {
  timeout: number;
}

export interface NatsPermission {
  allow?: string[];
  deny?: string[];
}

export interface NatsUserConfig extends AuthConfig {
  permissions?: {
    publish?: NatsPermission;
    subscribe?: NatsPermission;
  };
}

export interface NatsServerAuthConfig {
  timeout: number;
  users: NatsUserConfig[];
}

export interface NatsTLSConfig {
  cert_file: string;
  key_file: string;
  ca_file: string;
  timeout: number;
  verify?: boolean;
  insecure?: boolean;
}

export interface NatsWsAuthConfig {
  timeout: number;
  username: string;
  password: string;
}

export interface NatsWsTLSConfig {
  cert_file: string;
  key_file: string;
}

export interface NatsClusterConfig {
  host: string;
  port: number;
  name: string;
  routes: string[];
  tls?: NatsTLSConfig;
  authorization: NatsAuthConfig;
}

export interface NatsWebsocketConfig {
  host: string;
  port: number;
  authorization?: NatsWsAuthConfig;
  tls?: NatsWsTLSConfig;
  no_tls?: boolean;
}

export interface NatsConfig {
  host: string;
  port: number;
  http?: number;
  server_name: string;
  cluster?: NatsClusterConfig;
  authorization: NatsServerAuthConfig;
  tls?: NatsTLSConfig;
  websocket?: NatsWebsocketConfig;
  max_pending?: number;
  max_payload?: number;
  max_control_line?: number;
  disable_sublist_cache?: boolean;
  no_fast_producer_stall?: boolean;
  write_deadline?: string;
}
