import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fmp4 = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('node-av/api', () => ({
  FMP4_CODECS: {
    H264: 'h264',
    H265: 'hevc',
    AV1: 'av1',
    AAC: 'aac',
    OPUS: 'opus',
    FLAC: 'flac',
  },
  FMP4Stream: fmp4,
}));

vi.mock('../src/camera/streaming/node-av-log.js', () => ({
  setupNodeAvLog: vi.fn(),
}));

import { Fmp4Session } from '../src/camera/streaming/fmp4-session.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createSession(): Fmp4Session {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
  };
  const source = {
    name: 'main',
    generateRTSPUrl: vi.fn(() => 'rtsp://camera'),
  };
  const cameraDevice = {
    logger,
    sources: [source],
  };

  return new Fmp4Session(cameraDevice as never, source as never);
}

describe('Fmp4Session lifecycle', () => {
  beforeEach(() => {
    fmp4.create.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('awaits one native shutdown for concurrent stop calls', async () => {
    const shutdown = deferred();
    const nativeSession = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(() => shutdown.promise),
    };
    fmp4.create.mockReturnValue(nativeSession);
    const session = createSession();
    await session.startStream();

    let firstFinished = false;
    let secondFinished = false;
    const first = session.stop().then(() => {
      firstFinished = true;
    });
    const second = session.stop().then(() => {
      secondFinished = true;
    });

    await Promise.resolve();
    expect(nativeSession.stop).toHaveBeenCalledTimes(1);
    expect(firstFinished).toBe(false);
    expect(secondFinished).toBe(false);

    shutdown.resolve();
    await Promise.all([first, second]);
    expect(firstFinished).toBe(true);
    expect(secondFinished).toBe(true);
  });

  it('cleans up a partially started native session and rethrows the start error', async () => {
    const startError = new Error('start failed');
    const nativeSession = {
      start: vi.fn().mockRejectedValue(startError),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    fmp4.create.mockReturnValue(nativeSession);
    const session = createSession();

    await expect(session.startStream()).rejects.toBe(startError);
    expect(nativeSession.stop).toHaveBeenCalledTimes(1);
    await session.stop();
    expect(nativeSession.stop).toHaveBeenCalledTimes(1);
  });

  it('does not re-enter shutdown when native stop closes synchronously', async () => {
    let onClose!: () => void;
    const nativeSession = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(() => onClose()),
    };
    fmp4.create.mockImplementation((_url: string, options: { onClose: () => void }) => {
      onClose = options.onClose;
      return nativeSession;
    });
    const session = createSession();
    await session.startStream();

    await session.stop();
    expect(nativeSession.stop).toHaveBeenCalledTimes(1);
  });

  it('removes the abort listener when a box iterator is closed', async () => {
    const nativeSession = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    fmp4.create.mockReturnValue(nativeSession);
    const session = createSession();
    await session.startStream();

    const abort = new AbortController();
    const addEventListener = vi.spyOn(abort.signal, 'addEventListener');
    const removeEventListener = vi.spyOn(abort.signal, 'removeEventListener');
    const iterator = session.streamBoxes(abort.signal);
    const pending = iterator.next();
    await Promise.resolve();

    abort.abort();
    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(addEventListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
    await session.stop();
  });

  it('ends a slow consumer after the queue limit is exceeded', async () => {
    const nativeSession = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    fmp4.create.mockReturnValue(nativeSession);
    const session = createSession();
    await session.startStream();

    const options = fmp4.create.mock.calls[0][1];
    const iterator = session.streamBoxes();
    const first = iterator.next();
    await Promise.resolve();

    options.onData(Buffer.from('init'), { boxes: [{ type: 'ftyp' }, { type: 'moov' }] });
    for (let index = 0; index < 34; index += 1) {
      options.onData(Buffer.from(`box-${index}`), { boxes: [{ type: 'moof' }] });
    }

    await expect(first).resolves.toMatchObject({ done: false });
    await expect(iterator.next()).rejects.toThrow('fMP4 consumer too slow');
    await session.stop();
  });
});
