<template>
  <div ref="hostRef" class="home" :class="{ 'home--saving': saving }">
    <div ref="innerRef" class="home__inner" :style="{ maxWidth: `${homeMaxWidth(breakpoint)}px` }">
      <div v-if="!compact" :style="editing ? { height: `${chromeHeight}px` } : undefined">
        <div
          ref="chromeRef"
          class="home__chrome"
          :class="{ 'home__chrome--pinned': editing }"
          :style="editing ? { left: `${innerLeft}px`, width: `${innerWidth}px` } : undefined"
        >
          <CuiHomeHeader
            v-model:page="pageId"
            :pages="tabs"
            :profile="switcher"
            :editing
            :saving
            :panel-open="panelOpen"
            @edit="startEdit"
            @cancel="cancelEdit"
            @done="finishEdit"
            @panel="panelOpen = !panelOpen"
            @arrange="arrange"
            @reorder="roomsDraft = $event"
            @hide="hideRoom"
          />
        </div>
      </div>

      <CuiHomeDock v-if="breakpoint === 'sm'" v-model:order="dockOrder" :cameras :tiles :room-names="roomNames" :editing :inert="saving" inline />

      <CuiHomeSkeleton v-if="!showContent" :columns :gap />
      <template v-else>
        <span v-if="!entries.length && !editing" class="block text-muted text-sm text-center py-16">
          {{ t('views.home_dashboard.empty') }}
        </span>
        <CuiHomeGrid
          :key="pageId"
          ref="gridRef"
          class="home__grid"
          :items="gridItems"
          :columns
          :gap
          :editing
          :group-action="groupAction"
          :inert="saving"
          @layout="onLayout"
          @drop="dropIn"
          @group="joinGroup"
        >
          <template #default="{ item }">
            <CuiHomeWidget
              :entry="entryById.get(item.id)!"
              :size="item"
              :sizes="item.sizes"
              :editing
              :cameras
              :pages="tabs"
              :room-names="roomNames"
              :detections
              :activity
              @remove="remove(item.id)"
              @resize="gridRef?.settle(item.id, $event)"
              @update="update(item.id, $event)"
              @take="takeOut(item.id, $event)"
              @dissolve="dissolve(item.id)"
            />
          </template>
        </CuiHomeGrid>
      </template>

      <CuiHomeDock v-if="breakpoint !== 'sm'" v-model:order="dockOrder" :cameras :tiles :room-names="roomNames" :editing :inert="saving" :inline="false" />
    </div>

    <CuiHomeEditPanel
      v-if="draft"
      v-model="panelOpen"
      :page="draft"
      :sections
      :breakpoint
      :floating="breakpoint !== 'sm'"
      :right="panelRight"
      :top="chromeBottom"
      @add="add"
      @auto-add="draft.autoAdd = $event"
      @clear="clearPage"
      @reset="resetPage"
    />

    <template v-if="compact">
      <CuiTopbarSlot position="left">
        <div class="flex items-center min-w-0">
          <CuiInstanceSwitcher v-if="hasPermission(undefined, 'admin') && isMultiInstance" />
          <CuiHomeRoomMenu v-model:page="pageId" :pages="tabs" :editing @reorder="roomsDraft = $event" @hide="hideRoom" />
        </div>
      </CuiTopbarSlot>
      <CuiHomeActions
        :profile="switcher"
        :editing
        :saving
        :panel-open="panelOpen"
        @edit="startEdit"
        @cancel="cancelEdit"
        @done="finishEdit"
        @panel="panelOpen = !panelOpen"
        @arrange="arrange"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { useRecordingExport } from '@camera.ui/nvr';
import { SensorType } from '@camera.ui/sdk';
import { HOME_ACTIONS } from '@shared/types';
import AutoIcon from '~icons/mdi/auto-mode';
import DeleteIcon from '~icons/mdi/delete-outline';
import PencilIcon from '~icons/mdi/pencil-outline';
import PinIcon from '~icons/mdi/pin-outline';
import PlusIcon from '~icons/mdi/plus';

import { sensorIcon } from '@/common/sensorDisplay.js';
import { randomId } from '@/common/utils.js';
import HomeProfileDialog from '@/components/CuiDialog/templates/HomeProfile/HomeProfile.vue';

