<template>
  <div
    ref="shortcutContainerRef"
    class="shortcut-container min-w-0"
    :class="{
      '!pointer-events-auto': editing && !interactionLocked,
      hidden: !visible,
    }"
    :style="{ cursor: editing && !interactionLocked ? 'pointer' : 'default' }"
    @click.self="makeDraggable"
  >
    <div
      v-for="shortcut in cameraShortcuts"
      v-show="!removingShortcuts.has(shortcut._id)"
      :ref="(el: any) => functionRef(el, shortcut._id)"
      :key="shortcut._id"
      v-element-hover="[(state) => onHover(shortcut._id, state), { delayEnter: 0, delayLeave: 1000 }]"
      v-on-long-press="[
        () => onLongPressCallbackDirective(shortcut),
        {
          distanceThreshold: 24,
          delay: 500,
          onMouseUp: (duration: number, distance: number, isLongPress: boolean) => onMouseUpCallback(isLongPress, shortcut),
        },
      ]"
      @mousedown.stop
      @touchstart.stop
      @wheel.stop
      class="draggable absolute pointer-events-auto camera-shortcut"
      :style="{ background: isHoveringMap[shortcut._id] ? '#545454' : undefined }"
    >
      <Button severity="secondary" rounded class="cui-icon-lg shadow-sm pointer-events-auto">
        <template #icon>
          <i-mingcute:computer-camera-fill width="100%" height="100%" />
        </template>
      </Button>

      <Popover :ref="(el: any) => previewMenuRef(el, shortcut._id)" class="shadow-lg cui-rounded-corner overflow-hidden" :pt="{ content: { class: 'p-0' } }">
        <div class="snapshot-hover-container flex items-center justify-center relative">
          <ProgressSpinner v-if="!cameras?.result.find((cam) => cam._id === shortcut.cameraId)" stroke-width="5" class="w-[30px] h-[30px]" />
          <CuiCameraCard
            v-else
            :source-role="isNvrActive ? undefined : 'low-resolution'"
            streaming-mode="auto"
            :camera-info="cameras!.result.find((cam) => cam._id === shortcut.cameraId)!"
            :nvr-controller="isNvrActive ? getOrCreateFollower(shortcut) : undefined"
            :toolbar="false"
            :control="false"
            :subcontrol="false"
            :isolated-stream="true"
            live-indicator-overlay
            class="w-full"
            flat-card
          />
        </div>
      </Popover>
    </div>

    <div
      v-for="resolved in resolvedSensorShortcuts"
      v-show="!removingShortcuts.has(resolved.shortcut._id)"
      :ref="(el: any) => functionRef(el, resolved.shortcut._id)"
      :key="resolved.shortcut._id"
      v-on-long-press="[
        () => onSensorLongPress(resolved.shortcut),
        {
          distanceThreshold: 24,
          delay: 500,
          onMouseUp: () => onSensorMouseUp(resolved),
        },
      ]"
      @mouseenter="onSensorHover(resolved.shortcut._id, true)"
      @mouseleave="onSensorHover(resolved.shortcut._id, false)"
      @mousedown.stop
      @touchstart.stop
      @wheel.stop
      class="draggable absolute pointer-events-auto sensor-shortcut"
      :class="{
        'sensor-active': sensorState(resolved.sensor),
        'sensor-offline': !resolved.isOnline,
        'sensor-readonly': SENSOR_READONLY_TYPES.has(resolved.shortcut.sensorType) || !canControlSensors,
      }"
      :style="{ background: isHoveringMap[resolved.shortcut._id] ? '#545454' : undefined }"
    >
      <Button severity="secondary" rounded class="cui-icon-lg shadow-sm pointer-events-auto">
        <template #icon>
          <component
            :is="sensorIcon(resolved.shortcut.sensorType, resolved.sensor)"
            width="100%"
            height="100%"
            :style="sensorTone(resolved.shortcut.sensorType, sensorState(resolved.sensor))"
          />
        </template>
      </Button>

      <Popover
        v-if="resolved.shortcut.sensorType === 'securitySystem'"
        :ref="(el: any) => securitySystemMenuRef(el, resolved.shortcut._id)"
        class="shadow-lg cui-rounded-corner"
        :pt="{ content: { class: 'p-2' } }"
        append-to="body"
      >
        <div class="flex flex-col gap-1 min-w-[160px]">
          <button
            type="button"
            class="security-state-button"
            :class="{ 'security-state-button--active': isSecuritySystemStateActive(resolved.sensor, SecuritySystemState.Disarmed) }"
            @click="setSecuritySystemState(resolved, SecuritySystemState.Disarmed)"
          >
            <i-mdi:shield-off-outline class="w-4 h-4" />
            <span class="text-sm">Disarmed</span>
          </button>
          <button
            type="button"
            class="security-state-button"
            :class="{ 'security-state-button--active': isSecuritySystemStateActive(resolved.sensor, SecuritySystemState.StayArm) }"
            @click="setSecuritySystemState(resolved, SecuritySystemState.StayArm)"
          >
            <i-mdi:shield-home class="w-4 h-4" />
            <span class="text-sm">Stay Arm</span>
          </button>
          <button
            type="button"
            class="security-state-button"
            :class="{ 'security-state-button--active': isSecuritySystemStateActive(resolved.sensor, SecuritySystemState.AwayArm) }"
            @click="setSecuritySystemState(resolved, SecuritySystemState.AwayArm)"
          >
            <i-mdi:shield-lock class="w-4 h-4" />
            <span class="text-sm">Away Arm</span>
          </button>
          <button
            type="button"
            class="security-state-button"
            :class="{ 'security-state-button--active': isSecuritySystemStateActive(resolved.sensor, SecuritySystemState.NightArm) }"
            @click="setSecuritySystemState(resolved, SecuritySystemState.NightArm)"
          >
            <i-mdi:shield-moon class="w-4 h-4" />
            <span class="text-sm">Night Arm</span>
          </button>
        </div>
      </Popover>

      <Popover :ref="(el: any) => previewMenuRef(el, resolved.shortcut._id)" class="shadow-lg cui-rounded-corner" :pt="{ content: { class: 'p-2' } }">
        <div class="sensor-tooltip">
          <div class="sensor-tooltip-name">{{ resolved.sensor?.displayName.value ?? $t(`components.camera_options.sensor_type_${resolved.shortcut.sensorType}`) }}</div>
          <div
            class="sensor-tooltip-status"
            :class="{
              'text-color': isInfoSensorType(resolved.shortcut.sensorType),
              'text-purple-500':
                resolved.shortcut.sensorType === 'securitySystem' &&
                sensorState(resolved.sensor) &&
                securityState(resolved.sensor) !== SecuritySystemState.AlarmTriggered,
              'text-red-500': resolved.shortcut.sensorType === 'securitySystem' && securityState(resolved.sensor) === SecuritySystemState.AlarmTriggered,
              'text-green-500': !isInfoSensorType(resolved.shortcut.sensorType) && resolved.shortcut.sensorType !== 'securitySystem' && sensorState(resolved.sensor),
              'text-gray-400': !isInfoSensorType(resolved.shortcut.sensorType) && resolved.shortcut.sensorType !== 'securitySystem' && !sensorState(resolved.sensor),
            }"
          >
            <template v-if="resolved.shortcut.sensorType === 'contact'">
              {{ sensorState(resolved.sensor) ? 'Open' : 'Closed' }}
            </template>
            <template v-else-if="resolved.shortcut.sensorType === 'lock'">
              {{ sensorState(resolved.sensor) ? 'Locked' : 'Unlocked' }}
            </template>
            <template v-else-if="resolved.shortcut.sensorType === 'temperature'"> {{ resolved.sensor?.getProperty('current') ?? '--' }}°C </template>
            <template v-else-if="resolved.shortcut.sensorType === 'humidity'"> {{ resolved.sensor?.getProperty('current') ?? '--' }}% </template>
            <template v-else-if="resolved.shortcut.sensorType === 'occupancy'">
              {{ sensorState(resolved.sensor) ? 'Occupied' : 'Empty' }}
            </template>
            <template v-else-if="resolved.shortcut.sensorType === 'smoke'">
              {{ sensorState(resolved.sensor) ? 'Smoke Detected' : 'Clear' }}
            </template>
            <template v-else-if="resolved.shortcut.sensorType === 'leak'">
              {{ sensorState(resolved.sensor) ? 'Leak Detected' : 'Clear' }}
            </template>
            <template v-else-if="resolved.shortcut.sensorType === 'garage'">
              {{ sensorState(resolved.sensor) ? 'Open' : 'Closed' }}
            </template>
            <template v-else-if="resolved.shortcut.sensorType === 'doorbell'">
              {{ sensorState(resolved.sensor) ? 'Ringing' : 'Ready' }}
            </template>
            <template v-else-if="resolved.shortcut.sensorType === 'securitySystem'">
              {{ getSecuritySystemStateLabel(resolved.sensor) }}
            </template>
            <template v-else-if="resolved.shortcut.sensorType === 'battery'">
              {{ getBatteryStatusLabel(resolved.sensor) }}
            </template>
            <template v-else>
              {{ sensorState(resolved.sensor) ? 'On' : 'Off' }}
            </template>
          </div>
          <div v-if="!resolved.isOnline" class="sensor-tooltip-offline text-orange-500">Offline</div>
        </div>
      </Popover>
    </div>

    <div
      v-if="placeholderPosition"
      ref="placeholderRef"
      class="draggable absolute pointer-events-auto"
      :style="`left: ${placeholderPosition.x}px; top: ${placeholderPosition.y}px;`"
    >
      <Button severity="secondary" rounded class="cui-icon-lg shadow-sm pointer-events-auto">
        <template #icon>
          <i-lucide:plus width="100%" height="100%" />
        </template>
      </Button>
    </div>

    <Popover
      v-if="editing && !isDragging && !isResizing"
      ref="camerasMenuRef"
      class="shadow-lg cui-rounded-corner"
      :auto-z-index="true"
      append-to="body"
      @show="camerasMenuOpen = true"
      @hide="camerasMenuOpenChange(false)"
    >
      <Tabs v-model:value="addMenuTab" class="shortcut-menu-tabs">
        <TabList :pt="{ content: { class: 'border-b border-color' } }">
          <Tab value="cameras" class="flex items-center gap-2 px-3 py-2">
            <i-mingcute:computer-camera-fill class="w-4 h-4" />
            <span class="text-sm">Cameras</span>
          </Tab>
          <Tab value="sensors" class="flex items-center gap-2 px-3 py-2">
            <i-lucide:settings-2 class="w-4 h-4" />
            <span class="text-sm">Sensors</span>
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel value="cameras">
            <div class="shortcut-menu">
              <div
                v-for="cam in availableCameras"
                :key="cam._id"
                class="shortcut-menu-item"
                :class="{ 'shortcut-menu-item-disabled': isCameraAlreadyAdded(cam) }"
                @click.prevent="!isCameraAlreadyAdded(cam) && add(cam)"
              >
                <CuiCameraSnapshot :camera="cam" width="100%" :loading="isLoading" />
                <div v-if="isCameraAlreadyAdded(cam)" class="shortcut-menu-item-overlay">
                  <i-lucide:check class="w-6 h-6 text-green-500" />
                </div>
              </div>
              <div v-if="availableCameras.length === 0" class="shortcut-menu-empty">No other cameras available</div>
            </div>
          </TabPanel>

          <TabPanel value="sensors">
            <div class="shortcut-menu-sensors">
              <template v-if="availableSensorsForShortcuts.length > 0">
                <template v-for="(sensor, index) in availableSensorsForShortcuts" :key="sensor.id">
                  <CuiListItem
                    :disabled="isSensorAlreadyAdded(sensor)"
                    @click="!isSensorAlreadyAdded(sensor) && addSensor(sensor)"
                    :button-props="{
                      pt: {
                        root: { class: 'p-0!' },
                      },
                    }"
                  >
                    <template #prepend>
                      <div class="sensor-menu-icon">
                        <i-lucide:door-closed v-if="sensor.type === SensorType.Contact" class="w-5 h-5" />
                        <i-lucide:thermometer v-else-if="sensor.type === SensorType.Temperature" class="w-5 h-5" />
                        <i-lucide:droplets v-else-if="sensor.type === SensorType.Humidity" class="w-5 h-5" />
                        <i-mdi:motion-sensor v-else-if="sensor.type === SensorType.Occupancy" class="w-5 h-5" />
                        <i-mdi:smoke-detector-variant v-else-if="sensor.type === SensorType.Smoke" class="w-5 h-5" />
                        <i-mdi:water-alert v-else-if="sensor.type === SensorType.Leak" class="w-5 h-5" />
                        <i-lucide:lightbulb v-else-if="sensor.type === SensorType.Light" class="w-5 h-5" />
                        <i-lucide:power v-else-if="sensor.type === SensorType.Switch" class="w-5 h-5" />
                        <i-mdi:alarm-light v-else-if="sensor.type === SensorType.Siren" class="w-5 h-5" />
                        <i-mdi:lock v-else-if="sensor.type === SensorType.Lock" class="w-5 h-5" />
                        <i-mdi:garage-variant v-else-if="sensor.type === SensorType.Garage" class="w-5 h-5" />
                        <i-mdi:doorbell v-else-if="sensor.type === SensorType.Doorbell" class="w-5 h-5" />
                        <i-mdi:shield-check v-else-if="sensor.type === SensorType.SecuritySystem" class="w-5 h-5" />
                        <i-mdi:battery v-else-if="sensor.type === SensorType.Battery" class="w-5 h-5" />
                      </div>
                    </template>

                    {{ sensor.displayName.value }}

                    <template #subtitle>
                      {{ getSensorTypeName(sensor.type) }}
                    </template>

                    <template v-if="isSensorAlreadyAdded(sensor)" #append>
                      <i-lucide:check class="w-4 h-4 text-green-500" />
                    </template>
                  </CuiListItem>
                  <Divider v-if="index < availableSensorsForShortcuts.length - 1" class="!my-1" />
                </template>
              </template>
              <div v-else class="shortcut-menu-empty">No sensors available</div>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import {
  isReactiveBatteryInfo,
  isReactiveContactSensor,
  isReactiveDoorbellTrigger,
  isReactiveGarageControl,
  isReactiveHumidityInfo,
  isReactiveLeakSensor,
  isReactiveLightControl,
  isReactiveLockControl,
  isReactiveOccupancySensor,
  isReactiveSecuritySystem,
  isReactiveSirenControl,
  isReactiveSmokeSensor,
  isReactiveTemperatureInfo,
  useCameraUi,
  useSensors,
} from '@camera.ui/browser';
import { createNvrPlayback, NvrPlaybackKey, playheadUs, useNvrCtx } from '@camera.ui/nvr';
import { BatteryProperty, ChargingState, SecuritySystemProperty, SecuritySystemState, SensorType } from '@camera.ui/sdk';
import { vElementHover, vOnLongPress } from '@vueuse/components';
import Draggabilly from 'draggabilly';

