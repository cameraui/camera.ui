<template>
  <div class="cui-qrcode">
    <canvas ref="canvasRef" class="qrcode-canvas" :class="{ 'opacity-0': isLoading }" />
    <Transition name="fade">
      <div v-if="isLoading" class="qrcode-loading">
        <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import QRCode from 'qrcode';

import logoSvg from '@/assets/images/logo.svg';

import type { CuiQRCodeProps } from './types.js';

const props = withDefaults(defineProps<CuiQRCodeProps>(), {
  size: 200,
  logoSize: 44,
  margin: 2,
});

const log = useLogger();

const themeStore = useThemeStore();

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');
const isLoading = ref(true);
const logoImage = ref<HTMLImageElement | null>(null);

const isDark = computed(() => themeStore.theme === 'dark');
const qrColors = computed(() => ({
  dark: isDark.value ? '#ffffff' : '#171717',
  light: isDark.value ? '#171717' : '#ffffff',
}));

function loadLogo(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (logoImage.value) {
      resolve(logoImage.value);
      return;
    }

    const img = new Image();
    img.onload = () => {
      logoImage.value = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = logoSvg;
  });
}

function drawLogoOnCanvas(canvas: HTMLCanvasElement, logo: HTMLImageElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const logoSize = props.logoSize;
  const x = (canvas.width - logoSize) / 2;
  const y = (canvas.height - logoSize) / 2;

  const padding = 8;
  const radius = logoSize / 2 + padding;

  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, Math.PI * 2);
  ctx.fillStyle = qrColors.value.light;
  ctx.fill();

  ctx.drawImage(logo, x, y, logoSize, logoSize);
}

async function generateQRCode() {
  await nextTick();

  if (!canvasRef.value || !props.value) return;

  isLoading.value = true;

  try {
    const [logo] = await Promise.all([
      loadLogo(),
      QRCode.toCanvas(canvasRef.value, props.value, {
        width: props.size,
        margin: props.margin,
        errorCorrectionLevel: 'H',
        color: qrColors.value,
      }),
    ]);

    drawLogoOnCanvas(canvasRef.value, logo);
  } catch (error) {
    log.error('Failed to generate QR code:', error);
  } finally {
    isLoading.value = false;
  }
}

watch([() => props.value, () => props.size, qrColors], () => {
  if (props.value) {
    generateQRCode();
  }
});

onMounted(() => {
  if (props.value) {
    generateQRCode();
  }
});
</script>

<style scoped>
.cui-qrcode {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  overflow: hidden;
  background: var(--p-content-background);
  box-shadow: var(--p-overlay-modal-shadow);
}

.qrcode-canvas {
  display: block;
  transition: opacity 0.3s ease;
}

.qrcode-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: inherit;
}
</style>
