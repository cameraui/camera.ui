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

          <table v-else class="cui-chart-table w-full" :class="{ 'cui-chart-table-grouped': groups }">
            <thead>
              <tr>
                <th v-for="(header, i) in headers" :key="i" :class="header.columnProps?.headerClass" class="p-2 h-7 min-h-7 max-h-7 text-sm">
                  <div class="flex items-center gap-1">
                    <span>{{ header.name ?? '' }}</span>
                    <span v-if="header.headerTooltip" v-tooltip="{ value: header.headerTooltip }" class="inline-flex shrink-0">
                      <i-mdi:information-outline class="w-3.5 h-3.5 text-muted-color" />
                    </span>
                  </div>
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

              <tr v-for="(data, ri) in displayItems" v-else :key="ri" class="text-sm text-secondary" :class="{ 'cui-chart-row-alt': groups?.alt[ri] }">
                <template v-for="(header, hi) in headers" :key="hi">
                  <td v-if="groupSpan(ri, header) !== 0" :rowspan="groupSpan(ri, header)" :class="header.columnProps?.class" class="p-2 h-7 min-h-7 max-h-7">
                    <div v-if="isHeaderIndicator(header)" v-bind="header.props">
                      <Badge v-tooltip="{ value: header.tooltip?.(data) }" :style="{ background: header.color?.(data) ?? 'gray' }" />
                    </div>

                    <div v-else-if="isHeaderCategory(header)" v-tooltip="{ value: header.tooltip?.(data) }" class="w-fit flex flex-wrap items-center gap-1.5">
                      <Chip v-if="header.asChip" v-bind="header.chipProps">
                        <span>{{ header.altName ? header.altName : typeof header.field === 'string' ? data[header.field] : header.field(data) }}</span>
                        <span v-if="header.suffix">{{ header.suffix }}</span>
                      </Chip>
                      <span v-else v-bind="header.props">
                        <span>{{ header.altName ? header.altName : typeof header.field === 'string' ? data[header.field] : header.field(data) }}</span>
                        <span v-if="header.suffix">{{ header.suffix }}</span>
                      </span>
                      <Chip
                        v-if="header.badge?.(data)"
                        v-tooltip="{ value: header.badgeTooltip?.(data) }"
                        :label="header.badge?.(data)"
                        class="text-xs font-normal shrink-0"
                      />
                    </div>

                    <div v-else-if="isHeaderChart(header) && chartData && chartData[`${data.name}_${header.for}`]" v-bind="header.props">
                      <ChartWrapper :data="chartData[`${data.name}_${header.for}`]!" :options="getChartOptions(header, data)" :height="25" />
                    </div>

                    <div v-else-if="isHeaderAction(header)" v-bind="header.props" class="flex items-center justify-end gap-1">
                      <template v-if="header.buttons?.length">
                        <template v-for="(btn, bi) in header.buttons" :key="bi">
                          <Button
                            v-if="!btn.disabled?.(data)"
                            v-tooltip.left="btn.tooltip?.(data)"
                            rounded
                            :loading="btn.loading?.(data)"
                            v-bind="btn.buttonProps"
                            :class="['cui-icon-md', { 'text-white': btn.buttonProps?.severity !== 'secondary' }]"
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
                        v-tooltip.left="header.tooltip?.(data)"
                        rounded
                        :loading="header.loading?.(data)"
                        v-bind="header.buttonProps"
                        :class="['cui-icon-md', { 'text-white': header.buttonProps?.severity !== 'secondary' }]"
                        @click="header.action?.(data)"
                      >
                        <template #icon>
                          <component :is="header.icon" />
                        </template>
                      </Button>
                    </div>
                  </td>
                </template>
                <td class="w-0 p-0 m-0" />
              </tr>
            </tbody>
          </table>

          <Paginator
            v-if="paginator && totalPages > 1"
            :rows="rows"
            :total-records="totalRecords ?? 0"
            :first="(currentPage - 1) * rows"
            :template="TABLE_PAGINATOR_TEMPLATE"
            :page-link-size="TABLE_PAGE_LINK_SIZE"
            @page="goToPage($event.page + 1)"
          />
        </div>

        <div v-if="$slots.actions" class="flex flex-wrap items-end justify-between gap-2 pt-4">
          <slot name="actions" />
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { TABLE_PAGE_LINK_SIZE, TABLE_PAGINATOR_TEMPLATE } from '@/common/constants.js';
import { isHeaderAction, isHeaderCategory, isHeaderChart, isHeaderIndicator } from './types.js';

import type { ChartData, ChartOptions } from 'chart.js';
import type { CuiChartTableEmits, CuiChartTableProps, TableHeader, TableHeaderChart } from './types.js';

const props = defineProps<CuiChartTableProps>();

const emit = defineEmits<CuiChartTableEmits>();

const themeStore = useThemeStore();
const { theme } = storeToRefs(themeStore);

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { headers, items: value, loading, chartData, paginator, pagination, totalRecords, groupBy } = toRefs(props);

const rows = computed(() => props.rows ?? uiSettings.value.interface.tableRows);

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
  const pageSize = rows.value;
  const page = currentPage.value - 1;
  return value.value.slice(page * pageSize, (page + 1) * pageSize);
});

const groups = computed(() => {
  const field = groupBy.value;
  if (!field) return undefined;
  const spans: number[] = [];
  const alt: boolean[] = [];
  let start = -1;
  let stripe = true;
  displayItems.value.forEach((item, i) => {
    if (start >= 0 && item[field] === displayItems.value[start][field]) {
      spans[start]++;
      spans.push(0);
    } else {
      start = i;
      stripe = !stripe;
      spans.push(1);
    }
    alt.push(stripe);
  });
  return { spans, alt };
});

function groupSpan(rowIndex: number, header: TableHeader): number | undefined {
  if (!groups.value || !isHeaderCategory(header) || header.field !== groupBy.value) return undefined;
  return groups.value.spans[rowIndex];
}

function goToPage(page: number) {
  const pageSize = rows.value;
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
  border-bottom: 1px solid var(--p-datatable-body-cell-border-color);
}

.cui-chart-table td > div,
.cui-chart-table td > span {
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-all;
  hyphens: auto;
}

.cui-chart-table:not(.cui-chart-table-grouped) tbody tr:nth-child(even),
.cui-chart-table tbody tr.cui-chart-row-alt {
  background-color: var(--table-row-odd-background);
}
</style>