import { CamerasQuery, getCameraFn } from '@/api/routes/cameras.js';
import { UsersQuery } from '@/api/routes/users.js';
import { deepToRaw } from '@/common/utils.js';

import { securityState, sensorIcon, sensorState, sensorTone, setSecurityState, toggleSensor as toggleSharedSensor } from '@/components/CuiSensors/display.js';
import { INFO_SENSOR_TYPES, SENSOR_READONLY_TYPES, SENSOR_SHORTCUTABLE_TYPES } from './types.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { NvrPlayback } from '@camera.ui/nvr';
import type { DBCamera, DBCameraShortcut, DBSensorShortcut, DBShortcut, SensorShortcutType } from '@shared/types';
import type { Popover } from 'primevue';
import type { CuiShortcutsProps, ResolvedSensorShortcut } from './types.js';

const camerasQuery = new CamerasQuery();
const usersQuery = new UsersQuery();

const props = defineProps<CuiShortcutsProps>();

const log = useLogger();
const router = useRouter();

const { cameraName, visible, editing, interactionLocked } = toRefs(props);

const { camera: cameraDevice } = useCameraById(cameraName);
const { sensors: allSensors } = useSensors(cameraDevice);
const cameraUi = useCameraUi();
const nvrCtx = useNvrCtx();
const canControlSensors = hasPermission(undefined, 'admin');
const parentNvr = inject(NvrPlaybackKey, undefined);

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

