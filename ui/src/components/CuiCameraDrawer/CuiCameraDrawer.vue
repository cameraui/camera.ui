<template>
  <Drawer v-model:visible="visible" v-bind="drawerProps" class="border-0 md:border-l-[1px]" :pt="drawerPt" @hide="onHide">
    <template #container="{ closeCallback }">
      <div class="w-full h-full p-safe !pb-0 md:!pl-0 non-draggable-region">
        <div class="w-full h-full border-0 md:border-r-[1px] border-color overflow-y-auto pb-safe">
          <CameraOptions v-if="cameraOptions" v-bind="cameraOptions" @close="closeCallback" />
        </div>
      </div>
    </template>
  </Drawer>
</template>

<script setup lang="ts">
import type { PassThrough } from '@primevue/core';
import type { DrawerPassThroughOptions, DrawerProps } from 'primevue';
import type { CameraOptionsProps } from './component/types.js';

const router = useRouter();
const drawer = useCuiCameraDrawer();
const eventBus = drawer.getEventBus();

const visible = ref(false);
const cameraOptions = ref<CameraOptionsProps | undefined>();
const drawerProps = ref<DrawerProps | undefined>();

const drawerPt = computed<PassThrough<DrawerPassThroughOptions> | undefined>(() => {
  return DEFAULT_DRAWER_PROPS.pt;
});

function onHide() {
  visible.value = false;
  drawer.close();
}

watch(router.currentRoute, (newRoute, oldRoute) => {
  if (newRoute.path !== oldRoute.path) {
    drawer.close();
  }
});

onMounted(() => {
  eventBus.on((event) => {
    if (event.type === 'open') {
      cameraOptions.value = event.options;
      drawerProps.value = event.props;
      visible.value = true;
    } else if (event.type === 'close') {
      visible.value = false;
      cameraOptions.value = undefined;
    }
  });
});
</script>
