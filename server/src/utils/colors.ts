import { inspect, styleText } from 'node:util';

export type Color = 'red' | 'green' | 'yellow' | 'blue' | 'cyan' | 'magenta' | 'gray' | 'redBright' | 'greenBright' | 'yellowBright' | 'cyanBright';

const ESCAPE = String.fromCharCode(27);

export function paint(color: Color, text: string): string {
  const [open, close] = inspect.colors[color];
  const nested = text.replaceAll(`${ESCAPE}[${close}m`, `${ESCAPE}[${open}m`);

  return styleText(color, nested, { validateStream: false });
}