camerasQuery.toggleQueryActivator('getCamerasQuery', false);

const { data: camera, isBusy: cameraLoading } = camerasQuery.getCameraQuery(cameraName);
const { data: cameras, isBusy: camerasLoading } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });
const { data: shortcutsList, isBusy: shortcutsLoading } = usersQuery.getShortcutsQuery(user.value?.username || '', cameraName);
const { mutate: patchShortcut, isPending: patchShortcutLoading } = usersQuery.patchShortcutQuery();
const { mutate: addShortcut, isPending: addShortcutLoading } = usersQuery.createShortcutQuery();
const { mutate: removeShortcut, isPending: removeShortcutLoading } = usersQuery.removeShortcutQuery();

// Follower NVR controllers — one per shortcut, created on demand.
const followerControllers = new Map<string, NvrPlayback>();

const placeholderRef = useTemplateRef('placeholderRef');
const shortcutContainerRef = useTemplateRef('shortcutContainerRef');
const camerasMenuRef = useTemplateRef<InstanceType<typeof Popover>>('camerasMenuRef');
const shortcutElementRefs = shallowRef<{ [key: string]: HTMLElement | Element | ComponentPublicInstance }>({});
const previewMenuRefs = shallowRef<{ [key: string]: InstanceType<typeof Popover> | null }>({});
const securitySystemMenuRefs = shallowRef<{ [key: string]: InstanceType<typeof Popover> | null }>({});
const draggies = shallowRef<{ [key: string]: Draggabilly }>({});
const draggablePositions = ref<{ [key: string]: { x: number; y: number } }>({});
const isDragging = ref(false);
const placeholderPosition = ref<{ x: number; y: number } | undefined>();
const placeholderActive = ref(false);
const isResizing = ref(false);
const shortcuts = ref<DBShortcut[]>([]);
const isHoveringMap = ref<{ [key: string]: boolean }>({});
const camerasMenuOpen = ref(false);
const addMenuTab = ref<'cameras' | 'sensors'>('cameras');
const longPressTriggeredMap = ref<{ [key: string]: boolean }>({});
const removingShortcuts = ref<Set<string>>(new Set());

