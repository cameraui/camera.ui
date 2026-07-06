import { Severity } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import { SystemNotificationTypeId } from '../manager/types.js';

import type { InternalEventBus, PluginEventPayload } from '../internal-bus.js';
import type { ProxyServer } from '../rpc/index.js';

const CRASH_CONFIRM_MS = 20_000;
const FLAP_THRESHOLD = 3;
const FLAP_WINDOW_MS = 60_000;
const RECOVER_STABLE_MS = 60_000;

interface HealthState {
  pluginName: string;
  displayName: string;
  crashes: number[];
  notified: boolean;
  isUp: boolean;
  confirmTimer?: NodeJS.Timeout;
  stableTimer?: NodeJS.Timeout;
}

export class PluginHealthMonitor {
  private states = new Map<string, HealthState>();

  constructor() {
    const bus = container.resolve<InternalEventBus>('internalBus');
    bus.onEvent('plugin:crashed', (payload) => this.onCrash(payload as PluginEventPayload));
    bus.onEvent('plugin:started', (payload) => this.onStarted(payload as PluginEventPayload));
  }

  private get notificationManager() {
    return container.resolve<ProxyServer>('proxy').notificationManager;
  }

  private onCrash(payload: PluginEventPayload): void {
    const now = Date.now();

    let state = this.states.get(payload.pluginId);
    if (!state) {
      state = { pluginName: payload.pluginName, displayName: payload.displayName ?? payload.pluginName, crashes: [], notified: false, isUp: false };
      this.states.set(payload.pluginId, state);
    }

    state.pluginName = payload.pluginName;
    state.displayName = payload.displayName ?? payload.pluginName;
    state.isUp = false;

    if (state.stableTimer) {
      clearTimeout(state.stableTimer);
      state.stableTimer = undefined;
    }

    state.crashes = state.crashes.filter((t) => now - t < FLAP_WINDOW_MS);
    state.crashes.push(now);

    if (state.notified) {
      return;
    }

    if (state.crashes.length >= FLAP_THRESHOLD) {
      this.fireCrash(payload.pluginId);
      return;
    }

    state.confirmTimer ??= setTimeout(() => {
      const s = this.states.get(payload.pluginId);
      if (!s) return;
      s.confirmTimer = undefined;
      if (s.isUp) return; // recovered on its own → stay silent
      this.fireCrash(payload.pluginId);
    }, CRASH_CONFIRM_MS);
  }

  private onStarted(payload: PluginEventPayload): void {
    const state = this.states.get(payload.pluginId);
    if (!state) {
      return; // never crashed → nothing to track
    }

    state.isUp = true;

    if (state.stableTimer) {
      clearTimeout(state.stableTimer);
    }
    state.stableTimer = setTimeout(() => this.onRecovered(payload.pluginId), RECOVER_STABLE_MS);
  }

  private onRecovered(pluginId: string): void {
    const state = this.states.get(pluginId);
    if (!state) {
      return;
    }

    if (state.confirmTimer) {
      clearTimeout(state.confirmTimer);
    }

    const wasNotified = state.notified;
    const { pluginName, displayName } = state;
    this.states.delete(pluginId);

    // Only announce recovery if we announced the crash in the first place.
    if (wasNotified) {
      this.notificationManager
        .notify({
          source: { kind: 'system', id: SystemNotificationTypeId.PluginCrashed },
          notification: {
            title: 'Plugin Recovered',
            body: `${displayName} is back online after a crash`,
            severity: Severity.Info,
            tag: `${SystemNotificationTypeId.PluginCrashed}:recovered:${pluginId}`,
            deepLink: `/plugins/${pluginName}`,
          },
        })
        .catch(() => {});
    }
  }

  private fireCrash(pluginId: string): void {
    const state = this.states.get(pluginId);
    if (!state || state.notified) {
      return;
    }

    state.notified = true;
    if (state.confirmTimer) {
      clearTimeout(state.confirmTimer);
      state.confirmTimer = undefined;
    }

    this.notificationManager
      .notify({
        source: { kind: 'system', id: SystemNotificationTypeId.PluginCrashed },
        notification: {
          title: 'Plugin Crashed',
          body: `${state.displayName} crashed unexpectedly`,
          severity: Severity.Warn,
          tag: `${SystemNotificationTypeId.PluginCrashed}:crashed:${pluginId}`,
          deepLink: `/plugins/${state.pluginName}`,
        },
      })
      .catch(() => {});
  }
}
