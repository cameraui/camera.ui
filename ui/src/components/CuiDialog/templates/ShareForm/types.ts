export interface ShareFormSource {
  _id: string;
  name: string;
  role: string;
}

export interface ShareFormProps {
  cameraId: string;
  cameraName: string;
  sources: ShareFormSource[];
}
