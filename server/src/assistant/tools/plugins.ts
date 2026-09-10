import { PromiseTimeout } from '@camera.ui/common/utils';
import { hasInterface } from '@camera.ui/sdk';
import { toolDefinition } from '@tanstack/ai';
import * as zod from 'zod';

import { PluginsService } from '../../api/services/plugins.service.js';
import { PLUGIN_METHOD_REGISTRY } from '../../automations/pluginMethodRegistry.js';
import { toWav, videoFrames } from '../media.js';
import { takeSnapshot } from './cameras.js';
import { toolError, withImages } from './shared.js';

import type { PluginInterface } from '@camera.ui/sdk';
import type { PluginMethodDef, PluginMethodParamType } from '../../automations/pluginMethodRegistry.js';
import type { Plugin } from '../../plugins/plugin.js';
import type { AssistantToolRegistry } from '../registry.js';
import type { AssistantUpload } from '../types.js';
import type { CoreTool, ToolContext } from './shared.js';

const CALL_TIMEOUT_MS = 30_000;
const FRAME_GAP_MS = 1_000;
const MAX_DETECTIONS = 25;
const VECTOR_KEYS = new Set(['embedding', 'embeddings', 'vector', 'thumbnail']);

type PluginMethod = (...args: unknown[]) => Promise<unknown>;

interface Picture {
  data: Buffer;
  caption: string;
}

const analyzeImageInput = zod.object({
  plugin: zod.string().describe('Plugin name from plugin_capabilities'),
  method: zod.string().describe('Picture method from plugin_capabilities, e.g. testObjectDetection, testFaceDetection, testLicensePlateDetection, testClipEmbedding'),
  camera: zod.string().optional().describe('Camera name for a fresh snapshot'),
  eventId: zod.string().optional().describe('Event or episode id from a recording tool, uses its picture (needs the NVR plugin)'),
  upload: zod.string().optional().describe('Id of a picture the user attached, e.g. upload-1'),
  frames: zod.number().int().min(1).max(5).optional().describe('Snapshots to take one second apart and analyze one by one, only with camera'),
  text: zod.string().optional().describe('For testClipEmbedding: a description in English the picture is compared with'),
});

const analyzeAudioInput = zod.object({
  plugin: zod.string().describe('Plugin name from plugin_capabilities with an audio method'),
  upload: zod.string().describe('Id of an audio file the user attached, e.g. upload-2'),
});

const analyzeVideoInput = zod.object({
  plugin: zod.string().describe('Plugin name from plugin_capabilities'),
  method: zod.string().describe('testMotionDetection for the whole clip, or a picture method that runs on frames taken from the clip'),
  upload: zod.string().describe('Id of a video the user attached, e.g. upload-3'),
  frames: zod.number().int().min(1).max(10).optional().describe('Frames spread over the clip for picture methods, default 5'),
});

