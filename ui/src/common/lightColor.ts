import type { LightColor } from '@camera.ui/sdk';

export const WARM_WHITE_KELVIN = 2700;

export function lightColorCss({ hue, saturation }: LightColor): string {
  return `hsl(${hue} ${saturation}% ${Math.round(100 - saturation * 0.45)}%)`;
}

export function kelvinColor(kelvin: number): string {
  const ratio = Math.min(Math.max((kelvin - 2000) / 4500, 0), 1);
  const channel = (warm: number, cool: number) => Math.round(warm + (cool - warm) * ratio);
  return `rgb(${channel(255, 201)} ${channel(167, 218)} ${channel(87, 255)})`;
}
