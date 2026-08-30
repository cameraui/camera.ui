import { haProxyPath } from '@/connection/modes/ha.js';
import { cameraAttributes, cameraEntities, entryIdFromPanels, entryIds } from './types.js';

import type { HaViewCardConfig, HomeAssistant } from './types.js';

interface HaForm extends HTMLElement {
  hass?: HomeAssistant | null;
  schema?: unknown[];
  data?: unknown;
  computeLabel?: (schema: { name: string }) => string;
}

interface ViewOption {
  value: string;
  label: string;
}

const LABELS: Record<string, string> = { entry: 'camera.ui server', view: 'camera.ui view', rearrange: 'Rearrange button' };

function entryIdFor(hass: HomeAssistant, config: HaViewCardConfig | null): string | undefined {
  if (config?.entry) return config.entry;
  for (const entity of cameraEntities(hass)) {
    const id = cameraAttributes(hass, entity).entry_id;
    if (id) return id;
  }
  return entryIdFromPanels(hass);
}

class CameraUiViewCardEditor extends HTMLElement {
  private config: HaViewCardConfig | null = null;
  private hassValue: HomeAssistant | null = null;
  private form: HaForm | null = null;
  private options: ViewOption[] = [];
  private loadedFor: string | null = null;

  public setConfig(config: HaViewCardConfig): void {
    this.config = { ...config };
    this.render();
    this.loadViews();
  }

  public set hass(hass: HomeAssistant) {
    this.hassValue = hass;
    this.render();
    this.loadViews();
  }

  public get hass(): HomeAssistant | null {
    return this.hassValue;
  }

  public connectedCallback(): void {
    if (!this.form) {
      const form = document.createElement('ha-form') as HaForm;
      form.addEventListener('value-changed', (event) => {
        const value = (event as CustomEvent<{ value: Partial<HaViewCardConfig> }>).detail.value;
        this.config = { ...(this.config ?? { type: 'custom:cameraui-view-card' }), ...value };
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this.config }, bubbles: true, composed: true }));
      });
      this.form = form;
      this.append(form);
    }
    this.render();
  }

  private async loadViews(): Promise<void> {
    const hass = this.hassValue;
    if (!hass) return;
    const entryId = entryIdFor(hass, this.config);
    if (!entryId || this.loadedFor === entryId) return;
    this.loadedFor = entryId;
    try {
      const me = (await (await hass.fetchWithAuth(`${haProxyPath(entryId)}/api/auth/me`)).json()) as { username?: string };
      if (!me.username) return;
      const res = await hass.fetchWithAuth(`${haProxyPath(entryId)}/api/users/${encodeURIComponent(me.username)}/preferences/camview/views?page=1&pageSize=-1`);
      const data = (await res.json()) as { result?: { _id: string; name: string }[] };
      this.options = (data.result ?? []).map((view) => ({ value: view._id, label: view.name }));
    } catch {
      this.loadedFor = null;
    }
    this.render();
  }

  private serverLabel(entryId: string): string {
    const hass = this.hassValue;
    if (!hass) return entryId;
    const entity = cameraEntities(hass).find((id) => cameraAttributes(hass, id).entry_id === entryId);
    const name = entity ? cameraAttributes(hass, entity).friendly_name : undefined;
    return name ? `${name}, … (${entryId.slice(-6)})` : entryId;
  }

  private render(): void {
    if (!this.form) return;
    this.form.hass = this.hassValue;
    const servers = this.hassValue ? entryIds(this.hassValue) : [];
    this.form.schema = [
      // one server is the common case, the picker only shows up with several camera.ui entries
      ...(servers.length > 1
        ? [{ name: 'entry', selector: { select: { mode: 'dropdown', options: servers.map((id) => ({ value: id, label: this.serverLabel(id) })) } } }]
        : []),
      { name: 'view', required: true, selector: { select: { mode: 'dropdown', options: this.options } } },
      { name: 'rearrange', selector: { boolean: {} } },
    ];
    this.form.data = { rearrange: true, ...this.config };
    this.form.computeLabel = (schema) => LABELS[schema.name] ?? schema.name;
  }
}

if (!customElements.get('cameraui-view-card-editor')) customElements.define('cameraui-view-card-editor', CameraUiViewCardEditor);