export function createPluginTools(registry: AssistantToolRegistry): CoreTool[] {
  const pluginCapabilities = toolDefinition({
    name: 'plugin_capabilities',
    description:
      'What every running plugin can do: its interfaces (object, face, license plate, audio, classifier and CLIP detection, discovery, NVR, notifier), ' +
      'the detection methods analyze_image, analyze_audio and analyze_video can run on it, and the tools it adds to this chat. Call it first to pick plugin and method.',
    inputSchema: zod.object({}),
  }).server<ToolContext['context']>((_input, ctx) => {
    const tools = registry.describe(ctx.context.role);
    return installed().map((plugin) => ({
      plugin: plugin.displayName,
      package: plugin.pluginName,
      version: plugin.info.installedVersion,
      running: plugin.worker.isRunning(),
      status: plugin.worker.status,
      interfaces: plugin.contract.interfaces,
      pictureMethods: methodsFor(plugin, 'image').map((def) => def.id),
      audioMethods: methodsFor(plugin, 'audio').map((def) => def.id),
      videoMethods: methodsFor(plugin, 'video').map((def) => def.id),
      tools: tools.filter((tool) => tool.source.kind === 'plugin' && tool.source.pluginId === plugin.id).map((tool) => tool.name),
    }));
  });

  const analyzeImage = toolDefinition({
    name: 'analyze_image',
    description:
      'Run a detection method of a plugin on a picture: a fresh camera snapshot, the picture of a recorded event, or a picture the user attached. ' +
      'Returns what the detector found (labels with confidence and box, faces with identity, plate text, classifier labels) or, for testClipEmbedding ' +
      'with a text, how well the picture matches that description. Several frames from a camera give a short live sequence, one result per frame.',
    inputSchema: analyzeImageInput,
  }).server<ToolContext['context']>(async (input, ctx) => {
    const target = resolve(input.plugin, input.method, 'image');
    if ('error' in target) return toolError(target.error);

    const pictures = await collectPictures(input, ctx);
    if ('error' in pictures) return toolError(pictures.error);

    const textVector = input.text && target.def.id === 'testClipEmbedding' ? await textEmbedding(target.proxy, input.text) : undefined;
    const results = [];
    for (const picture of pictures.images) results.push({ picture: picture.caption, ...(await runOnPicture(target, picture, textVector, input.text)) });

    const summary = `${target.def.id} of ${target.plugin.displayName} on ${pictures.images.length} picture(s): ${JSON.stringify(results)}`;
    if (input.upload) return summary;
    return withImages(summary, [{ data: pictures.images[0].data.toString('base64'), mimeType: 'image/jpeg', caption: pictures.images[0].caption }], ctx);
  });

  const analyzeAudio = toolDefinition({
    name: 'analyze_audio',
    lazy: true,
    description: 'Run the audio detection of a plugin on an audio file the user attached (wav, mp3, m4a, ogg) and return the sound labels it heard with their scores.',
    inputSchema: analyzeAudioInput,
  }).server<ToolContext['context']>(async (input, ctx) => {
    const plugin = findPlugin(input.plugin);
    if (!plugin) return toolError(`No plugin "${input.plugin}". Call plugin_capabilities for the names.`);
    if (!plugin.worker.isRunning()) return toolError(`Plugin "${plugin.displayName}" is not running right now (${plugin.worker.status}), try again in a moment.`);
    const def = methodsFor(plugin, 'audio')[0];
    if (!def) return toolError(`Plugin "${plugin.displayName}" has no audio method.`);
    const method = (plugin.worker.pluginProxy as unknown as Record<string, PluginMethod | undefined>)[def.id];
    if (!method) return toolError(`Plugin "${plugin.displayName}" does not implement ${def.id}.`);

    const upload = findUpload(ctx, input.upload, 'audio');
    if ('error' in upload) return toolError(upload.error);

    const wav = await toWav(upload.data, upload.mimeType);
    const raw = await PromiseTimeout(method(wav, { mimeType: 'audio/wav' }, {}), CALL_TIMEOUT_MS, undefined, `${def.id} timed out`);
    return { plugin: plugin.displayName, method: def.id, upload: upload.id, seconds: Math.round(wav.byteLength / 32_000), ...(compact(raw) as Record<string, unknown>) };
  });

  const analyzeVideo = toolDefinition({
    name: 'analyze_video',
    lazy: true,
    description:
      'Run a plugin detector on a video the user attached: testMotionDetection looks at the whole clip, a picture method (objects, faces, plates, CLIP) ' +
      'runs on frames spread over the clip and returns one result per frame with its time offset.',
    inputSchema: analyzeVideoInput,
  }).server<ToolContext['context']>(async (input, ctx) => {
    const upload = findUpload(ctx, input.upload, 'video');
    if ('error' in upload) return toolError(upload.error);

    const clipTarget = resolve(input.plugin, input.method, 'video');
    if (!('error' in clipTarget)) {
      const raw = await PromiseTimeout(clipTarget.method(upload.data, {}), CALL_TIMEOUT_MS * 2, undefined, `${clipTarget.def.id} timed out`);
      return { plugin: clipTarget.plugin.displayName, method: clipTarget.def.id, upload: upload.id, ...(compact(raw) as Record<string, unknown>) };
    }

    const target = resolve(input.plugin, input.method, 'image');
    if ('error' in target) {
      const plugin = findPlugin(input.plugin);
      const offered = plugin ? [...methodsFor(plugin, 'video'), ...methodsFor(plugin, 'image')].map((m) => m.id) : [];
      return toolError(plugin ? `Plugin "${plugin.displayName}" offers ${offered.join(', ') || 'no video or picture methods'}.` : target.error);
    }

    const frames = await videoFrames(upload.data, upload.mimeType, input.frames ?? 5);
    const results = [];
    for (const [index, frame] of frames.entries()) {
      results.push({ frame: index + 1, ...(await runOnPicture(target, { data: frame, caption: `${upload.id} frame ${index + 1}` })) });
    }
    const summary =
      `${target.def.id} of ${target.plugin.displayName} on ${frames.length} frames of ${upload.id}, spread evenly over the clip: ` + JSON.stringify(results);
    return withImages(summary, [{ data: frames[0].toString('base64'), mimeType: 'image/jpeg', caption: `${upload.id} frame 1` }], ctx);
  });

  async function collectPictures(input: zod.infer<typeof analyzeImageInput>, ctx: ToolContext): Promise<{ images: Picture[] } | { error: string }> {
    if (input.upload) {
      const upload = findUpload(ctx, input.upload, 'image');
      if ('error' in upload) return upload;
      return { images: [{ data: upload.data, caption: upload.id }] };
    }
    if (input.camera) {
      const images: Picture[] = [];
      const frames = input.frames ?? 1;
      for (let i = 0; i < frames; i += 1) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, FRAME_GAP_MS));
        const snapshot = await takeSnapshot(input.camera);
        if ('error' in snapshot) return snapshot;
        images.push({ data: snapshot.data, caption: frames > 1 ? `${snapshot.name} frame ${i + 1}` : snapshot.name });
      }
      return { images };
    }
    if (input.eventId) {
      const result = await registry.callPluginTool('get_event_image', { eventId: input.eventId }, ctx);
      if (!result) return { error: 'No plugin offers event pictures, the NVR plugin is not running.' };
      if (result.error) return { error: result.error };
      const image = result.images?.find((img) => typeof img.data === 'string' && img.data.length > 0);
      if (!image) return { error: `Event "${input.eventId}" has no picture.` };
      return { images: [{ data: Buffer.from(image.data, 'base64'), caption: image.caption ?? `event ${input.eventId}` }] };
    }
    return { error: 'Pass a camera name, an eventId or an upload id.' };
  }

  return [pluginCapabilities, analyzeImage, analyzeAudio, analyzeVideo];
}

