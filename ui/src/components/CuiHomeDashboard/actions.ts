import { useRecordingExport } from '@camera.ui/nvr';
import { useIsMutating } from '@tanstack/vue-query';
import BellOffIcon from '~icons/mdi/bell-off-outline';
import BellIcon from '~icons/mdi/bell-outline';
import PrivateIcon from '~icons/mdi/eye-off';
import PrivacyIcon from '~icons/mdi/eye-off-outline';
import ShowIcon from '~icons/mdi/eye-outline';
import PauseIcon from '~icons/mdi/pause';
import PausedIcon from '~icons/mdi/pause-circle-outline';
import PlayIcon from '~icons/mdi/play';
import RecordIcon from '~icons/mdi/record-circle-outline';
import SnoozedIcon from '~icons/solar/moon-sleep-bold';
import SnoozeIcon from '~icons/solar/moon-sleep-linear';

import { bulkPatchCamerasFn } from '@/api/routes/cameras.js';
import { muteNotificationsFn, NotificationsQuery, unmuteNotificationsFn } from '@/api/routes/notifications.js';
import { toneColor } from '@/common/sensorDisplay.js';
import { extractErrorMessage, formatDayTime } from '@/common/utils.js';

import type { BulkPatchCamerasInput, DBCamera, DBHomeAction } from '@shared/types';
import type { CuiHomeActionProps, HomeActionCamera, HomeActionLook, HomeActionPress, HomeActionReason, HomeActionState } from './types.js';

type PauseAction = Exclude<DBHomeAction, 'mute'>;

export const HOME_ACTION_MINUTES = 60;
export const EXTEND_MINUTES = 60;

export const HOME_ACTION_LOOKS: Record<DBHomeAction, HomeActionLook> = {
  snooze: { icon: SnoozeIcon, onIcon: SnoozedIcon, goIcon: PauseIcon, backIcon: PlayIcon, color: toneColor('warn'), admin: true, hold: false },
  recording: { icon: RecordIcon, onIcon: PausedIcon, goIcon: PauseIcon, backIcon: PlayIcon, color: toneColor('alarm'), admin: true, hold: true },
  mute: { icon: BellIcon, onIcon: BellOffIcon, goIcon: BellOffIcon, backIcon: BellIcon, color: toneColor('info'), admin: false, hold: false },
  privacy: { icon: PrivacyIcon, onIcon: PrivateIcon, goIcon: PrivacyIcon, backIcon: ShowIcon, color: toneColor('night'), admin: true, hold: false },
};

const PAUSE_MINUTES = [60, 480, 0];
const MUTE_MINUTES = [...MUTE_HOURS.map((hours) => hours * 60), 0];
const MINUTE = 60_000;
const TICK_MS = 10_000;

const RESUME: Record<PauseAction, BulkPatchCamerasInput['cameraData']> = {
  snooze: { detectionSettings: { snooze: false } },
  recording: { recordingSettings: { paused: false } },
  privacy: { privacy: { enabled: false } },
};

export function allowedActions(actions: readonly DBHomeAction[], admin: boolean): DBHomeAction[] {
  return actions.filter((action) => admin || !HOME_ACTION_LOOKS[action].admin);
}

export function actionDurations(action: DBHomeAction): number[] {
  return action === 'mute' ? MUTE_MINUTES : PAUSE_MINUTES;
}

export function isActionOn(state: HomeActionState): boolean {
  return state.mode === 'on' || state.mode === 'partial';
}