import { allowedActions, HOME_ACTION_LOOKS } from './actions.js';
import CuiHomeActions from './CuiHomeActions.vue';
import CuiHomeDock from './CuiHomeDock.vue';
import CuiHomeEditPanel from './CuiHomeEditPanel.vue';
import CuiHomeGrid from './CuiHomeGrid.vue';
import CuiHomeHeader from './CuiHomeHeader.vue';
import CuiHomeRoomMenu from './CuiHomeRoomMenu.vue';
import CuiHomeSkeleton from './CuiHomeSkeleton.vue';
import CuiHomeWidget from './CuiHomeWidget.vue';
import { groupDesign } from './groupDesigns.js';
import { autoWidgets, compareSensors, HOME_ICONS, HOME_PAGE, homeWidget, tileSpec } from './home.js';
import {
  arrangeWidgets,
  byPosition,
  cameraSpec,
  closeGap,
  fitRange,
  freeSpot,
  HOME_COLUMNS,
  HOME_SPECS,
  homeBreakpoint,
  homeGap,
  homeMaxWidth,
  placeWidgets,
  sizeOptions,
} from './layout.js';
import { useHomeProfiles } from './useHomeProfiles.js';
import { useHomeData } from './useHomeData.js';
import { useHomeDetections } from './useHomeDetections.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type {
  DBCamera,
  DBHomeAction,
  DBHomeBreakpoint,
  DBHomeDockKey,
  DBHomePage,
  DBHomeProfile,
  DBHomeProfileRule,
  DBHomeWidget,
  DBHomeWidgetKind,
  DBHomeWidgetPosition,
} from '@shared/types';
import type { Component } from 'vue';
import type { HomeProfileProps, HomeProfileResult } from '@/components/CuiDialog/templates/HomeProfile/types.js';
import type { MenuItem } from '../CuiMenu/types.js';
import type {
  HomeCellPosition,
  HomeCellSize,
  HomeEntry,
  HomeGridItem,
  HomeGroupDesign,
  HomeLibraryItem,
  HomeLibrarySection,
  HomePageContent,
  HomePageTab,
  HomeWidgetPatch,
  HomeWidgetSpec,
} from './types.js';

const route = useRoute();
const router = useRouter();
const { t, te } = useI18n();
const toast = useCuiToast();
const dialog = useCuiDialog();

const { cameras, tiles, devices, batteries, rooms, roomNames, scenes, levels, activity, waiting, ready } = useHomeData();
const { latest: detections } = useHomeDetections(() => cameras.value);
const { active: kiosk } = useKioskMode();
const { smBreakpoint: compact } = useSharedCuiBreakpoint();
const { isAvailable: hasNvr } = useRecordingExport();

const { isMultiInstance } = storeToRefs(useInstanceStore());

const admin = hasPermission(undefined, 'admin');

const hostRef = useTemplateRef<HTMLDivElement>('hostRef');
const innerRef = useTemplateRef<HTMLDivElement>('innerRef');
const chromeRef = useTemplateRef<HTMLDivElement>('chromeRef');
const gridRef = useTemplateRef<InstanceType<typeof CuiHomeGrid>>('gridRef');
const drafts = ref<Record<string, DBHomePage>>();
const dockDraft = ref<DBHomeDockKey[]>();
const roomsDraft = ref<string[]>();
const hiddenRoomsDraft = ref<string[]>();
const saving = ref(false);
const panelOpen = ref(false);
const freshIds = ref(newIds());
const held = ref<{ breakpoint: DBHomeBreakpoint; window: number }>();
const showContent = ref(false);

const { width } = useElementSize(hostRef);
const { left: innerLeft, right: innerRight, width: innerWidth } = useElementBounding(innerRef);
const { bottom: chromeBottom } = useElementBounding(chromeRef);
const { height: chromeHeight } = useElementSize(chromeRef);
const { width: windowWidth, height: windowHeight } = useWindowSize({ includeScrollbar: false });
const { profiles, profile, pinned, automatic, loaded, save, remove: removeProfile, choose, hold } = useHomeProfiles(windowWidth, windowHeight);

const breakpoint = computed(() => (held.value?.window === windowWidth.value ? held.value.breakpoint : homeBreakpoint(width.value)));
const columns = computed(() => HOME_COLUMNS[breakpoint.value]);
const layoutKnown = computed(() => loaded.value && width.value > 0);
const gap = computed(() => homeGap(breakpoint.value));
const editing = computed(() => drafts.value !== undefined);
const switcher = computed(() => ({
  name: profileLabel(profile.value),
  pinned: pinned.value !== undefined,
  named: profiles.value.length > 1,
  items: profileItems.value,
}));
const profileItems = computed<MenuItem[]>(() => [
  {
    key: 'auto',
    position: 'header',
    icon: AutoIcon,
    label: t('views.home_dashboard.profile_auto'),
    description: t('views.home_dashboard.profile_auto_shows', { name: profileLabel(automatic.value) }),
    active: !pinned.value,
    onClick: () => choose(undefined),
  },
  ...profiles.value.map((entry, index) => ({
    key: entry.id,
    icon: PinIcon,
    label: profileLabel(entry),
    description: index ? (ruleLabel(entry.rule) ?? t('views.home_dashboard.profile_manual')) : t('views.home_dashboard.profile_default_hint'),
    active: pinned.value?.id === entry.id,
    actions: [
      { label: t('views.home_dashboard.profile_edit'), icon: PencilIcon, onClick: () => editProfile(entry) },
      ...(index ? [{ label: t('views.home_dashboard.profile_remove'), icon: DeleteIcon, onClick: () => confirmRemove(entry) }] : []),
    ],
    onClick: () => choose(entry.id),
  })),
  { key: 'new', position: 'footer', icon: PlusIcon, label: t('views.home_dashboard.profile_new'), onClick: createProfile },
]);
const panelRight = computed(() => windowWidth.value - innerRight.value);

