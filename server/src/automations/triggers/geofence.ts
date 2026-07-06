import type { DBAutomation, DBAutomationNode } from '../../api/database/types.js';

export interface GeofenceMapping {
  flowId: string;
  nodeId: string;
  userSecrets: Record<string, string>; // username -> HMAC secret
}

export interface GeofenceState {
  lat: number;
  lon: number;
  state: 'inside' | 'outside';
  updatedAt: number;
}

export function registerGeofence(geofenceMap: Map<string, GeofenceMapping>, flow: DBAutomation, triggerNode: DBAutomationNode): void {
  const geofenceId = triggerNode.data.geofenceId as string;
  const userSecrets = (triggerNode.data.geofenceUserSecrets as Record<string, string> | undefined) ?? {};
  if (!geofenceId || Object.keys(userSecrets).length === 0) return;
  geofenceMap.set(geofenceId, { flowId: flow._id, nodeId: triggerNode.id, userSecrets });
}
