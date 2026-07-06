import { PluginInterface } from '@camera.ui/sdk';

export type PluginMethodParamType = 'image' | 'audio' | 'video' | 'json' | 'string' | 'number';

export interface PluginMethodParam {
  name: string;
  labelKey: string;
  type: PluginMethodParamType;
  placeholder?: string;
  binary?: boolean;
}

export interface PluginMethodDef {
  id: string;
  labelKey: string;
  params: PluginMethodParam[];
  args: PluginMethodArg[];
  settingsMethod?: string;
}

export type PluginMethodArg = { param: string } | { fixed: unknown } | { frame: string };

const IMAGE_METADATA: PluginMethodArg = { fixed: { width: 0, height: 0 } };
const AUDIO_METADATA: PluginMethodArg = { fixed: { mimeType: 'audio/wav' } };
const CONFIG_PARAM: PluginMethodArg = { param: 'config' };

export const PLUGIN_METHOD_REGISTRY: Partial<Record<PluginInterface, PluginMethodDef[]>> = {
  [PluginInterface.ObjectDetection]: [
    {
      id: 'testObjectDetection',
      labelKey: 'components.automation_nodes.method_test_object',
      params: [{ name: 'imageData', labelKey: 'components.automation_nodes.param_image', type: 'image', placeholder: '', binary: true }],
      args: [{ param: 'imageData' }, IMAGE_METADATA, CONFIG_PARAM],
      settingsMethod: 'objectDetectionSettings',
    },
    {
      id: 'detectObjects',
      labelKey: 'components.automation_nodes.method_detect_objects',
      params: [{ name: 'frameData', labelKey: 'components.automation_nodes.param_frame', type: 'image', placeholder: '', binary: true }],
      args: [{ frame: 'frameData' }, CONFIG_PARAM],
      settingsMethod: 'objectDetectionSettings',
    },
  ],
  [PluginInterface.FaceDetection]: [
    {
      id: 'testFaceDetection',
      labelKey: 'components.automation_nodes.method_test_face',
      params: [{ name: 'imageData', labelKey: 'components.automation_nodes.param_image', type: 'image', placeholder: '', binary: true }],
      args: [{ param: 'imageData' }, IMAGE_METADATA, CONFIG_PARAM],
      settingsMethod: 'faceDetectionSettings',
    },
    {
      id: 'detectFaces',
      labelKey: 'components.automation_nodes.method_detect_faces',
      params: [{ name: 'frameData', labelKey: 'components.automation_nodes.param_frame', type: 'image', placeholder: '', binary: true }],
      args: [{ frame: 'frameData' }, CONFIG_PARAM],
      settingsMethod: 'faceDetectionSettings',
    },
  ],
  [PluginInterface.LicensePlateDetection]: [
    {
      id: 'testLicensePlateDetection',
      labelKey: 'components.automation_nodes.method_test_plate',
      params: [{ name: 'imageData', labelKey: 'components.automation_nodes.param_image', type: 'image', placeholder: '', binary: true }],
      args: [{ param: 'imageData' }, IMAGE_METADATA, CONFIG_PARAM],
      settingsMethod: 'licensePlateDetectionSettings',
    },
    {
      id: 'detectLicensePlates',
      labelKey: 'components.automation_nodes.method_detect_plates',
      params: [{ name: 'frameData', labelKey: 'components.automation_nodes.param_frame', type: 'image', placeholder: '', binary: true }],
      args: [{ frame: 'frameData' }, CONFIG_PARAM],
      settingsMethod: 'licensePlateDetectionSettings',
    },
  ],
  [PluginInterface.ClassifierDetection]: [
    {
      id: 'testClassifierDetection',
      labelKey: 'components.automation_nodes.method_test_classifier',
      params: [{ name: 'imageData', labelKey: 'components.automation_nodes.param_image', type: 'image', placeholder: '', binary: true }],
      args: [{ param: 'imageData' }, IMAGE_METADATA, CONFIG_PARAM],
      settingsMethod: 'classifierDetectionSettings',
    },
    {
      id: 'detectClassifications',
      labelKey: 'components.automation_nodes.method_detect_classifications',
      params: [{ name: 'frameData', labelKey: 'components.automation_nodes.param_frame', type: 'image', placeholder: '', binary: true }],
      args: [{ frame: 'frameData' }, CONFIG_PARAM],
      settingsMethod: 'classifierDetectionSettings',
    },
  ],
  [PluginInterface.MotionDetection]: [
    {
      id: 'testMotionDetection',
      labelKey: 'components.automation_nodes.method_test_motion',
      params: [{ name: 'videoData', labelKey: 'components.automation_nodes.param_video', type: 'video', placeholder: '', binary: true }],
      args: [{ param: 'videoData' }, CONFIG_PARAM],
      settingsMethod: 'motionDetectionSettings',
    },
    {
      id: 'detectMotion',
      labelKey: 'components.automation_nodes.method_detect_motion',
      params: [{ name: 'frameData', labelKey: 'components.automation_nodes.param_frame', type: 'video', placeholder: '', binary: true }],
      args: [{ frame: 'frameData' }, CONFIG_PARAM],
      settingsMethod: 'motionDetectionSettings',
    },
  ],
  [PluginInterface.AudioDetection]: [
    {
      id: 'testAudioDetection',
      labelKey: 'components.automation_nodes.method_test_audio',
      params: [{ name: 'audioData', labelKey: 'components.automation_nodes.param_audio', type: 'audio', placeholder: '', binary: true }],
      args: [{ param: 'audioData' }, AUDIO_METADATA, CONFIG_PARAM],
      settingsMethod: 'audioDetectionSettings',
    },
  ],
  [PluginInterface.ClipDetection]: [
    {
      id: 'testClipEmbedding',
      labelKey: 'components.automation_nodes.method_test_clip',
      params: [{ name: 'imageData', labelKey: 'components.automation_nodes.param_image', type: 'image', placeholder: '', binary: true }],
      args: [{ param: 'imageData' }, IMAGE_METADATA, CONFIG_PARAM],
      settingsMethod: 'clipSettings',
    },
    {
      id: 'detectClipEmbedding',
      labelKey: 'components.automation_nodes.method_detect_clip',
      params: [{ name: 'frameData', labelKey: 'components.automation_nodes.param_frame', type: 'image', placeholder: '', binary: true }],
      args: [{ frame: 'frameData' }, CONFIG_PARAM],
      settingsMethod: 'clipSettings',
    },
    {
      id: 'getTextEmbedding',
      labelKey: 'components.automation_nodes.method_text_embedding',
      params: [{ name: 'text', labelKey: 'components.automation_nodes.param_text', type: 'string', placeholder: 'Search query' }],
      args: [{ param: 'text' }],
    },
  ],
};

