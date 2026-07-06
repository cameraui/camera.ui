export interface CuiDataTableProps {
  value?: unknown[] | null;
  rows?: number;
  paginator?: boolean;
  paginatorTemplate?: string;
}

export const CUI_DATA_TABLE_DEFAULTS = {
  rows: 15,
  paginatorTemplate: 'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink',
} satisfies Partial<CuiDataTableProps>;
