import '@/plugins/logger.js';

import { reactive } from 'vue';

import HaCameraCard from './HaCameraCard.vue';
import HaEventsCard from './HaEventsCard.vue';
import HaViewCard from './HaViewCard.vue';
import { ensureShell } from './shell.js';
import { adoptStyles } from './styles.js';
import { cameraAttributes, cameraEntities, firstCameraUiCamera } from './types.js';
import './viewEditor.js';

import type { Component } from 'vue';
import type { Shell } from './shell.js';
import type { HaCameraAttributes, HaCameraCardConfig, HaEventsCardConfig, HomeAssistant } from './types.js';

export type CardKind = 'camera' | 'events' | 'view';

export interface CardConfig {
  type: string;
  [key: string]: unknown;
}

export interface CardController {
  setConfig(config: CardConfig): void;
  setHass(hass: HomeAssistant): void;
  setLayout(layout: string | null): void;
  connected(): void;
  disconnected(): void;
  getCardSize(): number;
  getGridOptions(): Record<string, number | string>;
}

interface KindSpec {
  readonly component: Component;
  readonly cardSize: number;
  readonly gridOptions: Record<string, number | string>;
  stubConfig(hass?: HomeAssistant): Partial<CardConfig>;
  configForm?(): { schema: unknown[] };
  configElement?(): HTMLElement;
  extraProps?(config: CardConfig, hass: HomeAssistant, memo: Record<string, unknown>): Record<string, unknown>;
  unavailable(config: CardConfig, hass: HomeAssistant): boolean;
}

const MODE_OPTIONS = [
  { value: 'snapshot', label: 'Snapshot' },
  { value: 'live', label: 'Live player' },
];
const FIT_OPTIONS = [
  { value: 'contain', label: 'Fit inside (black bars)' },
  { value: 'cover', label: 'Crop to fill' },
];
const CLICK_OPTIONS = [
  { value: 'popup', label: 'camera.ui dialog' },
  { value: 'ha', label: 'Open in camera.ui' },
  { value: 'none', label: 'Nothing' },
];

const HOST_STYLE = `
  :host { display: block; }
  :host([fill]) { height: 100%; }
  :host([fill]) ha-card, :host([fill]) .cui-ha, :host([fill]) .cui-ha > div { height: 100%; min-height: 0; }
  :host([fill]) .p-card-content { height: 100%; }
  :host([fill]) #video-container { flex: 1 1 auto; min-height: 0; }
  .cui-ha, .cui-ha > div, .cui-ha > div > * { width: 100%; min-width: 0; max-width: 100%; }
  ha-card { display: flex; flex-direction: column; overflow: hidden; }
  .cui-ha > div { display: flex; flex-direction: column; }
  .cui-ha > div > * { flex: 1 1 auto; min-height: 0; }
`;

function anyCameraUnavailable(entities: string[], hass: HomeAssistant): boolean {
  return entities.some((id) => hass.states[id]?.state === 'unavailable');
}

const KINDS: Record<CardKind, KindSpec> = {
  camera: {
    component: HaCameraCard,
    cardSize: 5,
    gridOptions: { rows: 4, columns: 12, min_rows: 2, min_columns: 3 },
    stubConfig: (hass) => ({
      entity: firstCameraUiCamera(hass) ?? '',
      mode: 'snapshot',
      click: 'popup',
      fit: 'contain',
      controls: true,
      toolbar: true,
      detection_indicator: true,
    }),
    configForm: () => ({
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'camera' } } },
        {
          type: 'grid',
          name: '',
          schema: [
            { name: 'mode', selector: { select: { mode: 'dropdown', options: MODE_OPTIONS } } },
            { name: 'click', selector: { select: { mode: 'dropdown', options: CLICK_OPTIONS } } },
            { name: 'fit', selector: { select: { mode: 'dropdown', options: FIT_OPTIONS } } },
            { name: 'controls', selector: { boolean: {} } },
            { name: 'toolbar', selector: { boolean: {} } },
            { name: 'detection_indicator', selector: { boolean: {} } },
          ],
        },
      ],
    }),
    // HA strips every attribute while an entity is unavailable (camera.ui restarting): keep the last
    // resolved identity so the card stays mounted and shows the app's own offline state
    extraProps: (config, hass, memo) => {
      const attributes = cameraAttributes(hass, (config as unknown as HaCameraCardConfig).entity);
      if (attributes.camera_name) memo.attributes = attributes;
      return { attributes: (memo.attributes as HaCameraAttributes | undefined) ?? attributes };
    },
    unavailable: (config, hass) => hass.states[(config as unknown as HaCameraCardConfig).entity]?.state === 'unavailable',
  },
  events: {
    component: HaEventsCard,
    cardSize: 4,
    gridOptions: { rows: 3, min_rows: 3, max_rows: 3, columns: 12, min_columns: 4 },
    stubConfig: () => ({}),
    configForm: () => ({ schema: [{ name: 'entities', selector: { entity: { domain: 'camera', multiple: true } } }] }),
    unavailable: (config, hass) => {
      const entities = (config as unknown as HaEventsCardConfig).entities;
      return anyCameraUnavailable(entities?.length ? entities : cameraEntities(hass), hass);
    },
  },
  view: {
    component: HaViewCard,
    cardSize: 8,
    gridOptions: { rows: 8, columns: 'full', min_rows: 3, min_columns: 6 },
    stubConfig: () => ({ rearrange: true }),
    configElement: () => document.createElement('cameraui-view-card-editor'),
    unavailable: (_config, hass) => anyCameraUnavailable(cameraEntities(hass), hass),
  },
};

