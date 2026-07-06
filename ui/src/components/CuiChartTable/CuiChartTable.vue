<template>
  <div>
    <Card class="cui-card">
      <template #content>
        <Transition name="fade">
          <div v-if="!markerVisible" class="absolute right-[20px] top-[5px] z-2">
            <i-flowbite:arrow-right-outline width="20px" height="20px" class="opacity-15" />
          </div>
        </Transition>

        <div ref="scrollTarget" class="overflow-x-auto relative">
          <div v-if="loading" class="flex justify-center p-8">
            <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
          </div>

          <table v-else class="cui-chart-table w-full">
            <thead>
              <tr>
                <th v-for="(header, i) in headers" :key="i" :class="header.columnProps?.headerClass" class="p-2 h-7 min-h-7 max-h-7 text-sm">
                  {{ header.name ?? '' }}
                </th>
                <th ref="endMarker" class="w-0 p-0 m-0" />
              </tr>
            </thead>
            <tbody>
              <tr v-if="!displayItems.length" class="text-sm text-secondary">
                <td :colspan="headers.length + 1" class="p-4 text-center text-muted">
                  {{ emptyMessage ?? $t('components.process_table.empty') }}
                </td>
              </tr>

              <tr v-for="(data, ri) in displayItems" v-else :key="ri" class="text-sm text-secondary">
                <td v-for="(header, hi) in headers" :key="hi" :class="header.columnProps?.class" class="p-2 h-7 min-h-7 max-h-7">
                  <div v-if="isHeaderIndicator(header)" v-bind="header.props">
                    <Badge v-tooltip="{ value: header.tooltip?.(data) }" :style="{ background: header.color?.(data) ?? 'gray' }" />
                  </div>

                  <div v-else-if="isHeaderCategory(header)" v-bind="header.props">
                    <Chip v-if="header.asChip" v-bind="header.chipProps">
                      <span>{{ header.altName ? header.altName : typeof header.field === 'string' ? data[header.field] : header.field(data) }}</span>
                      <span v-if="header.suffix">{{ header.suffix }}</span>
                    </Chip>
                    <span v-else>
                      <span>{{ header.altName ? header.altName : typeof header.field === 'string' ? data[header.field] : header.field(data) }}</span>
                      <span v-if="header.suffix">{{ header.suffix }}</span>
                    </span>
                  </div>

                  <div v-else-if="isHeaderChart(header) && chartData && chartData[`${data.name}_${header.for}`]" v-bind="header.props">
                    <ChartWrapper :data="chartData[`${data.name}_${header.for}`]!" :options="getChartOptions(header, data)" :height="25" />
                  </div>

                  <div v-else-if="isHeaderAction(header)" v-bind="header.props" class="flex items-center justify-end gap-1">
                    <template v-if="header.buttons?.length">
                      <template v-for="(btn, bi) in header.buttons" :key="bi">
                        <Button
                          v-if="!btn.disabled?.(data)"
                          rounded
                          :loading="btn.loading?.(data)"
                          v-bind="btn.buttonProps"
                          class="text-white cui-icon-md"
                          @click="btn.action(data)"
                        >
                          <template #icon>
                            <component :is="btn.icon" />
                          </template>
                        </Button>
                      </template>
                    </template>
                    <Button
                      v-else-if="!header.disabled?.(data)"
                      rounded
                      :loading="header.loading?.(data)"
                      v-bind="header.buttonProps"
                      class="text-white cui-icon-md"
                      @click="header.action?.(data)"
                    >
                      <template #icon>
                        <component :is="header.icon" />
                      </template>
                    </Button>
                  </div>
                </td>
                <td class="w-0 p-0 m-0" />
              </tr>
            </tbody>
          </table>

          <div v-if="paginator && totalPages > 1" class="flex items-center justify-center gap-1 p-2 border-t border-surface">
            <Button text rounded class="cui-icon-sm" :disabled="currentPage <= 1" @click="goToPage(1)">
              <template #icon><i-mdi:chevron-double-left width="100%" height="100%" /></template>
            </Button>
            <Button text rounded class="cui-icon-sm" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
              <template #icon><i-mdi:chevron-left width="100%" height="100%" /></template>
            </Button>
            <span class="text-xs text-muted px-2">{{ currentPage }} / {{ totalPages }}</span>
            <Button text rounded class="cui-icon-sm" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">
              <template #icon><i-mdi:chevron-right width="100%" height="100%" /></template>
            </Button>
            <Button text rounded class="cui-icon-sm" :disabled="currentPage >= totalPages" @click="goToPage(totalPages)">
              <template #icon><i-mdi:chevron-double-right width="100%" height="100%" /></template>
            </Button>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { isHeaderAction, isHeaderCategory, isHeaderChart, isHeaderIndicator } from './types.js';