export function getMethodDef(methodId: string): PluginMethodDef | undefined {
  for (const methods of Object.values(PLUGIN_METHOD_REGISTRY)) {
    const found = methods?.find((m) => m.id === methodId);
    if (found) return found;
  }
  return undefined;
}

export function buildArgsFromRegistry(methodId: string, resolvedParams: Record<string, unknown>): unknown[] {
  const def = getMethodDef(methodId);
  if (!def) return Object.values(resolvedParams);

  return def.args.map((arg) => {
    if ('fixed' in arg) return arg.fixed;
    if ('frame' in arg) {
      const data = resolvedParams[arg.frame] as Buffer;
      const width = Number(resolvedParams[`${arg.frame}.width`] ?? resolvedParams['image.width'] ?? 0);
      const height = Number(resolvedParams[`${arg.frame}.height`] ?? resolvedParams['image.height'] ?? 0);
      const format = (resolvedParams[`${arg.frame}.format`] ?? resolvedParams['image.format'] ?? 'rgb') as string;
      return { id: 'automation', data, width, height, format };
    }
    return resolvedParams[arg.param];
  });
}

export function getPluginMethodsForClient(): Record<
  string,
  { id: string; labelKey: string; settingsMethod?: string; params: { name: string; labelKey: string; type: string; placeholder?: string }[] }[]
> {
  const result: Record<
    string,
    { id: string; labelKey: string; settingsMethod?: string; params: { name: string; labelKey: string; type: string; placeholder?: string }[] }[]
  > = {};

  for (const [iface, methods] of Object.entries(PLUGIN_METHOD_REGISTRY)) {
    if (!methods) continue;
    result[iface] = methods.map((m) => ({
      id: m.id,
      labelKey: m.labelKey,
      settingsMethod: m.settingsMethod,
      params: m.params.map((p) => ({
        name: p.name,
        labelKey: p.labelKey,
        type: p.type,
        placeholder: p.placeholder,
      })),
    }));
  }

  return result;
}