const dockOrder = computed({
  get: () => (editing.value ? dockDraft.value : profile.value.dock),
  set: (order: DBHomeDockKey[] | undefined) => (dockDraft.value = order),
});

const roomOrder = computed(() => (editing.value ? roomsDraft.value : profile.value.rooms) ?? []);
const hiddenRooms = computed(() => (editing.value ? hiddenRoomsDraft.value : profile.value.hiddenRooms) ?? []);
const tabs = computed<HomePageTab[]>(() => {
  const rank = (id: string) => (roomOrder.value.includes(id) ? roomOrder.value.indexOf(id) : roomOrder.value.length);
  const sorted = rooms.value
    .map(({ id, name }) => ({ id, name, hidden: hiddenRooms.value.includes(id) }))
    .filter((tab) => editing.value || !tab.hidden)
    .sort((a, b) => rank(a.id) - rank(b.id));
  return [{ id: HOME_PAGE, name: t('views.home_dashboard.home') }, ...sorted];
});
const room = computed(() => rooms.value.find((entry) => entry.id === route.query.page && (editing.value || !hiddenRooms.value.includes(entry.id))));
const pageId = computed({
  get: () => room.value?.id ?? HOME_PAGE,
  set: (id: string) => router.replace({ query: { ...route.query, page: id === HOME_PAGE ? undefined : id } }),
});
const everything = computed<HomePageContent>(() => ({ cameras: cameras.value, tiles: tiles.value, batteries: batteries.value }));
const content = computed(() => room.value ?? everything.value);

const draft = computed(() => drafts.value?.[pageId.value]);
const page = computed<DBHomePage>(
  () => draft.value ?? profile.value.pages.find((entry) => entry.id === pageId.value) ?? { id: pageId.value, autoAdd: true, widgets: [], hidden: [] },
);
const layoutStored = computed(() => page.value.size === breakpoint.value && page.value.widgets.length > 0);

const camerasById = computed(() => new Map(cameras.value.map((camera) => [camera._id, camera])));
const tilesById = computed(() => new Map(tiles.value.map((sensor) => [sensor.id, sensor])));

const entries = computed<HomeEntry[]>(() => {
  const { widgets, hidden, autoAdd } = page.value;
  const known = new Set([...widgets.map((widget) => widget.id), ...hidden]);
  const added = autoAdd ? autoWidgets(pageId.value, content.value, rooms.value).filter((widget) => !known.has(widget.id)) : [];
  return [...widgets, ...added].flatMap((widget) => entryOf(widget) ?? []);
});
const entryById = computed(() => new Map(entries.value.map((entry) => [entry.widget.id, entry])));
const placed = computed(() => placeWidgets(entries.value, page.value.size, breakpoint.value));
const gridItems = computed<HomeGridItem[]>(() =>
  entries.value.map((entry) => ({
    id: entry.widget.id,
    ...placed.value.get(entry.widget.id)!,
    sizes: sizeOptions(entry.spec, breakpoint.value),
    range: entry.spec.range,
  })),
);

