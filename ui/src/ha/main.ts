window.__CUI_HA_CARDS__ = true;

import '@/plugins/logger.js';

import { configElement, configForm, createCard, stubConfig, unavailable } from './cards.js';
import { cameraAttributes, cameraEntities, entryIdFromPanels, firstCameraUiCamera, isCameraUiCamera } from './types.js';
import './viewEditor.js';

import type { CardConfig, CardController, CardKind } from './cards.js';
import type { HaCameraCardConfig, HaEventsCardConfig, HaViewCardConfig, HomeAssistant } from './types.js';

// bump when the backend contract below changes; a mismatched server is told to update instead of breaking
const CARDS_CONTRACT = 2;

interface CardBackend {
  readonly entryId: string;
  readonly contract: number;
  createCard(kind: CardKind, host: HTMLElement): CardController;
  stubConfig(kind: CardKind, hass?: HomeAssistant): Partial<CardConfig>;
  configForm(kind: CardKind): { schema: unknown[] } | null;
  configElement(kind: CardKind): HTMLElement | null;
  unavailable(kind: CardKind, config: CardConfig, hass: HomeAssistant): boolean;
}

declare global {
  interface Window {
    __cameraui_card_backends?: Map<string, CardBackend>;
    customCards?: unknown[];
  }
}

const BUNDLE_ENTRY_ID = /\/api\/cameraui\/cards\/([^/]+)\//.exec(import.meta.url)?.[1] ?? '';

const backends = (window.__cameraui_card_backends ??= new Map<string, CardBackend>());
if (BUNDLE_ENTRY_ID) {
  backends.set(BUNDLE_ENTRY_ID, {
    entryId: BUNDLE_ENTRY_ID,
    contract: CARDS_CONTRACT,
    createCard: (kind, host) => createCard(kind, host, BUNDLE_ENTRY_ID),
    stubConfig,
    configForm,
    configElement,
    unavailable,
  });
}

function anyBackend(): CardBackend | undefined {
  return backends.values().next().value;
}

function firstEntryWithCameras(hass: HomeAssistant): string | undefined {
  for (const entity of cameraEntities(hass)) {
    const id = cameraAttributes(hass, entity).entry_id;
    if (id) return id;
  }
  return entryIdFromPanels(hass);
}

function entryIdFor(kind: CardKind, config: CardConfig, hass: HomeAssistant): string | undefined {
  if (kind === 'camera') {
    const entity = (config as unknown as HaCameraCardConfig).entity;
    return cameraAttributes(hass, entity).entry_id ?? (hass.states[entity]?.state === 'unavailable' ? entryIdFromPanels(hass) : undefined);
  }
  if (kind === 'view' && (config as unknown as HaViewCardConfig).entry) return (config as unknown as HaViewCardConfig).entry;
  if (kind === 'events') {
    for (const entity of (config as unknown as HaEventsCardConfig).entities ?? []) {
      const id = cameraAttributes(hass, entity).entry_id;
      if (id) return id;
    }
  }
  return firstEntryWithCameras(hass);
}

abstract class CardHull extends HTMLElement {
  protected abstract readonly kind: CardKind;
  private config: CardConfig | null = null;
  private hassValue: HomeAssistant | null = null;
  private layoutValue: string | null = null;
  private controller: CardController | null = null;

  public setConfig(config: CardConfig): void {
    this.validate(config);
    this.config = config;
    if (this.controller) this.controller.setConfig(config);
    else this.resolve();
  }

  public set hass(hass: HomeAssistant) {
    this.hassValue = hass;
    if (this.controller) this.controller.setHass(hass);
    else this.resolve();
  }

  public get hass(): HomeAssistant | null {
    return this.hassValue;
  }

  public set layout(layout: string | null) {
    this.layoutValue = layout;
    this.controller?.setLayout(layout);
  }

  public get layout(): string | null {
    return this.layoutValue;
  }

  public connectedCallback(): void {
    this.resolve();
    this.controller?.connected();
  }

  public disconnectedCallback(): void {
    this.controller?.disconnected();
  }

  public getCardSize(): number {
    return this.controller?.getCardSize() ?? 4;
  }

