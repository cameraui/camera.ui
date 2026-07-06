let shuttingDown = false;

export function markShuttingDown(): void {
  shuttingDown = true;
}

export function resetShuttingDown(): void {
  shuttingDown = false;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