const sections = computed<HomeLibrarySection[]>(() => {
  const shown = new Set(entries.value.map((entry) => entry.widget.id));
  const item = (widget: DBHomeWidget, spec: HomeWidgetSpec, icon: Component, label: string, detail?: string): HomeLibraryItem => ({
    widget,
    spec,
    icon,
    label,
    detail,
    shown: shown.has(widget.id),
  });
  const roomOf = (roomId: string | null | undefined) => (roomId ? roomNames.value.get(roomId) : undefined);
  const roomRank = (sensor: ReactiveSensor) => (sensor.roomId.value === room.value?.id ? 0 : roomOf(sensor.roomId.value) ? 1 : 2);

  const lightCount = (roomId?: string) => lightsOf(roomId).length;
  const offeredActions = allowedActions(HOME_ACTIONS, admin).filter((action) => action !== 'recording' || hasNvr.value);
  const sceneSensors = tiles.value.filter((sensor) => sensor.type === SensorType.Scene);
  const deviceTiles = tiles.value
    .filter((sensor) => sensor.type !== SensorType.Scene)
    .sort((a, b) => roomRank(a) - roomRank(b) || (roomOf(a.roomId.value) ?? '').localeCompare(roomOf(b.roomId.value) ?? '') || compareSensors(a, b));

  const all: HomeLibrarySection[] = [
    {
      key: 'overview',
      label: t('views.home_dashboard.section_overview'),
      items: [
        item(homeWidget('notes'), HOME_SPECS.notes, HOME_ICONS.notes, t('views.home_dashboard.notes')),
        item(homeWidget('events'), HOME_SPECS.events, HOME_ICONS.events, t('views.home_dashboard.events')),
        item(homeWidget('clock', freshIds.value.clock), HOME_SPECS.clock, HOME_ICONS.clock, t('views.home_dashboard.clock')),
      ],
    },
    {
      key: 'cameras',
      label: t('views.home_dashboard.section_cameras'),
      items: cameras.value.map((camera) =>
        item(homeWidget('camera', camera._id), cameraSpec(camera.interfaceSettings?.aspectRatio), HOME_ICONS.camera, camera.name, roomOf(camera.roomId)),
      ),
    },
    {
      key: 'actions',
      label: t('views.home_dashboard.section_actions'),
      items: [
        ...offeredActions.map((action) =>
          item(
            actionWidget(freshIds.value[action], [action]),
            HOME_SPECS.action,
            HOME_ACTION_LOOKS[action].icon,
            t(`views.home_dashboard.actions.${action}.label`),
            room.value?.name ?? t('views.home_dashboard.actions.scope_all'),
          ),
        ),
        ...(offeredActions.length > 1
          ? [
              item(
                actionWidget(freshIds.value.group, offeredActions),
                HOME_SPECS.actionGroup,
                HOME_ICONS.action,
                t('views.home_dashboard.actions.group'),
                offeredActions.map((action) => t(`views.home_dashboard.actions.${action}.title`)).join(', '),
              ),
            ]
          : []),
      ],
    },
    {
      key: 'floorplan',
      label: t('views.home_dashboard.section_floorplan'),
      items: levels.value.map((level) =>
        item(homeWidget('floorplan', level.id), HOME_SPECS.floorplan, HOME_ICONS.floorplan, level.name, t('views.home_dashboard.floorplan')),
      ),
    },
    {
      key: 'groups',
      label: t('views.home_dashboard.section_groups'),
      items: [
        ...devices.value.map((device) =>
          item(
            homeWidget('group', `device:${device.id}`),
            HOME_SPECS.group,
            HOME_ICONS.group,
            device.name,
            t('views.home_dashboard.group_device', { count: device.sensors.length }, device.sensors.length),
          ),
        ),
        ...(lightCount()
          ? [
              item(
                homeWidget('lights'),
                HOME_SPECS.lights,
                HOME_ICONS.lights,
                t('views.home_dashboard.lights_all'),
                t('views.home_dashboard.lights_count', { count: lightCount() }, lightCount()),
              ),
              ...rooms.value
                .filter((entry) => lightCount(entry.id) && !hiddenRooms.value.includes(entry.id))
                .map((entry) =>
                  item(
                    homeWidget('lights', entry.id),
                    HOME_SPECS.lights,
                    HOME_ICONS.lights,
                    entry.name,
                    t('views.home_dashboard.lights_count', { count: lightCount(entry.id) }, lightCount(entry.id)),
                  ),
                ),
            ]
          : []),
      ],
    },
    {
      key: 'scenes',
      label: t('views.home_dashboard.section_scenes'),
      items: [
        ...scenes.value.map((automation) =>
          item(homeWidget('automation', automation._id), HOME_SPECS.automation, HOME_ICONS.automation, automation.name, t('views.home_dashboard.scene_automation')),
        ),
        ...sceneSensors.map((sensor) =>
          item(homeWidget('sensor', sensor.id), tileSpec(sensor.type), sensorIcon(sensor.type, sensor), sensor.displayName.value, roomOf(sensor.roomId.value)),
        ),
      ],
    },
    {
      key: 'devices',
      label: t('views.home_dashboard.section_devices'),
      items: deviceTiles.map((sensor) =>
        item(homeWidget('sensor', sensor.id), tileSpec(sensor.type), sensorIcon(sensor.type, sensor), sensor.displayName.value, roomOf(sensor.roomId.value)),
      ),
    },
  ];
  return all.filter((section) => section.items.length);
});

useTabSwipe(hostRef, (direction) => {
  if (editing.value) return;
  const index = tabs.value.findIndex((tab) => tab.id === pageId.value);
  const next = tabs.value[direction === 'right' ? index - 1 : index + 1];
  if (next) pageId.value = next.id;
});

