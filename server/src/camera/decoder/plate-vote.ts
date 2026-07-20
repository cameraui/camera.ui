export const MIN_PLATE_LENGTH = 4;
export const MIN_PLATE_SUPPORT = 3;
export const MAX_UNTRACKED_PLATES = 3;

export interface PlateCluster {
  id: number;
  best: string;
  bestConfidence: number;
  score: number;
  count: number;
}

export function normalizePlateText(text: string): string {
  return text.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function plateEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

export function isSamePlate(a: string, b: string): boolean {
  if (a === b) return true;
  const tolerance = Math.max(a.length, b.length) <= 4 ? 1 : 2;
  return plateEditDistance(a, b) <= tolerance;
}

export class PlateVoteTracker {
  private clusters: PlateCluster[] = [];
  private nextId = 0;

  public add(text: string, confidence: number, minLength: number = MIN_PLATE_LENGTH): void {
    const normalized = normalizePlateText(text);
    if (normalized.length < minLength) return;

    const cluster = this.clusters.find((c) => isSamePlate(c.best, normalized));
    if (!cluster) {
      this.clusters.push({ id: this.nextId++, best: normalized, bestConfidence: confidence, score: confidence, count: 1 });
      return;
    }

    cluster.score += confidence;
    cluster.count += 1;
    if (confidence > cluster.bestConfidence) {
      cluster.best = normalized;
      cluster.bestConfidence = confidence;
    }
  }

  public winners(): PlateCluster[] {
    return this.clusters.filter((c) => c.count >= MIN_PLATE_SUPPORT).sort((a, b) => b.score - a.score);
  }

  public bestEffort(): PlateCluster | undefined {
    let best: PlateCluster | undefined;
    for (const cluster of this.clusters) {
      if (!best || cluster.score > best.score) best = cluster;
    }
    return best;
  }
}