export function useHomeActions(scope: () => CuiHomeActionProps) {
  const { t } = useI18n();
  const toast = useCuiToast();
  const queryClient = useQueryClient();
  const { say, goLabel } = useActionText();
  const { mutedUntil, cameraMutedUntil, muteFor, unmute } = useNotificationMute();
  const { data: notifications } = new NotificationsQuery().getSettingsQuery();
  const { isAvailable: hasNvr } = useRecordingExport();
  // the mute requests run in the shared composable, these count them while they are out
  const muting = useIsMutating({ predicate: (mutation) => mutation.options.mutationFn === muteNotificationsFn });
  const unmuting = useIsMutating({ predicate: (mutation) => mutation.options.mutationFn === unmuteNotificationsFn });
  const now = useNow({ scheduler: (tick) => useIntervalFn(tick, TICK_MS) });

  const pending = reactive(new Map<PauseAction, 'on' | 'off'>());

  const states = computed(() => scope().actions.map(stateOf));
  const active = computed(() => states.value.filter(isActionOn));

  function stateOf(action: DBHomeAction): HomeActionState {
    const { cameras, all, minutes } = scope();
    const counted = action === 'recording' ? cameras.filter((camera) => camera.recordingSettings?.enabled) : cameras;
    const rows = counted.map((camera) => ({ camera, ...pauseOf(action, camera) }));
    const on = rows.filter((row) => row.on);
    const global = action === 'mute' && all ? mutedUntil.value : undefined;
    const lead: Pick<HomeActionCamera, 'since' | 'until'> | undefined = global ? { until: finite(global) } : [...on].sort(byEnd)[0];
    const reason = reasonOf(action, cameras, counted, all);
    const time = now.value.getTime();

    return {
      action,
      mode: modeOf(reason, on.length, rows.length, !!global),
      pending: pendingOf(action),
      cameras: rows,
      count: on.length,
      since: lead?.since,
      until: lead?.until,
      share: lead?.since && lead.until ? Math.min(Math.max((lead.until - time) / (lead.until - lead.since), 0), 1) : undefined,
      reason,
      durations: actionDurations(action),
      minutes,
    };
  }

  function pauseOf(action: DBHomeAction, camera: DBCamera): Omit<HomeActionCamera, 'camera'> {
    if (action === 'mute') {
      const until = Math.max(mutedUntil.value ?? 0, cameraMutedUntil(camera._id) ?? 0);
      return { on: until > 0, until: until ? finite(until) : undefined };
    }
    const [paused, since, until] = pauseFields(action, camera);
    // the server ends a pause on time, the camera list only learns it on its next load
    const over = until !== undefined && until <= now.value.getTime();
    return { on: !!paused && !over, since, until };
  }

  function reasonOf(action: DBHomeAction, cameras: DBCamera[], counted: DBCamera[], all: boolean): HomeActionReason | undefined {
    if (action === 'mute') {
      if (notifications.value?.enabled === false) return 'notifications_off';
      return all || cameras.length ? undefined : 'no_cameras_room';
    }
    if (action === 'recording' && !hasNvr.value) return 'no_nvr';
    if (!cameras.length) return all ? 'no_cameras' : 'no_cameras_room';
    return counted.length ? undefined : 'no_recording';
  }

  function pendingOf(action: DBHomeAction): 'on' | 'off' | undefined {
    if (action !== 'mute') return pending.get(action);
    if (muting.value) return 'on';
    return unmuting.value ? 'off' : undefined;
  }

  function find(action: DBHomeAction): HomeActionState {
    return states.value.find((state) => state.action === action) ?? stateOf(action);
  }

  function go(action: DBHomeAction, minutes: number) {
    const cameras = find(action).cameras.map((row) => row.camera);
    if (action === 'mute') {
      muteFor(minutes || undefined, scope().all ? undefined : ids(cameras));
      return;
    }
    pause(action, cameras, minutes ? Date.now() + minutes * MINUTE : undefined);
  }

  function back(action: DBHomeAction) {
    const on = onCameras(find(action));
    if (action !== 'mute') {
      patch(action, 'off', on, RESUME[action]);
      return;
    }
    const named = ids(scope().cameras);
    unmute(named.length ? named : undefined);
  }

  function extend(action: DBHomeAction) {
    const state = find(action);
    if (!state.until) return;
    const until = state.until + EXTEND_MINUTES * MINUTE;
    if (action !== 'mute') {
      pause(action, onCameras(state), until);
      return;
    }
    muteFor(Math.round((until - Date.now()) / MINUTE), scope().all && mutedUntil.value ? undefined : ids(onCameras(state)));
  }

  function resumeAll() {
    for (const state of active.value) back(state.action);
  }

  function pressOf(state: HomeActionState): HomeActionPress | undefined {
    const { action } = state;
    if (state.pending || state.mode === 'na') return undefined;
    if (isActionOn(state)) return { resumes: true, label: say(action, 'back'), short: say(action, 'back'), guarded: false, run: () => back(action) };
    return {
      resumes: false,
      label: goLabel(action, state.minutes),
      short: say(action, 'go_short'),
      guarded: HOME_ACTION_LOOKS[action].hold,
      run: () => go(action, state.minutes),
    };
  }

  function pause(action: PauseAction, cameras: DBCamera[], until: number | undefined) {
    patch(action, 'on', cameras, pauseData(action, until));
  }

  async function patch(action: PauseAction, direction: 'on' | 'off', cameras: DBCamera[], cameraData: BulkPatchCamerasInput['cameraData']) {
    if (!cameras.length || pending.has(action)) return;
    pending.set(action, direction);
    try {
      const { failed } = await bulkPatchCamerasFn({ cameranames: cameras.map((camera) => camera.name), cameraData });
      if (failed.length)
        toast.add({ severity: 'error', detail: t('views.home_dashboard.actions.failed', { names: failed.map((entry) => entry.id).join(', ') }), life: 5000 });
    } catch (error) {
      toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 4000 });
    } finally {
      await queryClient.refetchQueries({ queryKey: ['camerasList'] });
      pending.delete(action);
    }
  }

  return { states, active, go, back, extend, resumeAll, pressOf };
}

