export interface ChartTooltipAnchor {
  x: number;
  top: number;
  bottom: number;
}

export interface ChartTooltipRow {
  text: string;
  color?: string;
}

export interface CuiChartTooltipProps {
  anchor?: ChartTooltipAnchor;
  title?: string;
  rows?: ChartTooltipRow[];
}
