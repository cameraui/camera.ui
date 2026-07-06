<template>
  <div class="flex flex-col gap-3">
    <span class="text-wrap">{{ $t('components.dialog.message.intercom_info') }}</span>

    <div class="w-full h-full flex items-center justify-center relative">
      <Button rounded class="w-[60px] h-[60px] absolute z-1" @click="listenAudio">
        <template #icon>
          <i-mdi:microphone width="100%" height="100%" />
        </template>
      </Button>

      <canvas ref="canvasRef" height="300" width="300"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { AudioVisualizerEmits } from './types.js';

const emit = defineEmits<AudioVisualizerEmits>();

const log = useLogger();
const toast = useCuiToast();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const canvasRef = useTemplateRef('canvasRef');
const audioCtx = shallowRef<AudioContext>();
const tracks = shallowRef<MediaStreamTrack[]>();
const isListening = ref(false);

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value));

async function listenAudio(): Promise<void> {
  if (!isListening.value) {
    try {
      if (audioCtx.value) {
        cleanUp();
      }

      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error: any) {
        toast.add({ severity: 'warn', detail: 'Can not enable AudioVisualizer, see console.', life: 3000 });
        log.warn('Can not enable AudioVisualizer', error);
        return;
      }

      isListening.value = true;

      emit('listening', true);

      audioCtx.value = new AudioContext();
      const analyser = audioCtx.value.createAnalyser();

      analyser.fftSize = 1024;

      tracks.value = stream.getTracks();
      const source = audioCtx.value.createMediaStreamSource(stream);
      source.connect(analyser);

      const numBars = 90;
      const barWidth = 3;
      let barHeight: number;

      const canvasContext = canvasRef.value?.getContext('2d');

      const renderFrame = (): void => {
        if (canvasRef.value && canvasContext) {
          const freqDataMany: Uint8Array[] = [];
          const agg: number[] = [];

          canvasContext.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);

          requestAnimationFrame(renderFrame);

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyser.getByteFrequencyData(dataArray);
          freqDataMany.push(dataArray);

          for (let i = 0; i < freqDataMany[0].length; i++) {
            agg.push(0);
            freqDataMany.forEach((data) => {
              agg[i] += data[i];
            });
          }

          const centerX = canvasRef.value.width / 2;
          const centerY = canvasRef.value.height / 2;
          const radius = 30;

          canvasContext.beginPath();
          canvasContext.arc(centerX, centerY, radius, 0, 2 * Math.PI);
          canvasContext.lineWidth = 1;
          canvasContext.stroke();
          canvasContext.closePath();

          for (let i = 0; i < numBars; i++) {
            barHeight = agg[i] * 0.4;

            const rads = (Math.PI * 2) / numBars;
            const x = centerX + Math.cos(rads * i) * radius;
            const y = centerY + Math.sin(rads * i) * radius;
            const x_end = centerX + Math.cos(rads * i) * (radius + barHeight);
            const y_end = centerY + Math.sin(rads * i) * (radius + barHeight);

            drawBar(canvasContext, x, y, x_end, y_end, barWidth);
          }

          if (!isListening.value) {
            canvasContext.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
          }
        }
      };

      renderFrame();
    } catch (error: any) {
      cleanUp();
      log.error(error);
    }
  } else {
    cleanUp();
  }
}

function drawBar(canvasContext: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number) {
  const gradient = canvasContext.createLinearGradient(x1, y1, x2, y2);

  gradient.addColorStop(0, '#5b040f');
  gradient.addColorStop(0.5, '#b50b21');
  gradient.addColorStop(0.9, '#df2a4c');
  gradient.addColorStop(1, '#df6380');

  canvasContext.lineWidth = width;
  canvasContext.strokeStyle = gradient;

  canvasContext.beginPath();
  canvasContext.moveTo(x1, y1);
  canvasContext.lineTo(x2, y2);
  canvasContext.stroke();
  canvasContext.closePath();
}

function cleanUp(): void {
  audioCtx.value?.close();
  audioCtx.value = undefined;

  tracks.value?.forEach((track) => track.stop());
  tracks.value = undefined;

  isListening.value = false;

  emit('listening', false);
}

onUnmounted(() => {
  cleanUp();
});

defineExpose({
  isLoading,
});
</script>

<style scoped></style>
