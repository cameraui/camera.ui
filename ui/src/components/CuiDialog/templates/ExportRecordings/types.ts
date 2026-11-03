export interface ExportRecordingsCamera {
  id: string;
  name: string;
}

export interface ExportRecordingsProps {
  cameras: ExportRecordingsCamera[];
  preselect?: string[];
}

export interface ExportRecordingsFile {
  cameraId: string;
  cameraName: string;
  name: string;
  span: string;
  bytes: number;
}
