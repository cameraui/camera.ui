export interface CuiHeatmapProps {
  cameraId: string;
}

export interface HeatmapProxy {
  getDetectionHeatmap?: (cameraId: string, startMs: number, endMs: number) => Promise<{ points: { x: number; y: number }[]; count: number }>;
}
