import { isEqual } from '@camera.ui/common/utils';

import { readFieldError } from '@/api/errors.js';
import { ConfigQuery } from '@/api/routes/config.js';
import { deepToRaw } from '@/common/utils.js';

import type { SettingsPatchInput, SettingsUpdate, SettingsView } from '@shared/types';
import type { Ref } from 'vue';

type Group = 'server' | 'logging' | 'proxy' | 'streaming';
type Values = Record<string, unknown>;

export function useSettingsForm<G extends Group, Card extends string>(group: G, cards: Record<Card, (keyof SettingsView[G] & string)[]>) {
  const configQuery = new ConfigQuery();

  const { t } = useI18n();

  const { data: settings } = configQuery.getSettingsQuery();
  const { mutateAsync: patchSettings, isPending: pending } = configQuery.patchSettingsMutation();

  const form = ref(null) as Ref<SettingsView[G] | null>;
  const errors = ref<Record<string, string>>({});
  const saving = ref(null) as Ref<Card | null>;

  const dirty = computed(
    () => Object.fromEntries((Object.keys(cards) as Card[]).map((card) => [card, Object.keys(changesOf(card)).length > 0])) as Record<Card, boolean>,
  );

  function changesOf(card: Card): Partial<SettingsView[G]> {
    if (!form.value || !settings.value) return {};
    const changes = changedValues(form.value, settings.value[group]);
    return pick(changes, cards[card]) as Partial<SettingsView[G]>;
  }

  function lockedBy(field: string): string | undefined {
    const path = `${group}.${field}`;
    return Object.entries(settings.value?.locked ?? {}).find(([locked]) => locked === path || locked.startsWith(`${path}.`))?.[1];
  }

  function hint(field: string, key: string): string {
    const variable = lockedBy(field);
    return variable ? t('views.settings.locked_by', { variable }) : t(key);
  }

  function showIssues(issues: { path: PropertyKey[]; message: string }[]): void {
    errors.value = Object.fromEntries(issues.map((issue) => [errorKey(issue.path), issue.message]));
  }

  async function save(card: Card, patch: NonNullable<SettingsPatchInput[G]>): Promise<SettingsUpdate | undefined> {
    saving.value = card;
    try {
      const update = await patchSettings({ [group]: patch } as SettingsPatchInput);
      // only the saved card takes the stored values, edits in the other cards stay
      Object.assign(form.value!, pick(deepToRaw(update[group] as Values), cards[card]));
      return update;
    } catch (error) {
      const invalid = readFieldError(error);
      if (invalid) errors.value = { [errorKey(invalid.field.split('.').slice(1))]: invalid.message };
      return undefined;
    } finally {
      saving.value = null;
    }
  }

  watch(
    () => settings.value?.[group],
    (saved, previous) => {
      if (!saved) return;
      if (!form.value || !previous) {
        form.value = deepToRaw(saved as Values) as SettingsView[G];
        return;
      }
      // a save from elsewhere, the YAML editor for one, reaches the cards nobody is editing
      for (const fields of Object.values<string[]>(cards)) {
        if (Object.keys(changedValues(pick(form.value as Values, fields), previous as Values)).length === 0) {
          Object.assign(form.value, pick(deepToRaw(saved as Values), fields));
        }
      }
    },
    { immediate: true },
  );

  watch(
    form,
    () => {
      errors.value = {};
    },
    { deep: true },
  );

  return { settings, form, errors, saving, pending, dirty, changesOf, lockedBy, hint, showIssues, save };
}

function changedValues(values: object, saved: object): Values {
  const patch: Values = {};
  for (const [key, value] of Object.entries(values)) {
    const old = (saved as Values)[key];
    if (isRecord(value) && isRecord(old)) {
      const nested = changedValues(value, old);
      if (Object.keys(nested).length) patch[key] = nested;
    } else if (!isEqual(value, old)) {
      patch[key] = value;
    }
  }
  return patch;
}

function pick(values: Values, fields: string[]): Values {
  return Object.fromEntries(fields.filter((field) => field in values).map((field) => [field, values[field]]));
}

function isRecord(value: unknown): value is Values {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorKey(path: PropertyKey[]): string {
  return path.filter((part) => typeof part === 'string' && !/^\d+$/.test(part)).join('.');
}