interface Target {
  plugin: Plugin;
  def: PluginMethodDef;
  proxy: Record<string, PluginMethod | undefined>;
  method: PluginMethod;
}

function resolve(pluginName: string, methodId: string, type: PluginMethodParamType): Target | { error: string } {
  const plugin = findPlugin(pluginName);
  if (!plugin) return { error: `No plugin "${pluginName}". Call plugin_capabilities for the names.` };
  if (!plugin.worker.isRunning()) return { error: `Plugin "${plugin.displayName}" is not running right now (${plugin.worker.status}), try again in a moment.` };
  const methods = methodsFor(plugin, type);
  const def = methods.find((m) => m.id === methodId);
  if (!def) return { error: `Plugin "${plugin.displayName}" offers ${methods.map((m) => m.id).join(', ') || `no ${type} methods`}.` };
  const proxy = plugin.worker.pluginProxy as unknown as Record<string, PluginMethod | undefined>;
  const method = proxy[def.id];
  if (!method) return { error: `Plugin "${plugin.displayName}" does not implement ${def.id}.` };
  return { plugin, def, proxy, method };
}

async function runOnPicture(target: Target, picture: Picture, textVector?: number[], text?: string): Promise<Record<string, unknown>> {
  const raw = await PromiseTimeout(target.method(picture.data, { width: 0, height: 0 }, {}), CALL_TIMEOUT_MS, undefined, `${target.def.id} timed out`);
  const result = compact(raw) as Record<string, unknown>;
  if (textVector) {
    const vectors = ((raw as { embeddings?: { embedding?: number[] }[] })?.embeddings ?? []).map((e) => e.embedding).filter(Array.isArray);
    result.similarity = vectors.length ? Math.max(...vectors.map((v) => cosine(v, textVector))) : undefined;
    result.text = text;
  }
  return result;
}

function findUpload(ctx: ToolContext, id: string, kind: AssistantUpload['kind']): AssistantUpload | { error: string } {
  const needle = id.trim().toLowerCase();
  const upload = (ctx.context.uploads ?? []).find((u) => u.id === needle || u.key === needle);
  if (!upload) return { error: `No attachment "${id}" in this conversation. Attachments are listed as upload-1, upload-2 and so on.` };
  if (upload.tooLarge) return { error: `${upload.id} is too large to analyze.` };
  if (upload.kind !== kind) return { error: `${upload.id} is ${upload.kind}, this tool needs ${kind}.` };
  return upload;
}

function installed(): Plugin[] {
  return new PluginsService().listPlugins().filter((plugin) => !plugin.disabled);
}

function findPlugin(name: string): Plugin | undefined {
  const needle = name.trim().toLowerCase();
  return installed().find(
    (plugin) => plugin.displayName.toLowerCase() === needle || plugin.pluginName.toLowerCase() === needle || plugin.pluginName.toLowerCase().endsWith(`/${needle}`),
  );
}

// only the encoded-input methods of the automation registry, the raw-frame variants need the worker's frame format
function methodsFor(plugin: Plugin, type: PluginMethodParamType): PluginMethodDef[] {
  const out: PluginMethodDef[] = [];
  for (const [iface, methods] of Object.entries(PLUGIN_METHOD_REGISTRY)) {
    if (!methods || !hasInterface(plugin.contract, iface as PluginInterface)) continue;
    for (const def of methods) {
      const encoded = def.params.some((p) => p.type === type && p.binary) && def.args.every((arg) => !('frame' in arg) && !('audioFrame' in arg));
      if (encoded) out.push(def);
    }
  }
  return out;
}

async function textEmbedding(proxy: Record<string, PluginMethod | undefined>, text: string): Promise<number[] | undefined> {
  const method = proxy.getTextEmbedding;
  if (!method) return undefined;
  const raw = await PromiseTimeout(method(text), CALL_TIMEOUT_MS, undefined, 'getTextEmbedding timed out');
  if (Array.isArray(raw)) return raw as number[];
  const single = (raw as { embedding?: number[] })?.embedding;
  if (Array.isArray(single)) return single;
  const first = (raw as { embeddings?: { embedding?: number[] }[] })?.embeddings?.[0]?.embedding;
  return Array.isArray(first) ? first : undefined;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? Math.round((dot / Math.sqrt(na * nb)) * 1000) / 1000 : 0;
}

function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, MAX_DETECTIONS).map(compact);
  if (value && typeof value === 'object') {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (VECTOR_KEYS.has(key)) continue;
      const next = compact(inner);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  if (typeof value === 'number') return Math.round(value * 100) / 100;
  return value;
}
