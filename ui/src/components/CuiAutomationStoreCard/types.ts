import type { AutomationCatalogEntry, AutomationRequiredInput } from '@/api/routes/automations.js';
import type { AutomationInputType } from '@/components/CuiAutomation/types.js';

export interface CuiAutomationStoreCardProps {
  entry: AutomationCatalogEntry;
}

export interface CuiAutomationStoreCardEmits {
  open: [entry: AutomationCatalogEntry];
}

const INPUT_LABEL_KEY: Record<AutomationInputType, string> = {
  camera: 'components.automation_store.input_camera',
  plugin: 'components.automation_store.input_plugin',
  sensor: 'components.automation_store.input_sensor',
  'notification-targets': 'components.automation_store.input_notification_targets',
  'system-target': 'components.automation_store.input_system_target',
  text: 'components.automation_store.input_text',
};

export function formatRequiredInputs(inputs: AutomationRequiredInput[] | undefined, t: (key: string, named: Record<string, unknown>) => string): string[] {
  if (!inputs?.length) return [];
  return inputs.map((input) => t(INPUT_LABEL_KEY[input.type], { count: input.count ?? 1 }));
}
