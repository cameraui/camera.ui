export interface CuiScreenProps {
  title?: string;
  back?: boolean;
  brand?: boolean;
  subtitle?: string;
  center?: boolean;
  loading?: boolean;
}

export interface CuiScreenEmits {
  (e: 'back'): void;
}