const shortcutContainerSize = useElementSize(shortcutContainerRef);

const isNvrActive = computed(() => parentNvr?.isActive.value ?? false);
const cameraShortcuts = computed(() => shortcuts.value.filter((s): s is DBCameraShortcut => s.type === 'camera'));
const sensorShortcuts = computed(() => shortcuts.value.filter((s): s is DBSensorShortcut => s.type === 'sensor'));

const availableSensorsForShortcuts = computed(() => {
  return allSensors.value.filter(
    (s) =>
      isReactiveContactSensor(s) ||
      isReactiveTemperatureInfo(s) ||
      isReactiveHumidityInfo(s) ||
      isReactiveOccupancySensor(s) ||
      isReactiveSmokeSensor(s) ||
      isReactiveLeakSensor(s) ||
      isReactiveLightControl(s) ||
      isReactiveLockControl(s) ||
      isReactiveGarageControl(s) ||
      s.type === SensorType.Switch ||
      isReactiveSirenControl(s) ||
      isReactiveDoorbellTrigger(s) ||
      isReactiveSecuritySystem(s) ||
      isReactiveBatteryInfo(s),
  );
});

const resolvedSensorShortcuts = computed<ResolvedSensorShortcut[]>(() => {
  const currentSensors = allSensors.value;
  const list = sensorShortcuts.value;

  return list.map((shortcut) => {
    const sensor = currentSensors.find((s) => s.id === shortcut.sensorId);
    return {
      shortcut,
      sensor,
      isOnline: !!sensor,
    };
  });
});

const isLoading = computed(
  () => cameraLoading.value || shortcutsLoading.value || patchShortcutLoading.value || camerasLoading.value || addShortcutLoading.value || removeShortcutLoading.value,
);

const availableCameras = computed(() => {
  if (cameras.value?.result) {
    return cameras.value.result.filter((cam) => cam.name !== cameraName.value);
  }

  return [];
});

const username = computed(() => user.value?.username ?? '');

const activeHoveredShortcut = computed(() => {
  if (!isNvrActive.value) return undefined;
  return cameraShortcuts.value.find((s) => isHoveringMap.value[s._id]);
});

function getOrCreateFollower(shortcut: DBCameraShortcut): NvrPlayback {
  let ctrl = followerControllers.get(shortcut._id);
  if (ctrl) return ctrl;
  ctrl = createNvrPlayback(
    computed(() => shortcut.cameraId),
    { managed: true, sourceRole: 'scrub', cameraUi, nvrCtx },
  );
  followerControllers.set(shortcut._id, ctrl);
  return ctrl;
}

function isSensorAlreadyAdded(sensor: ReactiveSensor): boolean {
  return sensorShortcuts.value.some((shortcut) => shortcut.sensorId === sensor.id);
}

function isCameraAlreadyAdded(cam: DBCamera): boolean {
  return cameraShortcuts.value.some((shortcut) => shortcut.cameraId === cam._id);
}

function getSensorTypeName(type: SensorType): string {
  switch (type) {
    case SensorType.Contact:
      return 'Contact Sensor';
    case SensorType.Light:
      return 'Light';
    case SensorType.Switch:
      return 'Switch';
    case SensorType.Siren:
      return 'Siren';
    case SensorType.Lock:
      return 'Lock';
    case SensorType.Temperature:
      return 'Temperature';
    case SensorType.Humidity:
      return 'Humidity';
    case SensorType.Occupancy:
      return 'Occupancy';
    case SensorType.Smoke:
      return 'Smoke Sensor';
    case SensorType.Leak:
      return 'Leak Sensor';
    case SensorType.Garage:
      return 'Garage';
    case SensorType.Doorbell:
      return 'Doorbell';
    case SensorType.SecuritySystem:
      return 'Security System';
    case SensorType.Battery:
      return 'Battery';
    default:
      return 'Sensor';
  }
}

