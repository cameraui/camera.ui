import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const debugDir = process.env.CAMERA_UI_DEBUG_DIR;

export const WITH_REPORTS = debugDir !== undefined;

export const REPORT_DIR = debugDir ? join(debugDir, 'reports') : undefined;

if (REPORT_DIR) {
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
  } catch {
    // ignore
  }
}
