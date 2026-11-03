import type { RestoreMode } from '@shared/types';

export interface BackupRestoreProps {}

export interface BackupRestoreNote {
  key: string;
  label: string;
  lines: string[];
}

export const RESTORE_MODES: RestoreMode[] = ['move', 'copy'];
export const MOVE_PHASES = new Set(['connecting', 'stopping', 'packing', 'receiving', 'checking']);
export const BACKUP_KEY_PATTERN = /([A-Z2-7]{4}-){7}[A-Z2-7]{4}/i;
