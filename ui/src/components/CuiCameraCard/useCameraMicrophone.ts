import { startIntercomService, stopIntercomService } from '@/common/intercomService.js';

import type { Ref } from 'vue';

interface CameraMicrophoneOptions {
  ready: () => Promise<boolean>;
  held: () => boolean;
  setTrack: (track: MediaStreamTrack | null) => Promise<void>;
  onError: (error: unknown) => void;
}

export interface CameraMicrophone {
  active: Ref<boolean>;
  start: (onCaptured?: () => void) => Promise<void>;
  stop: () => Promise<void>;
}

export function useCameraMicrophone({ ready, held, setTrack, onError }: CameraMicrophoneOptions): CameraMicrophone {
  const active = ref(false);

  let stream: MediaStream | undefined;
  let request = 0;

  async function start(onCaptured?: () => void): Promise<void> {
    const current = ++request;
    if (!(await ready()) || current !== request) return;

    active.value = true;
    try {
      const captured = await navigator.mediaDevices.getUserMedia({ audio: true });
      // switched off or unmounted while the browser asked for the microphone
      if (current !== request) {
        stopTracks(captured);
        return;
      }
      if (stream) stopTracks(stream);
      stream = captured;
      onCaptured?.();
      await setTrack(captured.getAudioTracks()[0]);
      if (current === request) startIntercomService();
    } catch (error) {
      onError(error);
      if (current === request) await stop();
    }
  }

  async function stop(): Promise<void> {
    request++;
    if (!active.value) return;

    active.value = false;
    if (stream) stopTracks(stream);
    stream = undefined;
    await setTrack(null);
    stopIntercomService();
  }

  watch(held, (isHeld) => {
    if (!isHeld && active.value) stop();
  });

  onScopeDispose(() => {
    stop();
  });

  return { active, start, stop };
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