function mapSensorTypeToShortcutType(type: SensorType): SensorShortcutType {
  const shortcut = String(type) as SensorShortcutType;
  return SENSOR_SHORTCUTABLE_TYPES.has(shortcut) ? shortcut : 'contact';
}

async function toggleSensor(resolved: ResolvedSensorShortcut): Promise<void> {
  if (!canControlSensors) return;

  try {
    await toggleSharedSensor(allSensors.value.find((sensor) => sensor.id === resolved.shortcut.sensorId));
  } catch (error) {
    log.error('Failed to toggle sensor:', error);
  }
}

async function setSecuritySystemState(resolved: ResolvedSensorShortcut, state: SecuritySystemState): Promise<void> {
  if (!canControlSensors) return;

  try {
    await setSecurityState(
      allSensors.value.find((sensor) => sensor.id === resolved.shortcut.sensorId),
      state,
    );
  } catch (error) {
    log.error('Failed to set security system state:', error);
  }
}

function isSecuritySystemStateActive(sensor: ReactiveSensor | undefined, state: SecuritySystemState): boolean {
  if (!sensor || !isReactiveSecuritySystem(sensor)) return false;
  return sensor.getProperty(SecuritySystemProperty.TargetState) === state;
}

// Falls back to TargetState if currentState is unset (fresh sensor without state writes).

function securitySystemMenuRef(el: any, id: string): void {
  if (el) securitySystemMenuRefs.value[id] = el;
}

function isInfoSensorType(type: SensorShortcutType): boolean {
  return INFO_SENSOR_TYPES.has(type);
}

function getSecuritySystemStateLabel(sensor: ReactiveSensor | undefined): string {
  if (!sensor || !isReactiveSecuritySystem(sensor)) return '--';
  const state = sensor.getProperty(SecuritySystemProperty.TargetState);
  switch (state) {
    case SecuritySystemState.Disarmed:
      return 'Disarmed';
    case SecuritySystemState.StayArm:
      return 'Stay Arm';
    case SecuritySystemState.AwayArm:
      return 'Away Arm';
    case SecuritySystemState.NightArm:
      return 'Night Arm';
    case SecuritySystemState.AlarmTriggered:
      return 'ALARM';
    default:
      return '--';
  }
}

function getBatteryStatusLabel(sensor: ReactiveSensor | undefined): string {
  if (!sensor || !isReactiveBatteryInfo(sensor)) return '--';
  const level = sensor.getProperty(BatteryProperty.Level) ?? 0;
  const charging = sensor.getProperty(BatteryProperty.Charging);
  const chargingLabel = charging === ChargingState.Charging ? ' ⚡' : '';
  return `${level}%${chargingLabel}`;
}

// Bucket battery level into one of {0, 20, 40, 60, 80, 100} for icon selection.
// 0 maps to the alert icon (no `battery-0` exists in mdi).

// Color: red <15%, orange <30%, yellow <50%, green ≥50%. Charging always green
// regardless of level, to indicate "incoming power".

function onSensorClick(resolved: ResolvedSensorShortcut): void {
  if (SENSOR_READONLY_TYPES.has(resolved.shortcut.sensorType)) return;
  if (!canControlSensors) return;

  // SecuritySystem opens a popover with the 4 user-settable states.
  // Build a synthetic event with currentTarget = the shortcut's DOM element so
  // PrimeVue Popover positions itself relative to the icon.
  if (resolved.shortcut.sensorType === 'securitySystem') {
    const popover = securitySystemMenuRefs.value[resolved.shortcut._id];
    const target = shortcutElementRefs.value[resolved.shortcut._id] as HTMLElement | undefined;
    if (popover && target) {
      popover.toggle({ currentTarget: target } as unknown as Event);
    }
    return;
  }

  toggleSensor(resolved);
}

function onHover(id: string, isHovering: boolean): void {
  if (isDragging.value) return;

  camerasQuery.toggleQueryActivator('getCamerasQuery', isHovering);

  isHoveringMap.value[id] = isDragging.value ? false : isHovering;

  // Only close other popovers when hovering IN, not when leaving — prevents
  // delayed leave callbacks from closing newly opened popovers.
  if (isHovering) {
    Object.entries(isHoveringMap.value).forEach(([key, value]) => {
      if (key !== id && value) {
        isHoveringMap.value[key] = false;
      }
    });
  }
}

function onLongPressCallbackDirective(shortcut: DBCameraShortcut): void {
  if (!isDragging.value) {
    longPressTriggeredMap.value[shortcut._id] = true;
    remove(shortcut);
  }
}

function onMouseUpCallback(isLongPress: boolean, shortcut: DBCameraShortcut) {
  if (longPressTriggeredMap.value[shortcut._id]) {
    delete longPressTriggeredMap.value[shortcut._id];
    return;
  }

  if (!isLongPress) {
    if (!isHoveringMap.value[shortcut._id]) {
      onHover(shortcut._id, true);
    } else {
      // Capture NVR handoff timestamp before clearing hover (which stops preview).
      const nvrHandoffTs = isNvrActive.value && parentNvr ? Math.floor(playheadUs(parentNvr) / 1000) : undefined;
      onHover(shortcut._id, false);
      routeCamera(shortcut.cameraId, nvrHandoffTs);
    }
  }
}

function onSensorHover(id: string, isHovering: boolean): void {
  if (isDragging.value) return;
  isHoveringMap.value[id] = isDragging.value ? false : isHovering;

  if (isHovering) {
    Object.entries(isHoveringMap.value).forEach(([key, value]) => {
      if (key !== id && value) {
        isHoveringMap.value[key] = false;
      }
    });
  }
}

