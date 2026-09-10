import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { container } from 'tsyringe';

import type { ConfigService } from '../services/config/index.js';

const FFMPEG_TIMEOUT_MS = 60_000;
const MAX_FRAMES = 10;
const JPEG_START = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_END = Buffer.from([0xff, 0xd9]);
const EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
};

export function isWav(data: Buffer): boolean {
  return data.length > 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE';
}

export async function toWav(data: Buffer, mimeType: string): Promise<Buffer> {
  if (isWav(data)) return data;
  return withTempFile(data, mimeType, async (file) => {
    const { stdout } = await ffmpeg(['-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', 'pipe:1']);
    if (!isWav(stdout)) throw new Error('ffmpeg produced no audio, is the file an audio recording?');
    return stdout;
  });
}

export async function videoFrames(data: Buffer, mimeType: string, frames: number): Promise<Buffer[]> {
  const wanted = Math.min(Math.max(frames, 1), MAX_FRAMES);
  return withTempFile(data, mimeType, async (file) => {
    const duration = await videoDuration(file);
    const fps = duration && duration > wanted ? wanted / duration : 1;
    const { stdout } = await ffmpeg([
      '-i',
      file,
      '-vf',
      `fps=${fps.toFixed(4)},scale='min(1280,iw)':-2`,
      '-frames:v',
      String(wanted),
      '-f',
      'image2pipe',
      '-c:v',
      'mjpeg',
      '-q:v',
      '4',
      'pipe:1',
    ]);
    const pictures = splitJpegs(stdout);
    if (!pictures.length) throw new Error('ffmpeg produced no frames, is the file a video?');
    return pictures;
  });
}

async function videoDuration(file: string): Promise<number | undefined> {
  const { stderr } = await ffmpeg(['-i', file], true);
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) return undefined;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function withTempFile<T>(data: Buffer, mimeType: string, fn: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'cui-assistant-'));
  const file = join(dir, `input.${EXTENSIONS[mimeType] ?? 'bin'}`);
  try {
    await writeFile(file, data);
    return await fn(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function ffmpeg(args: string[], ignoreExit = false): Promise<{ stdout: Buffer; stderr: string }> {
  const bin = container.resolve<ConfigService>('configService').go2rtcConfig.ffmpeg?.bin ?? 'ffmpeg';
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('ffmpeg timed out'));
    }, FFMPEG_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !ignoreExit) return reject(new Error(`ffmpeg failed: ${err.trim().split('\n').slice(-2).join(' ') || `exit ${code}`}`));
      resolve({ stdout: Buffer.concat(out), stderr: err });
    });
  });
}

function splitJpegs(stream: Buffer): Buffer[] {
  const pictures: Buffer[] = [];
  let offset = 0;
  while (offset < stream.length) {
    const start = stream.indexOf(JPEG_START, offset);
    if (start < 0) break;
    const end = stream.indexOf(JPEG_END, start + 3);
    if (end < 0) break;
    pictures.push(stream.subarray(start, end + 2));
    offset = end + 2;
  }
  return pictures;
}