function entryOf(widget: DBHomeWidget): HomeEntry | undefined {
  if (waitsFor(widget.kind)) return loadingEntry(widget);
  switch (widget.kind) {
    case 'camera': {
      const camera = camerasById.value.get(widget.ref ?? '');
      return camera && { widget, spec: cameraSpec(camera.interfaceSettings?.aspectRatio), kind: 'camera', camera, group: groupOf(camera, widget.cameras) };
    }
    case 'sensor': {
      const sensor = tilesById.value.get(widget.ref ?? '');
      return sensor && { widget, spec: tileSpec(sensor.type), kind: 'sensor', sensor };
    }
    case 'notes':
    case 'events': {
      const scope = widget.room ?? pageId.value;
      const scoped = rooms.value.find((entry) => entry.id === scope);
      return {
        widget,
        spec: HOME_SPECS[widget.kind],
        kind: widget.kind,
        content: scope === HOME_PAGE ? everything.value : (scoped ?? content.value),
        scope,
        room: scope === pageId.value ? undefined : scope === HOME_PAGE ? t('views.home_dashboard.scope_all') : scoped?.name,
      };
    }
    case 'lights': {
      const lights = lightsOf(widget.ref);
      return lights.length ? { widget, spec: HOME_SPECS.lights, kind: 'lights', lights, room: widget.ref && roomNames.value.get(widget.ref) } : undefined;
    }
    case 'automation': {
      const automation = scenes.value.find((entry) => entry._id === widget.ref);
      return automation && { widget, spec: HOME_SPECS.automation, kind: 'automation', automation };
    }
    case 'floorplan': {
      const level = levels.value.find((entry) => entry.id === widget.ref);
      return level && { widget, spec: HOME_SPECS.floorplan, kind: 'floorplan', level, hiddenRooms: hiddenRooms.value };
    }
    case 'clock':
      return { widget, spec: HOME_SPECS.clock, kind: 'clock' };
    case 'action': {
      const actions = allowedActions(widget.actions ?? [], admin);
      if (!actions.length) return undefined;
      const scope = widget.room ?? pageId.value;
      const area = scope === HOME_PAGE ? undefined : (rooms.value.find((entry) => entry.id === scope) ?? room.value);
      return {
        widget,
        spec: actions.length > 1 ? HOME_SPECS.actionGroup : HOME_SPECS.action,
        kind: 'action',
        actions,
        cameras: area?.cameras ?? cameras.value,
        scope,
        place: area?.name ?? t('views.home_dashboard.actions.scope_all'),
        all: !area,
      };
    }
    case 'group': {
      if (widget.sensors) {
        const members = widget.sensors.flatMap((id) => tilesById.value.get(id) ?? []);
        const design = designOf(members);
        return members.length
          ? { widget, spec: HOME_SPECS.group, kind: 'group', name: widget.name ?? designName(design, members), sensors: members, own: true, design }
          : undefined;
      }
      const device = devices.value.find((entry) => `device:${entry.id}` === widget.ref);
      return device && { widget, spec: HOME_SPECS.group, kind: 'group', name: device.name, sensors: device.sensors, own: false, design: designOf(device.sensors) };
    }
  }
}

function waitsFor(kind: DBHomeWidgetKind): boolean {
  const { cameras, sensors, rooms, automations } = waiting.value;
  if (kind === 'clock') return false;
  if (kind === 'camera') return cameras;
  if (kind === 'sensor' || kind === 'lights' || kind === 'group') return sensors;
  if (kind === 'automation') return automations;
  if (kind === 'floorplan') return rooms;
  return cameras || sensors || rooms;
}

function loadingEntry(widget: DBHomeWidget): HomeEntry {
  const { kind } = widget;
  const spec = kind === 'camera' ? cameraSpec() : kind === 'sensor' ? HOME_SPECS.smallTile : HOME_SPECS[kind];
  return { widget, spec, kind: 'loading' };
}

function designOf(sensors: ReactiveSensor[]): HomeGroupDesign | undefined {
  return groupDesign(sensors.map((sensor) => sensor.type));
}

function designName(design: HomeGroupDesign | undefined, sensors: ReactiveSensor[]): string {
  if (!design) return t('views.home_dashboard.group');
  const types = new Set(sensors.flatMap((sensor) => (sensor.type === SensorType.Battery ? [] : [sensor.type])));
  const ofType = `views.home_dashboard.groups.${design.key}.of_type.${[...types][0]}`;
  return types.size === 1 && te(ofType) ? t(ofType) : t(`views.home_dashboard.groups.${design.key}.title`);
}

function lightsOf(roomId?: string): ReactiveSensor[] {
  return tiles.value.filter((sensor) => sensor.type === SensorType.Light && (!roomId || sensor.roomId.value === roomId));
}

function groupOf(camera: DBCamera, ids: string[] = []): DBCamera[] {
  const others = ids.flatMap((id) => (id === camera._id ? [] : (camerasById.value.get(id) ?? [])));
  return [camera, ...others];
}

function startEdit() {
  drafts.value = {};
  openDraft();
  dockDraft.value = profile.value.dock && [...profile.value.dock];
  roomsDraft.value = profile.value.rooms && [...profile.value.rooms];
  hiddenRoomsDraft.value = profile.value.hiddenRooms && [...profile.value.hiddenRooms];
  hold(profile.value.id);
}