function onSensorLongPress(shortcut: DBSensorShortcut): void {
  if (!isDragging.value) {
    longPressTriggeredMap.value[shortcut._id] = true;
    removeSensor(shortcut);
  }
}

function onSensorMouseUp(resolved: ResolvedSensorShortcut): void {
  if (longPressTriggeredMap.value[resolved.shortcut._id]) {
    delete longPressTriggeredMap.value[resolved.shortcut._id];
    return;
  }

  if (!isDragging.value) {
    if (!SENSOR_READONLY_TYPES.has(resolved.shortcut.sensorType) && canControlSensors) {
      onSensorClick(resolved);
    }
  }
}

function removeSensor(shortcut: DBSensorShortcut) {
  removingShortcuts.value.add(shortcut._id);

  previewMenuRefs.value[shortcut._id]?.hide();
  isHoveringMap.value[shortcut._id] = false;

  draggies.value[shortcut._id]?.destroy();
  delete draggies.value[shortcut._id];
  delete draggablePositions.value[shortcut._id];
  delete shortcutElementRefs.value[shortcut._id];

  removeShortcut(
    {
      username: username.value,
      cameraname: cameraName.value,
      shortcutid: shortcut._id,
    },
    {
      onSettled: () => {
        removingShortcuts.value.delete(shortcut._id);
      },
    },
  );
}

function updateDraggablePositions(): void {
  Object.entries(draggies.value).forEach(([shortcutId, draggie]) => {
    const container = shortcutContainerRef.value;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const shortcutRect = (draggie as any).element.getBoundingClientRect();

    const xPercent = ((shortcutRect.left - containerRect.left) / containerRect.width) * 100;
    const yPercent = ((shortcutRect.top - containerRect.top) / containerRect.height) * 100;

    draggablePositions.value[shortcutId] = {
      x: Math.max(0, Math.min(xPercent, 100)),
      y: Math.max(0, Math.min(yPercent, 100)),
    };
  });
}

function positionDraggables(): void {
  Object.entries(draggies.value).forEach(([shortcutId, draggie]) => {
    const position = draggablePositions.value[shortcutId];
    if (!position) return;

    const container = shortcutContainerRef.value;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const shortcutRect = (draggie as any).element.getBoundingClientRect();

    const maxX = containerRect.width - shortcutRect.width;
    const maxY = containerRect.height - shortcutRect.height;

    const xPixel = Math.max(0, Math.min((position.x / 100) * containerRect.width, maxX));
    const yPixel = Math.max(0, Math.min((position.y / 100) * containerRect.height, maxY));

    draggie.setPosition(xPixel, yPixel);
  });

  isResizing.value = false;
}

function correctPositionsAfterResize(): void {
  Object.entries(draggablePositions.value).forEach(([shortcutId, position]) => {
    draggablePositions.value[shortcutId] = {
      x: Math.max(0, Math.min(position.x, 100)),
      y: Math.max(0, Math.min(position.y, 100)),
    };
  });
  positionDraggables();
}

function initDraggables(): void {
  for (const [shortcutId, draggie] of Object.entries(draggies.value)) {
    if (!shortcuts.value.find((s) => s._id === shortcutId)) {
      draggie.destroy();
      delete draggies.value[shortcutId];
      delete draggablePositions.value[shortcutId];
    }
  }

  for (const [shortcutId] of Object.entries(draggablePositions.value)) {
    if (!shortcuts.value.find((s) => s._id === shortcutId)) {
      delete draggablePositions.value[shortcutId];
    }
  }

  for (const [shortcutId, element] of Object.entries(shortcutElementRefs.value)) {
    const shortcut = shortcuts.value.find((s) => s._id === shortcutId);

    if (element && shortcut && shortcutContainerRef.value) {
      if (draggies.value[shortcut._id]) {
        draggies.value[shortcut._id].destroy();
      }

      const draggie = new Draggabilly(element as Element, {
        containment: shortcutContainerRef.value as Element,
      });

      // Lock dragging while the parent stream is zoomed — coordinate spaces
      // diverge during pan/zoom and saved %-positions would otherwise drift.
      if (interactionLocked.value) {
        draggie.disable();
      }

      draggies.value[shortcut._id] = draggie;

      const [xPercent, yPercent] = shortcut.points;
      const containerRect = shortcutContainerRef.value.getBoundingClientRect();

      const xPixel = (xPercent / 100) * containerRect.width;
      const yPixel = (yPercent / 100) * containerRect.height;
      draggie.setPosition(xPixel, yPixel);

      draggablePositions.value[shortcut._id] = { x: xPercent, y: yPercent };

      draggie.on('dragMove', () => {
        isDragging.value = true;
        const popover = previewMenuRefs.value[shortcutId];
        popover?.alignOverlay();
      });

      draggie.on('dragEnd', () => {
        setTimeout(() => {
          isDragging.value = false;
        }, 50);

        updateDraggablePositions();
        const position = draggablePositions.value[shortcut._id];

        patchShortcut({
          username: username.value,
          cameraname: cameraName.value,
          shortcutid: shortcut._id,
          shortcutData: {
            points: [position.x, position.y],
          },
        });
      });
    }
  }

  positionDraggables();
}

function makeDraggable(e: MouseEvent): void {
  if (!editing.value || !shortcutContainerRef.value) {
    return;
  }

  // Block new-shortcut placement while the stream is zoomed in — click coords
  // wouldn't map cleanly to the unscaled %-space the shortcut is saved in.
  if (interactionLocked.value) {
    return;
  }

  // Keep the popover open while placing the new shortcut.
  placeholderActive.value = true;

  const containerRect = shortcutContainerRef.value.getBoundingClientRect();
  const elementWidth = 35;
  const elementHeight = 35;

  placeholderPosition.value = {
    x: Math.max(0, Math.min(e.clientX - containerRect.left - elementWidth / 2, containerRect.width - elementWidth)),
    y: Math.max(0, Math.min(e.clientY - containerRect.top - elementHeight / 2, containerRect.height - elementHeight)),
  };
}

