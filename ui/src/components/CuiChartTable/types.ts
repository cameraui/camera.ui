import type { PaginationQuery } from '@shared/types';
import type { ChartData, ChartOptions } from 'chart.js';
import type { ButtonProps, ChipProps, ColumnProps, DataTableProps } from 'primevue';
import type { HTMLAttributes } from 'vue';

interface TableHeaderBase {
  type: TableHeaderType;
  field: string | ((item: any) => string);
  name?: ColumnProps['header'];
  altName?: ColumnProps['header'];
  props?: HTMLAttributes;
  columnProps?: ColumnProps;
}

export type TableHeaderType = 'action' | 'category' | 'chart' | 'indicator';

export interface TableHeaderIndicator extends TableHeaderBase {
  type: 'indicator';
  color: (item: any) => string | undefined;
  tooltip: (item: any) => string | undefined;
}

export interface TableHeaderActionButton {
  icon: any;
  loading?: (item: any) => boolean;
  disabled?: (item: any) => boolean;
  action: (item: any) => void;
  buttonProps?: ButtonProps;
}

export interface TableHeaderAction extends TableHeaderBase {
  type: 'action';
  icon?: any;
  loading?: (item: any) => boolean;
  disabled?: (item: any) => boolean;
  action?: (item: any) => void;
  buttonProps?: ButtonProps;
  buttons?: TableHeaderActionButton[];
}

export interface TableHeaderChart extends TableHeaderBase {
  type: 'chart';
  for: string;
}

export interface TableHeaderCategory extends TableHeaderBase {
  type: 'category';
  asChip?: boolean;
  chipProps?: ChipProps;
  suffix?: string;
}

export type TableHeader = TableHeaderCategory | TableHeaderAction | TableHeaderChart | TableHeaderIndicator;

export interface CuiChartTableProps {
  headers: TableHeader[];
  items?: DataTableProps['value'];
  loading?: DataTableProps['loading'];
  paginator?: DataTableProps['paginator'];
  totalRecords?: DataTableProps['totalRecords'];
  rows?: DataTableProps['rows'];
  pagination?: PaginationQuery;
  chartData?: Record<string, ChartData<'bar'>>;
  emptyMessage?: string;
}

export const isHeaderCategory = (header: TableHeader): header is TableHeaderCategory => {
  return header.type === 'category';
};

export const isHeaderAction = (header: TableHeader): header is TableHeaderAction => {
  return header.type === 'action';
};

export const isHeaderChart = (header: TableHeader): header is TableHeaderChart => {
  return header.type === 'chart';
};

export const isHeaderIndicator = (header: TableHeader): header is TableHeaderIndicator => {
  return header.type === 'indicator';
};

export interface CuiChartTableEmits {
  (e: 'update:page', page: { page: number; rows: number; first: number }): void;
}

export interface ChartWrapperProps {
  data: ChartData<'bar'>;
  options: ChartOptions<'bar'>;
  width?: number;
  height?: number;
}

export const CHART_WRAPPER_DEFAULTS = {
  width: 200,
  height: 25,
};