export function useActionText() {
  const { t, locale } = useI18n();
  const now = useNow({ scheduler: (tick) => useIntervalFn(tick, TICK_MS) });

  function say(action: DBHomeAction, key: string): string {
    return t(`views.home_dashboard.actions.${action}.${key}`);
  }

  function goLabel(action: DBHomeAction, minutes: number): string {
    const label = minutes ? `${say(action, 'go_for')} ${durationLabel(minutes)}` : say(action, 'go_no_end');
    return HOME_ACTION_LOOKS[action].hold ? t('views.home_dashboard.actions.hold_aria', { label }) : label;
  }

  function durationLabel(minutes: number): string {
    if (!minutes) return t('views.home_dashboard.actions.no_end');
    return minutes < 60 ? t('views.home_dashboard.actions.minutes', { count: minutes }) : t('views.home_dashboard.actions.hours', { count: minutes / 60 });
  }

  function leftText(state: HomeActionState): string {
    const minutes = minutesLeft(state);
    const hours = Math.floor(minutes / 60);
    if (!hours) return t('views.home_dashboard.actions.minutes', { count: minutes });
    return minutes % 60 ? t('views.home_dashboard.actions.hours_minutes', { hours, minutes: minutes % 60 }) : t('views.home_dashboard.actions.hours', { count: hours });
  }

  function heroLeft(state: HomeActionState): string {
    const minutes = minutesLeft(state);
    if (minutes < 60) return t('views.home_dashboard.actions.minutes', { count: minutes });
    return t('views.home_dashboard.actions.hours', { count: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}` });
  }

  function minutesLeft(state: HomeActionState): number {
    return Math.max(1, Math.ceil(((state.until ?? 0) - now.value.getTime()) / MINUTE));
  }

  function clock(ms: number): string {
    return formatDayTime(ms, locale.value);
  }

  function countText(state: HomeActionState): string {
    return t('views.home_dashboard.actions.count', { count: state.count, total: state.cameras.length });
  }

  function onText(action: DBHomeAction, { since, until }: Pick<HomeActionCamera, 'since' | 'until'>): string {
    if (until) return `${say(action, 'on')} ${t('views.home_dashboard.actions.until', { time: clock(until) })}`;
    return since ? `${say(action, 'on')} ${t('views.home_dashboard.actions.since', { time: clock(since) })}` : say(action, 'on');
  }

  function busyText(state: HomeActionState): string {
    return say(state.action, state.pending === 'off' ? 'backing' : 'going');
  }

  function camerasText(state: HomeActionState): string {
    return t('views.home_dashboard.dock_camera_count', { count: state.cameras.length }, state.cameras.length);
  }

  function lineOf(state: HomeActionState, place: string): string {
    if (state.mode === 'na') return t(`views.home_dashboard.actions.na.${state.reason}`);
    if (state.pending) return busyText(state);
    if (state.mode === 'idle') return `${place} · ${say(state.action, 'idle')}`;
    if (state.mode === 'on') return `${place} · ${onText(state.action, state)}`;
    return `${place} · ${countText(state)} ${say(state.action, 'on')}`;
  }

  function summaryOf(state: HomeActionState): string {
    const { action } = state;
    if (state.mode === 'na') return t(`views.home_dashboard.actions.na.${state.reason}`);
    if (state.pending) return busyText(state);
    if (state.mode === 'idle') return state.cameras.length ? `${say(action, 'idle_title')} · ${camerasText(state)}` : say(action, 'idle_title');
    if (state.mode === 'partial') return `${countText(state)} ${say(action, 'on')}`;
    if (state.until) return `${say(action, 'on_title')} · ${t('views.home_dashboard.actions.left', { time: leftText(state) })}`;
    return state.since ? `${say(action, 'on_title')} ${t('views.home_dashboard.actions.since', { time: clock(state.since) })}` : say(action, 'on_title');
  }

  function shortOf(state: HomeActionState): string {
    if (state.mode === 'na') return t('views.home_dashboard.actions.missing');
    if (state.mode === 'idle') return say(state.action, 'idle');
    if (state.mode === 'partial') return countText(state);
    return state.until ? leftText(state) : say(state.action, 'on');
  }

  return { say, goLabel, durationLabel, leftText, heroLeft, clock, countText, onText, busyText, camerasText, lineOf, summaryOf, shortOf };
}

function pauseFields(action: PauseAction, camera: DBCamera): [boolean | undefined, number | undefined, number | undefined] {
  if (action === 'snooze') return [camera.detectionSettings?.snooze, camera.detectionSettings?.snoozeSince, camera.detectionSettings?.snoozeUntil];
  if (action === 'recording') return [camera.recordingSettings?.paused, camera.recordingSettings?.pausedSince, camera.recordingSettings?.pausedUntil];
  return [camera.privacy?.enabled, camera.privacy?.since, camera.privacy?.until];
}

function pauseData(action: PauseAction, until: number | undefined): BulkPatchCamerasInput['cameraData'] {
  if (action === 'snooze') return { detectionSettings: { snooze: true, snoozeUntil: until } };
  if (action === 'recording') return { recordingSettings: { paused: true, pausedUntil: until } };
  return { privacy: { enabled: true, until } };
}

function modeOf(reason: HomeActionReason | undefined, on: number, total: number, global: boolean): HomeActionState['mode'] {
  if (reason) return 'na';
  if (global || (on && on === total)) return 'on';
  return on ? 'partial' : 'idle';
}

function byEnd(a: Pick<HomeActionCamera, 'until'>, b: Pick<HomeActionCamera, 'until'>): number {
  return (a.until ?? Infinity) - (b.until ?? Infinity);
}

function onCameras(state: HomeActionState): DBCamera[] {
  return state.cameras.filter((row) => row.on).map((row) => row.camera);
}

function ids(cameras: DBCamera[]): string[] {
  return cameras.map((camera) => camera._id);
}

function finite(until: number): number | undefined {
  return Number.isFinite(until) ? until : undefined;
}