async function add(cam: DBCamera): Promise<void> {
  if (!placeholderRef.value || !shortcutContainerRef.value) {
    return;
  }

  const container = shortcutContainerRef.value;
  const element = placeholderRef.value;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const xPixel = elementRect.left - containerRect.left;
  const yPixel = elementRect.top - containerRect.top;

  const xPercent = (xPixel / containerRect.width) * 100;
  const yPercent = (yPixel / containerRect.height) * 100;

  addShortcut(
    {
      username: username.value,
      cameraname: cameraName.value,
      shortcutData: {
        _id: '',
        type: 'camera',
        points: [xPercent, yPercent],
        cameraId: cam._id,
      },
    },
    {
      onSettled: () => {
        placeholderActive.value = false;
        placeholderPosition.value = undefined;
        camerasMenuRef.value?.hide();
      },
    },
  );
}

async function addSensor(sensor: ReactiveSensor): Promise<void> {
  if (!placeholderRef.value || !shortcutContainerRef.value) {
    return;
  }

  const container = shortcutContainerRef.value;
  const element = placeholderRef.value;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const xPixel = elementRect.left - containerRect.left;
  const yPixel = elementRect.top - containerRect.top;

  const xPercent = (xPixel / containerRect.width) * 100;
  const yPercent = (yPixel / containerRect.height) * 100;

  addShortcut(
    {
      username: username.value,
      cameraname: cameraName.value,
      shortcutData: {
        _id: '',
        type: 'sensor',
        points: [xPercent, yPercent],
        sensorId: sensor.id,
        sensorType: mapSensorTypeToShortcutType(sensor.type),
      },
    },
    {
      onSettled: () => {
        placeholderActive.value = false;
        placeholderPosition.value = undefined;
        camerasMenuRef.value?.hide();
      },
    },
  );
}

function remove(shortcut: DBCameraShortcut) {
  removingShortcuts.value.add(shortcut._id);

  previewMenuRefs.value[shortcut._id]?.hide();
  isHoveringMap.value[shortcut._id] = false;

  draggies.value[shortcut._id]?.destroy();
  delete draggies.value[shortcut._id];
  delete draggablePositions.value[shortcut._id];
  delete shortcutElementRefs.value[shortcut._id];

  removeShortcut(
    {
      username: username.value,
      cameraname: cameraName.value,
      shortcutid: shortcut._id,
    },
    {
      onSettled: () => {
        removingShortcuts.value.delete(shortcut._id);
      },
    },
  );
}

function functionRef(el: HTMLElement, id: string): void {
  shortcutElementRefs.value[id] = el;
}

function previewMenuRef(el: InstanceType<typeof Popover>, id: string): void {
  previewMenuRefs.value[id] = el;
}

async function routeCamera(cameraId: string, nvrHandoffTs?: number): Promise<void> {
  if (isDragging.value) {
    return;
  }

  const abortController = new AbortController();
  const cam = await getCameraFn({ cameraname: cameraId, signal: abortController.signal });
  const camName = cam.name;

  if (camName) {
    if (nvrHandoffTs !== undefined) {
      router.push({ path: `/cameras/${camName}`, query: { startTs: String(nvrHandoffTs) } });
    } else {
      router.push(`/cameras/${camName}`);
    }
  }
}

function camerasMenuOpenChange(state: boolean) {
  if (!state && !placeholderActive.value) {
    placeholderPosition.value = undefined;
  }
  camerasMenuOpen.value = state;
  camerasQuery.toggleQueryActivator('getCamerasQuery', state);
}

watch(
  [shortcutsList, camera],
  () => {
    if (shortcutsList.value && camera.value) {
      shortcuts.value = deepToRaw(shortcutsList.value);
    }
  },
  { immediate: true, deep: true },
);

watch([shortcutContainerSize.width, shortcutContainerSize.height], () => {
  isResizing.value = true;

  nextTick(() => {
    correctPositionsAfterResize();
  });
});

watch(
  shortcuts,
  () => {
    nextTick(() => {
      initDraggables();
    });
  },
  { deep: true, immediate: true },
);

watch(isResizing, (resizing) => {
  if (resizing) {
    placeholderPosition.value = undefined;
  }
});

watch(
  [placeholderRef, placeholderPosition],
  ([el, position]) => {
    if (el && position) {
      // Delay to ensure DOM is updated before showing the popover.
      setTimeout(() => {
        camerasMenuRef.value?.show({ currentTarget: el } as any);
      }, 50);
    }
  },
  { deep: true },
);

watch(
  isHoveringMap,
  () => {
    Object.entries(isHoveringMap.value).forEach(([key, value]) => {
      if (value && previewMenuRefs.value[key]) {
        const el = shortcutElementRefs.value[key];
        if (el) previewMenuRefs.value[key]?.show({ currentTarget: el } as any);
      } else {
        previewMenuRefs.value[key]?.hide();
      }
    });
  },
  { deep: true },
);

watch(visible, (isVisible) => {
  if (!isVisible) {
    Object.values(previewMenuRefs.value).forEach((p) => p?.hide());
    Object.keys(isHoveringMap.value).forEach((key) => {
      isHoveringMap.value[key] = false;
    });
  }
});

watch(editing, (isEditing) => {
  if (!isEditing) {
    placeholderPosition.value = undefined;
    placeholderActive.value = false;
    camerasMenuRef.value?.hide();
  }
});

