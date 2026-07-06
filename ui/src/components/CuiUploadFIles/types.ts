export interface CuiUploadFilesProps {
  multiple?: boolean;
  accept?: string;
  icon?: any;
}

export interface CuiUploadFilesEmits {
  (e: 'files-uploaded', state: File[]): void;
}