class Controller implements CardController {
  private config: CardConfig | null = null;
  private hass: HomeAssistant | null = null;
  private layout: string | null = null;
  private mountEl: HTMLElement | null = null;
  private mountId: number | null = null;
  private props: Record<string, unknown> | null = null;
  private shell: Shell | null = null;
  private unregisterTheme: (() => void) | null = null;
  private sizeObserver: ResizeObserver | null = null;
  private collapsed = false;
  private readonly memo: Record<string, unknown> = {};

  constructor(
    private readonly kind: CardKind,
    private readonly host: HTMLElement,
    private readonly entryId: string,
  ) {}

  public setConfig(config: CardConfig): void {
    this.config = config;
    this.sync();
  }

  public setHass(hass: HomeAssistant): void {
    this.hass = hass;
    this.sync();
  }

  public setLayout(layout: string | null): void {
    this.layout = layout;
    this.host.toggleAttribute('fill', this.fills());
    this.sync();
  }

  public connected(): void {
    if (!this.sizeObserver && typeof ResizeObserver !== 'undefined') {
      // a host that ends up 0px high has no box to fill (editor preview, views without a layout hint)
      this.sizeObserver = new ResizeObserver(() => {
        if (!this.collapsed && this.host.isConnected && this.host.hasAttribute('fill') && this.host.clientHeight === 0) {
          this.collapsed = true;
          this.host.toggleAttribute('fill', false);
          if (this.props) this.props.fill = false;
        }
      });
      this.sizeObserver.observe(this.host);
    }
    if (!this.mountEl) {
      const shadow = this.host.shadowRoot ?? this.host.attachShadow({ mode: 'open' });
      const sizing = document.createElement('style');
      sizing.textContent = HOST_STYLE;
      shadow.append(sizing);
      this.host.toggleAttribute('fill', this.fills());
      const scope = document.createElement('div');
      scope.className = 'cui-ha';
      this.mountEl = document.createElement('div');
      scope.append(this.mountEl);
      const card = document.createElement('ha-card');
      card.append(scope);
      shadow.append(card);
    }
    this.sync();
  }

  public disconnected(): void {
    queueMicrotask(() => {
      if (this.host.isConnected) return;
      this.unregisterTheme?.();
      this.unregisterTheme = null;
      if (this.mountId !== null && this.shell) this.shell.removeMount(this.mountId);
      this.mountId = null;
      this.props = null;
    });
  }

  public getCardSize(): number {
    return KINDS[this.kind].cardSize;
  }

  public getGridOptions(): Record<string, number | string> {
    return KINDS[this.kind].gridOptions;
  }

  private fills(): boolean {
    return this.layout !== 'masonry' && !this.collapsed;
  }

  private sync(): void {
    const config = this.config;
    const hass = this.hass;
    if (!config || !hass || !this.host.isConnected || !this.mountEl) return;
    if (this.props) {
      Object.assign(this.props, this.buildProps(config, hass));
      this.shell?.update(hass);
      return;
    }
    void ensureShell(hass, this.entryId).then((shell) => {
      if (!this.host.isConnected || !this.mountEl || this.props) return;
      adoptStyles(this.host.shadowRoot!);
      this.shell = shell;
      this.mountEl.textContent = '';
      this.unregisterTheme = shell.registerThemeRoot(this.mountEl);
      this.props = reactive(this.buildProps(this.config ?? config, this.hass ?? hass));
      this.mountId = shell.addMount(this.mountEl, KINDS[this.kind].component, this.props);
    });
  }

  private buildProps(config: CardConfig, hass: HomeAssistant): Record<string, unknown> {
    return { hass, config, entryId: this.entryId, fill: this.fills(), ...KINDS[this.kind].extraProps?.(config, hass, this.memo) };
  }
}

export function createCard(kind: CardKind, host: HTMLElement, entryId: string): CardController {
  return new Controller(kind, host, entryId);
}

export function stubConfig(kind: CardKind, hass?: HomeAssistant): Partial<CardConfig> {
  return KINDS[kind].stubConfig(hass);
}

export function configForm(kind: CardKind): { schema: unknown[] } | null {
  return KINDS[kind].configForm?.() ?? null;
}

export function configElement(kind: CardKind): HTMLElement | null {
  return KINDS[kind].configElement?.() ?? null;
}

export function unavailable(kind: CardKind, config: CardConfig, hass: HomeAssistant): boolean {
  return KINDS[kind].unavailable(config, hass);
}