import type { ChartData, ChartOptions } from 'chart.js';
import type { CuiChartTableEmits, CuiChartTableProps, TableHeaderChart } from './types.js';

const props = withDefaults(defineProps<CuiChartTableProps>(), {
  rows: 5,
});

const emit = defineEmits<CuiChartTableEmits>();

const themeStore = useThemeStore();
const { theme } = storeToRefs(themeStore);

const { headers, items: value, loading, chartData, paginator, pagination, totalRecords, rows } = toRefs(props);

const endMarker = useTemplateRef<HTMLElement>('endMarker');
const scrollTarget = useTemplateRef<HTMLElement>('scrollTarget');

const markerVisible = useElementVisibility(endMarker, {
  scrollTarget,
});

const currentPage = computed(() => pagination.value?.page ?? 1);
const totalPages = computed(() => {
  if (!totalRecords.value || !rows.value) return 1;
  return Math.max(1, Math.ceil(totalRecords.value / rows.value));
});

const displayItems = computed(() => {
  if (!value.value) return [];
  if (!paginator.value) return value.value;
  const pageSize = rows.value ?? 5;
  const page = currentPage.value - 1;
  return value.value.slice(page * pageSize, (page + 1) * pageSize);
});

function goToPage(page: number) {
  const pageSize = rows.value ?? 5;
  emit('update:page', { page: page - 1, rows: pageSize, first: (page - 1) * pageSize });
}

function getChartOptions(header: TableHeaderChart, data: any): ChartOptions<'bar'> {
  const chartKey = `${data.name}_${header.for}`;
  const chartDataset = (chartData.value?.[chartKey] as ChartData<'bar'>)?.datasets?.[0]?.data ?? [];
  const maxValue = Math.max(...chartDataset.map((value) => Number(value) || 0));
  const roundedMax = Math.ceil(maxValue / 10) * 10;

  return {
    responsive: false,
    maintainAspectRatio: false,
    devicePixelRatio: 1,
    animation: false,
    events: [],
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
        mode: 'point',
        intersect: false,
        backgroundColor: theme.value === 'dark' ? '#2e2e2e' : '#f1f5f9',
        titleColor: theme.value === 'dark' ? '#ffffff' : '#000000',
        bodyColor: theme.value === 'dark' ? '#ffffff' : '#000000',
        displayColors: false,
        padding: 8,
        callbacks: {
          title: (tooltipItems) => {
            const timestamp = tooltipItems[0].label;
            if (timestamp && !isNaN(Number(timestamp))) {
              const time = new Date(Number(timestamp)).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const value = tooltipItems[0].raw as number;
              const formatted = [`${time}`, `${value.toFixed(2)}%`];
              return formatted.join(' - ');
            }
            return '';
          },
        },
      },
    },
    scales: {
      x: {
        display: false,
        grid: {
          display: false,
        },
      },
      y: {
        display: false,
        min: 0,
        max: roundedMax || 100,
        grid: {
          display: false,
        },
      },
    },
  };
}
</script>

<style scoped>
.cui-chart-table {
  border-collapse: collapse;
}

.cui-chart-table th {
  text-align: left;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 1px solid var(--p-content-border-color);
}

.cui-chart-table td {
  white-space: nowrap;
  border-color: var(--p-datatable-body-cell-border-color);
  border-style: solid;
  border-width: 0 0 1px 0;
}

.cui-chart-table td > div,
.cui-chart-table td > span {
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-all;
  hyphens: auto;
}

.cui-chart-table tbody tr:nth-child(even) {
  background-color: var(--table-row-odd-background);
}
</style>