// Toggle Draggabilly on every shortcut when the parent stream zoom-state
// changes. Disable while zoomed in (coordinate spaces diverge), re-enable
// when back at zoom=1. Also clear any pending placeholder.
watch(interactionLocked, (locked) => {
  Object.values(draggies.value).forEach((draggie) => {
    if (locked) {
      draggie.disable();
    } else {
      draggie.enable();
    }
  });
  if (locked) {
    placeholderPosition.value = undefined;
    placeholderActive.value = false;
  }
});

watch(activeHoveredShortcut, (shortcut, oldShortcut) => {
  if (oldShortcut) {
    followerControllers.get(oldShortcut._id)?.stop();
  }
  if (shortcut && parentNvr && isNvrActive.value) {
    const ctrl = getOrCreateFollower(shortcut);
    ctrl.setSpeed(parentNvr.speed.value);
    ctrl.play(playheadUs(parentNvr), true);
  }
});

watch(
  () => parentNvr?.mode.value,
  (mode) => {
    if (!activeHoveredShortcut.value || !parentNvr) return;
    const ctrl = followerControllers.get(activeHoveredShortcut.value._id);
    if (!ctrl) return;
    switch (mode) {
      case 'idle':
        ctrl.stop();
        break;
      case 'play':
        ctrl.play(playheadUs(parentNvr), true);
        break;
      case 'pause':
        ctrl.pause();
        break;
    }
  },
);

watch(
  () => parentNvr?.currentTimestamp.value,
  (ts) => {
    if (!activeHoveredShortcut.value || !parentNvr || !ts) return;
    if (parentNvr.mode.value === 'scrub') {
      const ctrl = followerControllers.get(activeHoveredShortcut.value._id);
      ctrl?.scrub(ts, true);
    }
  },
);

watch(
  () => parentNvr?.speed.value,
  (speed) => {
    if (!activeHoveredShortcut.value || !speed) return;
    const ctrl = followerControllers.get(activeHoveredShortcut.value._id);
    ctrl?.setSpeed(speed);
  },
);

onBeforeUpdate(() => {
  shortcutElementRefs.value = {};
});

onMounted(() => {
  nextTick(() => {
    initDraggables();
  });
});

onUnmounted(() => {
  Object.values(draggies.value).forEach((draggie) => draggie.destroy());
});
</script>

<style scoped>
.shortcut-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 1;
  transition: opacity 0.15s ease;
}

.shortcut-container.hidden {
  opacity: 0;
  pointer-events: none;
}

.draggable {
  background: transparent !important;
}

.draggable.is-dragging {
  opacity: 0.7;
}

.snapshot-hover-container {
  width: 250px;
  background: #000;
}

.shortcut-menu {
  width: 100%;
  height: 100%;
  background: var(--background-card);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(1, 1fr);
  gap: 10px;
  padding: 10px;
}

.shortcut-menu-item {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000000;
  border-radius: 5px;
  overflow: hidden;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.shortcut-menu-item-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.shortcut-menu-item-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

/* Sensor Shortcut Styles */
.sensor-shortcut {
  transition: opacity 0.2s ease;
}

.sensor-shortcut.sensor-offline {
  opacity: 0.5;
}

.sensor-shortcut.sensor-readonly {
  cursor: default;
}

.sensor-tooltip {
  text-align: center;
  min-width: 80px;
}

.sensor-tooltip-name {
  font-weight: 600;
  font-size: 0.875rem;
  margin-bottom: 4px;
}

.sensor-tooltip-status {
  font-size: 0.75rem;
}

.sensor-tooltip-offline {
  font-size: 0.75rem;
  margin-top: 4px;
}

/* Doorbell ring animation — applied to icon when ring=true */
.doorbell-shake {
  animation: doorbell-shake 0.15s ease-in-out infinite;
  transform-origin: center;
}

@keyframes doorbell-shake {
  0%,
  100% {
    transform: rotate(-15deg);
  }

  50% {
    transform: rotate(15deg);
  }
}

/* SecuritySystem state-picker popover buttons */
.security-state-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-color);
  cursor: pointer;
  text-align: left;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.security-state-button:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.06));
}

.security-state-button--active {
  background: rgba(168, 85, 247, 0.15);
  border-color: rgba(168, 85, 247, 0.5);
  color: rgb(168, 85, 247);
}

/* SecuritySystem alarm-triggered icon — red pulse */
.security-alarm-pulse {
  animation: security-alarm-pulse 0.8s ease-in-out infinite alternate;
}

@keyframes security-alarm-pulse {
  from {
    opacity: 1;
    filter: drop-shadow(0 0 6px rgba(239, 68, 68, 0.6));
  }

  to {
    opacity: 0.6;
    filter: drop-shadow(0 0 14px rgba(239, 68, 68, 1));
  }
}

/* Shortcut Menu Tabs */
.shortcut-menu-tabs {
  width: 240px;
}

.shortcut-menu-tabs :deep(.p-tablist-tab-list) {
  background: transparent;
  display: flex;
  width: 100%;
}

.shortcut-menu-tabs :deep(.p-tab) {
  flex: 1;
  justify-content: center;
}

.shortcut-menu-tabs :deep(.p-tabpanels) {
  padding: 0;
  padding-top: 10px;
}

.shortcut-menu-empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-secondary);
  padding: 20px 10px;
  font-size: 0.875rem;
}

.shortcut-menu-sensors {
  display: flex;
  flex-direction: column;
  max-height: 200px;
  overflow-y: auto;
  padding: 0px;
}

.sensor-menu-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface-border);
  flex-shrink: 0;
}
</style>