function openDraft() {
  const stored = new Set(page.value.widgets.map((widget) => widget.id));
  const added = entries.value.map((entry) => entry.widget).filter((widget) => !stored.has(widget.id));
  drafts.value![pageId.value] = { ...page.value, hidden: [...page.value.hidden], widgets: [...page.value.widgets, ...added] };
}

function cancelEdit() {
  drafts.value = undefined;
  dockDraft.value = undefined;
  roomsDraft.value = undefined;
  hiddenRoomsDraft.value = undefined;
  panelOpen.value = false;
  hold(undefined);
}

function hideRoom(id: string, hidden: boolean) {
  const rest = hiddenRooms.value.filter((entry) => entry !== id);
  hiddenRoomsDraft.value = hidden ? [...rest, id] : rest;
}

async function finishEdit() {
  const pages = Object.values(drafts.value!).map((entry) => {
    const shown = entry.id === pageId.value ? placed.value : new Map(entry.widgets.flatMap((widget) => (widget.layout ? [[widget.id, widget.layout]] : [])));
    return { ...entry, widgets: byPosition(entry.widgets, shown) };
  });
  const changed = { ...profile.value, dock: dockDraft.value, rooms: roomsDraft.value, hiddenRooms: hiddenRoomsDraft.value };
  panelOpen.value = false;
  if (await persist(() => save(changed, pages))) cancelEdit();
}

async function persist(run: () => Promise<void>): Promise<boolean> {
  saving.value = true;
  try {
    await run();
    return true;
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
    return false;
  } finally {
    saving.value = false;
  }
}

function createProfile() {
  const placeholder = freshName();
  openProfileDialog({ placeholder, copyOf: profileLabel(profile.value) }, async ({ name = placeholder, rule, copy }) => {
    const source = profile.value;
    const created: DBHomeProfile = copy
      ? { id: randomId(), name, rule, pages: source.pages, dock: source.dock, rooms: source.rooms, hiddenRooms: source.hiddenRooms }
      : { id: randomId(), name, rule, pages: [] };
    if (await persist(() => save(created))) choose(created.id);
  });
}

function editProfile(entry: DBHomeProfile) {
  const isDefault = entry.id === profiles.value[0]!.id;
  const placeholder = profileLabel({ ...entry, name: undefined });
  openProfileDialog({ name: entry.name, placeholder, rule: entry.rule, isDefault }, async ({ name = isDefault ? undefined : placeholder, rule }) => {
    await persist(() => save({ ...entry, name, rule }));
  });
}

function openProfileDialog(props: HomeProfileProps, done: (result: HomeProfileResult) => Promise<void>) {
  dialog.openComponentDialog<HomeProfileProps>(HomeProfileDialog, {
    data: {
      title: t(props.copyOf === undefined ? 'views.home_dashboard.profile_edit' : 'views.home_dashboard.profile_new'),
      confirmText: t(props.copyOf === undefined ? 'components.form.button.save' : 'components.form.button.add'),
      contentProps: props,
    },
    onConfirm: done,
  });
}

function confirmRemove(entry: DBHomeProfile) {
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('views.home_dashboard.profile_remove_confirm', { name: profileLabel(entry) }),
      confirmText: t('components.form.button.remove'),
      confirmButtonProps: { severity: 'danger' },
    },
    onConfirm: async () => {
      await persist(() => removeProfile(entry.id));
    },
  });
}

function profileLabel(entry: DBHomeProfile): string {
  if (entry.name) return entry.name;
  const index = profiles.value.findIndex((other) => other.id === entry.id);
  return index > 0 ? t('views.home_dashboard.profile_numbered', { number: index + 1 }) : t('views.home_dashboard.profile_default');
}

function freshName(): string {
  const taken = new Set(profiles.value.map(profileLabel));
  for (let number = profiles.value.length + 1; ; number++) {
    const name = t('views.home_dashboard.profile_numbered', { number });
    if (!taken.has(name)) return name;
  }
}

