<template>
  <div>
    <template v-for="section in sections" :key="section.key">
      <span class="card-title">{{ $t(`views.settings.section_${section.key}`) }}</span>
      <CuiList size="large" dividers class="!h-auto mb-4 last:mb-0">
        <CuiListItem v-for="route in section.routes" :key="route.path" :to="`/settings/${route.path}`">
          <template #prepend>
            <component :is="route.meta!.settingsBar!.icon.default" class="w-5 h-5 text-muted" />
          </template>
          {{ $t(`navigation.${(route.meta!.name as string).toLowerCase()}`) }}
          <template #append>
            <i-mdi:chevron-right class="w-5 h-5 text-muted" />
          </template>
        </CuiListItem>
      </CuiList>
    </template>
  </div>
</template>

<script setup lang="ts">
const sections = useSettingsSections();
</script>