  public getGridOptions(): Record<string, number | string> {
    return this.controller?.getGridOptions() ?? { rows: 4, columns: 12 };
  }

  protected validate(_config: CardConfig): void {}

  // bind once: the entry of a card does not change, and everything after the lookup is the backend's
  private resolve(): void {
    const config = this.config;
    const hass = this.hassValue;
    if (this.controller || !config || !hass) return;
    const entryId = entryIdFor(this.kind, config, hass);
    if (!entryId) {
      const backend = anyBackend();
      this.textContent = backend?.unavailable(this.kind, config, hass) ? 'camera.ui is not reachable' : 'Not a camera.ui entity';
      return;
    }
    const backend = backends.get(entryId);
    if (!backend) {
      this.textContent = 'camera.ui cards for this server are not loaded (server too old?)';
      return;
    }
    if (backend.contract !== CARDS_CONTRACT) {
      this.textContent = 'This camera.ui server needs an update, its dashboard cards do not match the ones already loaded';
      return;
    }
    this.textContent = '';
    this.controller = backend.createCard(this.kind, this);
    this.controller.setConfig(config);
    this.controller.setHass(hass);
    this.controller.setLayout(this.layoutValue);
    if (this.isConnected) this.controller.connected();
  }
}

class CameraUiCardElement extends CardHull {
  protected readonly kind = 'camera';

  protected validate(config: CardConfig): void {
    if (!(config as unknown as HaCameraCardConfig).entity) throw new Error('cameraui-card: "entity" is required');
  }

  public static getStubConfig(hass?: HomeAssistant): Partial<CardConfig> {
    return anyBackend()?.stubConfig('camera', hass) ?? { entity: firstCameraUiCamera(hass) ?? '' };
  }

  public static getConfigForm(): { schema: unknown[] } {
    return anyBackend()?.configForm('camera') ?? { schema: [{ name: 'entity', required: true, selector: { entity: { domain: 'camera' } } }] };
  }
}

class CameraUiEventsCardElement extends CardHull {
  protected readonly kind = 'events';

  public static getStubConfig(): Partial<CardConfig> {
    return anyBackend()?.stubConfig('events') ?? {};
  }

  public static getConfigForm(): { schema: unknown[] } {
    return anyBackend()?.configForm('events') ?? { schema: [] };
  }
}

class CameraUiViewCardElement extends CardHull {
  protected readonly kind = 'view';

  public static getStubConfig(): Partial<CardConfig> {
    return anyBackend()?.stubConfig('view') ?? {};
  }

  public static getConfigElement(): HTMLElement {
    return anyBackend()?.configElement('view') ?? document.createElement('cameraui-view-card-editor');
  }
}

if (!customElements.get('cameraui-card')) customElements.define('cameraui-card', CameraUiCardElement);
if (!customElements.get('cameraui-view-card')) customElements.define('cameraui-view-card', CameraUiViewCardElement);
if (!customElements.get('cameraui-events-card')) customElements.define('cameraui-events-card', CameraUiEventsCardElement);

window.customCards = window.customCards ?? [];
if (!window.customCards.some((card) => (card as { type?: string }).type === 'cameraui-card')) {
  window.customCards.push(
    {
      type: 'cameraui-card',
      name: 'camera.ui Camera',
      description: 'The camera.ui camera card: snapshot tile or live player, and the camera.ui dialog with timeline.',
      documentationURL: 'https://github.com/cameraui/homeassistant-integration',
      preview: true,
      getEntitySuggestion: (hass: HomeAssistant, entityId: string) => {
        if (!isCameraUiCamera(hass, entityId)) return null;
        return { config: { type: 'custom:cameraui-card', entity: entityId } };
      },
    },
    {
      type: 'cameraui-view-card',
      name: 'camera.ui View',
      description: 'A camera.ui camview view as a widget: the saved camera grid with drag and drop.',
      documentationURL: 'https://github.com/cameraui/homeassistant-integration',
    },
    {
      type: 'cameraui-events-card',
      name: 'camera.ui Events',
      description: 'Recent camera.ui events with thumbnails, click opens the camera.ui dialog.',
      documentationURL: 'https://github.com/cameraui/homeassistant-integration',
    },
  );
}