function ruleLabel(rule: DBHomeProfileRule | undefined): string | undefined {
  if (!rule) return undefined;
  const parts = [
    rule.orientation && t(`views.home_dashboard.profile_${rule.orientation}`),
    rangeLabel('width', rule.minWidth, rule.maxWidth),
    rangeLabel('height', rule.minHeight, rule.maxHeight),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

function rangeLabel(side: 'width' | 'height', min: number | undefined, max: number | undefined): string | undefined {
  if (min !== undefined && max !== undefined) return t(`views.home_dashboard.rule_${side}_range`, { min, max });
  if (min !== undefined) return t(`views.home_dashboard.rule_${side}_from`, { min });
  return max === undefined ? undefined : t(`views.home_dashboard.rule_${side}_to`, { max });
}

function onLayout(positions: Record<string, DBHomeWidgetPosition>) {
  const moved = Object.entries(positions).some(([id, position]) => {
    const shown = placed.value.get(id);
    return !shown || shown.x !== position.x || shown.y !== position.y || shown.w !== position.w || shown.h !== position.h;
  });
  if (!moved) return;
  if (draft.value!.size !== breakpoint.value) pin();
  draft.value!.widgets = draft.value!.widgets.map((widget) => {
    const position = positions[widget.id];
    return position ? { ...widget, layout: position } : widget;
  });
}

async function update(id: string, patch: HomeWidgetPatch) {
  const before = entryById.value.get(id)?.spec;
  draft.value!.widgets = draft.value!.widgets.map((widget) => (widget.id === id ? { ...widget, ...patch } : widget));
  const entry = entryById.value.get(id);
  const shown = placed.value.get(id);
  if (!patch.actions || !entry?.spec.range || entry.spec === before || !shown) return;
  pin();
  await nextTick();
  gridRef.value?.rebuild();
  gridRef.value?.settle(id, fitRange(shown, entry.spec.range));
}

function actionWidget(key: string, actions: DBHomeAction[]): DBHomeWidget {
  return { ...homeWidget('action', key), actions };
}

function newIds(): Record<'clock' | 'group' | DBHomeAction, string> {
  return { clock: randomId(), group: randomId(), snooze: randomId(), recording: randomId(), mute: randomId(), privacy: randomId() };
}

function groupAction(id: string, target: string): string | undefined {
  const into = entryById.value.get(target);
  const dragged = entryById.value.get(id);
  if (id === target) return undefined;
  if (dragged?.kind === 'action') {
    if (!joinedActions(id, target)) return undefined;
    return (into?.widget.actions?.length ?? 0) > 1
      ? t('views.home_dashboard.group_join', { name: t('views.home_dashboard.actions.group') })
      : t('views.home_dashboard.group_create');
  }
  if (dragged?.kind !== 'sensor') return undefined;
  if (into?.kind === 'sensor') {
    const members = [into.sensor, dragged.sensor];
    const design = designOf(members);
    return design ? t('views.home_dashboard.group_create_as', { name: designName(design, members) }) : t('views.home_dashboard.group_create');
  }
  if (into?.kind === 'group' && into.own) return t('views.home_dashboard.group_join', { name: into.name });
  return undefined;
}

function joinedActions(id: string, target: string): DBHomeAction[] | undefined {
  const actions = entryById.value.get(target)?.widget.actions;
  const added = entryById.value.get(id)?.widget.actions?.filter((action) => !actions?.includes(action));
  return actions && added?.length ? [...actions, ...added] : undefined;
}

async function joinActions(id: string, target: string, shown: DBHomeWidgetPosition) {
  const actions = joinedActions(id, target);
  if (!actions) return;

  pin();
  draft.value!.widgets = draft.value!.widgets.flatMap((widget) => {
    if (widget.id === id) return [];
    return [widget.id === target ? { ...widget, actions } : widget];
  });
  draft.value!.hidden = [...draft.value!.hidden, id];

  await nextTick();
  gridRef.value?.settle(target, fitRange(shown, HOME_SPECS.actionGroup.range));
}

async function joinGroup(id: string, target: string, at: HomeCellPosition) {
  const dragged = entryById.value.get(id);
  const into = entryById.value.get(target);
  const shown = placed.value.get(target);
  if (dragged?.kind === 'action' && shown) return joinActions(id, target, shown);
  if (dragged?.kind !== 'sensor' || !into || !shown) return;

  pin();
  let groupId = target;
  let size: HomeCellSize = { w: shown.w, h: shown.h };
  if (into.kind === 'group') {
    update(target, { sensors: [...(into.widget.sensors ?? []), dragged.sensor.id] });
  } else if (into.kind === 'sensor') {
    const key = randomId();
    groupId = `group:${key}`;
    size = { w: Math.min(Math.max(shown.w, 4), columns.value), h: Math.max(shown.h, 2) };
    const members = [into.sensor, dragged.sensor];
    const roomId = members[0]!.roomId.value;
    const name = roomId && members.every((sensor) => sensor.roomId.value === roomId) ? roomNames.value.get(roomId) : undefined;
    const group: DBHomeWidget = {
      id: groupId,
      kind: 'group',
      ref: key,
      ...(name && { name }),
      sensors: members.map((sensor) => sensor.id),
      layout: { ...at, ...size },
    };
    draft.value!.widgets = draft.value!.widgets.map((widget) => (widget.id === target ? group : widget));
    draft.value!.hidden = [...draft.value!.hidden, target];
  }
  draft.value!.widgets = draft.value!.widgets.filter((widget) => widget.id !== id);
  draft.value!.hidden = [...draft.value!.hidden, id];

  await nextTick();
  gridRef.value?.settle(groupId, size);
}

async function takeOut(groupId: string, sensorId: string) {
  const rest = (draft.value!.widgets.find((widget) => widget.id === groupId)?.sensors ?? []).filter((id) => id !== sensorId);
  if (rest.length < 2) {
    await dissolve(groupId);
    return;
  }
  update(groupId, { sensors: rest });
  const member = homeWidget('sensor', sensorId);
  place(member, freeSpot(placed.value.values(), { w: 2, h: 1 }, columns.value));
  await nextTick();
  gridRef.value?.reveal(member.id);
}

async function dissolve(groupId: string) {
  const group = draft.value!.widgets.find((widget) => widget.id === groupId);
  const at = placed.value.get(groupId);
  if (!group?.sensors || !at) return;

  pin();
  const size = { w: Math.min(2, at.w), h: 1 };
  const perRow = Math.floor(at.w / size.w);
  const taken = [...placed.value].flatMap(([id, position]) => (id === groupId ? [] : [position]));
  const members = group.sensors.map((sensorId, index) => {
    const position =
      index < perRow * at.h ? { x: at.x + (index % perRow) * size.w, y: at.y + Math.floor(index / perRow), ...size } : freeSpot(taken, size, columns.value);
    taken.push(position);
    return { ...homeWidget('sensor', sensorId), layout: position };
  });
  const ids = new Set(members.map((member) => member.id));
  draft.value!.widgets = [...draft.value!.widgets.filter((widget) => widget.id !== groupId && !ids.has(widget.id)), ...members];
  draft.value!.hidden = draft.value!.hidden.filter((id) => !ids.has(id));
  await nextTick();
  gridRef.value?.rebuild();
}

async function arrange() {
  pin();
  const items = entries.value.flatMap((entry) => {
    const position = placed.value.get(entry.widget.id);
    return position ? [{ ...position, id: entry.widget.id, kind: entry.widget.kind, range: entry.spec.range }] : [];
  });
  const arranged = arrangeWidgets(items, columns.value);
  draft.value!.widgets = draft.value!.widgets.map((widget) => {
    const position = arranged.get(widget.id);
    return position ? { ...widget, layout: position } : widget;
  });
  await nextTick();
  gridRef.value?.rebuild();
}

function remove(id: string) {
  pin();
  const closed = closeGap(placed.value, id);
  draft.value!.widgets = draft.value!.widgets.flatMap((widget) => {
    if (widget.id === id) return [];
    const position = closed.get(widget.id);
    return [position ? { ...widget, layout: position } : widget];
  });
  draft.value!.hidden = [...draft.value!.hidden, id];
}

async function add(widget: DBHomeWidget, size: HomeCellSize) {
  place(widget, freeSpot(placed.value.values(), size, columns.value));
  await nextTick();
  gridRef.value?.reveal(widget.id);
}

function dropIn(id: string, position: DBHomeWidgetPosition) {
  const item = sections.value.flatMap((section) => section.items).find((entry) => entry.widget.id === id);
  if (item) place(item.widget, position);
}

function place(widget: DBHomeWidget, position: DBHomeWidgetPosition) {
  pin();
  draft.value!.widgets = [...draft.value!.widgets, { ...widget, layout: position }];
  draft.value!.hidden = draft.value!.hidden.filter((id) => id !== widget.id);
  if (widget.kind === 'clock' || widget.kind === 'action') freshIds.value = newIds();
}

function pin() {
  draft.value!.size = breakpoint.value;
  draft.value!.widgets = draft.value!.widgets.map((entry) => {
    const shown = placed.value.get(entry.id);
    return shown ? { ...entry, layout: shown } : entry;
  });
}

function clearPage() {
  const hidden = autoWidgets(pageId.value, content.value, rooms.value).map((widget) => widget.id);
  drafts.value![pageId.value] = { id: pageId.value, autoAdd: page.value.autoAdd, hidden, widgets: [] };
}

function resetPage() {
  drafts.value![pageId.value] = { id: pageId.value, autoAdd: true, hidden: [], widgets: autoWidgets(pageId.value, content.value, rooms.value) };
}

watch(kiosk, () => (held.value = { breakpoint: breakpoint.value, window: windowWidth.value }), { flush: 'sync' });
watch(windowWidth, () => (held.value = undefined));

watchEffect(() => {
  if (layoutKnown.value && (ready.value || layoutStored.value)) showContent.value = true;
});

watch(pageId, () => {
  if (drafts.value && !drafts.value[pageId.value]) openDraft();
});
</script>

<style scoped>
.home__chrome {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.home__chrome--pinned {
  position: fixed;
  top: var(--cui-top-bar);
  z-index: 10;
  padding-block: 0.5rem;
  background: var(--ground-background);
}

.home__inner {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-width: 0;
  margin-inline: auto;
}

.home__grid,
.home-dock {
  transition: opacity 0.2s ease;
}

.home__grid {
  animation: home-fade-in 0.25s ease;
}

@keyframes home-fade-in {
  from {
    opacity: 0;
  }
}

.home--saving .home__grid,
.home--saving .home-dock {
  opacity: 0.6;
}
</style>
