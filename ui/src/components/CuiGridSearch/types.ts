export interface GridRegion {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface GridSearchState {
  active: Ref<boolean>;
  regions: Ref<GridRegion[]>;
}

export interface CuiGridSearchProps {
  modelValue: GridRegion[];
  cols?: number;
  rows?: number;
}

export interface CuiGridSearchEmits {
  'update:modelValue': [value: GridRegion[]];
}

export interface GridSearchPoint {
  col: number;
  row: number;
}

export const GridSearchKey: InjectionKey<GridSearchState> = Symbol('GridSearchState');
