<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.geofence_zone_name') }}</label>
      <InputText
        :model-value="data.zoneName"
        :placeholder="t('components.automation_nodes.geofence_zone_name_placeholder')"
        class="w-full"
        @update:model-value="update('zoneName', $event)"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.geofence_map_hint') }}</label>
      <div ref="mapContainerRef" class="rounded-lg overflow-hidden border-[1px] border-color" style="height: 220px"></div>
      <Button severity="secondary" outlined :label="t('components.automation_nodes.geofence_use_my_location')" class="cui-button-small w-full" @click="useMyLocation">
        <template #icon>
          <i-mdi:crosshairs-gps class="w-4 h-4" />
        </template>
      </Button>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.geofence_latitude') }}</label>
      <InputNumber :model-value="data.latitude" :min-fraction-digits="4" :max-fraction-digits="6" class="w-full" @update:model-value="onLatChange" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.geofence_longitude') }}</label>
      <InputNumber :model-value="data.longitude" :min-fraction-digits="4" :max-fraction-digits="6" class="w-full" @update:model-value="onLonChange" />
    </div>

    <div class="flex flex-col gap-3">
      <label class="cui-label">{{ t('components.automation_nodes.geofence_radius') }}</label>
      <Slider
        :model-value="data.radius || 200"
        :min="50"
        :max="5000"
        :step="50"
        class="w-full"
        @update:model-value="(v) => onRadiusChange(Array.isArray(v) ? v[0] : v)"
      />
      <InputNumber :model-value="data.radius || 200" :min="50" :max="5000" suffix=" m" class="w-full" @update:model-value="onRadiusChange" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.geofence_event') }}</label>
      <Select
        :model-value="data.event || 'both'"
        :options="eventOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        @update:model-value="update('event', $event)"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.geofence_users') }}</label>
      <MultiSelect
        :model-value="data.users"
        :options="userOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.geofence_users_placeholder')"
        class="w-full"
        @update:model-value="update('users', $event)"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.geofence_users_hint') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.geofence_url') }}</label>
      <InputGroup>
        <InputText :model-value="locationUrl" readonly class="font-mono text-xs" />
        <InputGroupAddon>
          <CuiActionButton
            :action-text="t('components.automation_nodes.webhook_secret_copied')"
            :icon="CopyIcon"
            :button-props="{ severity: 'secondary', text: true }"
            @action="copy(locationUrl)"
          />
        </InputGroupAddon>
      </InputGroup>
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.geofence_url_hint') }}</Message>
    </div>

    <div v-if="userSecretEntries.length" class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.geofence_secret') }}</label>
      <div v-for="[username, secret] in userSecretEntries" :key="username" class="flex flex-col gap-1">
        <span class="text-xs text-muted font-medium">{{ username }}</span>
        <InputGroup>
          <InputText :model-value="secret" readonly class="font-mono text-xs" />
          <InputGroupAddon>
            <CuiActionButton
              :action-text="t('components.automation_nodes.webhook_secret_copied')"
              :icon="CopyIcon"
              :button-props="{ severity: 'secondary', text: true }"
              @action="copy(secret)"
            />
          </InputGroupAddon>
        </InputGroup>
      </div>
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.geofence_secret_hint') }}</Message>
    </div>
    <div v-else class="cui-banner cui-banner-warn">
      <i-mdi:information-outline class="w-5 h-5 shrink-0" />
      <span>{{ t('components.automation_nodes.geofence_secret_save_hint') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import 'leaflet/dist/leaflet.css';

import * as L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import CopyIcon from '~icons/carbon/copy';

import { copyToClipboard } from '@/common/utils.js';
import { useUserOptions } from './useUserOptions.js';

import type { ConfigNodeUpdateEmits, ConfigTriggerGeofenceProps } from '../types.js';

const props = defineProps<ConfigTriggerGeofenceProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();
const toast = useCuiToast();
const { userOptions } = useUserOptions();
const { getCurrentPosition } = useDeviceLocation();

const eventOptions = [
  { label: t('components.automation_nodes.geofence_event_enter'), value: 'enter' },
  { label: t('components.automation_nodes.geofence_event_leave'), value: 'leave' },
  { label: t('components.automation_nodes.geofence_event_both'), value: 'both' },
];

const mapContainerRef = useTemplateRef<HTMLDivElement>('mapContainerRef');

let leafletMap: any = null;
let leafletMarker: any = null;
let leafletCircle: any = null;

const locationUrl = computed(() => {
  const origin = window.location.origin;
  return `${origin}/api/automations/location/${props.data.geofenceId || '...'}`;
});

const userSecretEntries = computed<[string, string][]>(() => Object.entries(props.data.geofenceUserSecrets ?? {}));

function initMap() {
  if (!mapContainerRef.value) return;

  const lat = props.data.latitude || 51.505;
  const lon = props.data.longitude || -0.09;

  leafletMap = L.map(mapContainerRef.value).setView([lat, lon], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(leafletMap);

  const markerIconInstance = L.icon({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  leafletMarker = L.marker([lat, lon], { draggable: true, icon: markerIconInstance }).addTo(leafletMap);
  leafletCircle = L.circle([lat, lon], { radius: props.data.radius || 200, color: '#3b82f6', fillOpacity: 0.15, weight: 2 }).addTo(leafletMap);

  leafletMarker.on('dragend', () => {
    const pos = leafletMarker.getLatLng();
    emit('update:data', { latitude: pos.lat, longitude: pos.lng });
    leafletCircle.setLatLng(pos);
  });
}

function updateMapView(lat: number, lon: number, zoom?: number) {
  if (!leafletMap) return;
  leafletMap.setView([lat, lon], zoom ?? leafletMap.getZoom());
  leafletMarker?.setLatLng([lat, lon]);
  leafletCircle?.setLatLng([lat, lon]);
}

function onLatChange(val: number | null) {
  if (val != null) {
    emit('update:data', { latitude: val });
    updateMapView(val, props.data.longitude);
  }
}

function onLonChange(val: number | null) {
  if (val != null) {
    emit('update:data', { longitude: val });
    updateMapView(props.data.latitude, val);
  }
}

function onRadiusChange(val: number | null) {
  if (val != null) {
    update('radius', val);
    leafletCircle?.setRadius(val);
  }
}

function locationUnavailable() {
  toast.add({
    severity: 'error',
    summary: t('components.toast.title_error'),
    detail: t('components.automation_nodes.geofence_location_error'),
    life: 4000,
  });
}

async function useMyLocation() {
  try {
    const { latitude, longitude } = await getCurrentPosition();
    emit('update:data', { latitude, longitude });
    updateMapView(latitude, longitude, 16);
  } catch {
    locationUnavailable();
  }
}

function copy(text: string) {
  copyToClipboard(text);
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}

watch(mapContainerRef, (el) => {
  if (el && !leafletMap) initMap();
});

onBeforeUnmount(() => {
  leafletMap?.remove();
  leafletMap = null;
  leafletMarker = null;
  leafletCircle = null;
});
</script>
