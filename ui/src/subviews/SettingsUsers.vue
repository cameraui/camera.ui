<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">{{ $t('views.settings.registered_users') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <CuiDataTable
                v-model:filters="filters"
                :value="users?.result"
                :paginator="pagination.page! > 1 || (users?.result && users.result.length > 15)"
                data-key="id"
                filter-display="menu"
                :loading="isLoading"
                :global-filter-fields="['username']"
                :pt="tablePtOptions"
                striped-rows
                scrollable
              >
                <template #loading>
                  <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
                </template>

                <Column
                  field="username"
                  align-frozen="left"
                  :frozen="!mdBreakpoint"
                  :header="$t('views.settings.title_user')"
                  header-class="p-2 h-7 min-h-7 max-h-7 w-40 min-w-40 max-w-40"
                  class="p-2 h-7 min-h-7 max-h-7 w-40 min-w-40 max-w-40"
                >
                  <template #body="{ data }">
                    <div class="flex items-center gap-2">
                      <CuiAvatar :src="data.avatar" :size="54" />
                      <div class="flex flex-col">
                        <span class="text-sm font-semibold text-color">{{ data.username }}</span>
                        <span class="text-xs text-muted">{{ data.role }}</span>
                      </div>
                    </div>
                  </template>
                </Column>

                <Column field="action" header-class="p-2 h-7 min-h-7 max-h-7" class="p-2 h-7 min-h-7 max-h-7 text-right">
                  <template #body="{ data }">
                    <div>
                      <Button severity="secondary" text rounded :loading="isLoading" class="cui-icon-md" @click="menuRef?.toggleMenu($event, undefined, data)">
                        <template #icon>
                          <div class="relative w-6 h-6">
                            <div
                              class="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transform transition-all duration-100 origin-center bg-current"
                              :class="{
                                'w-4 h-[2px] rotate-45 top-1/2 -translate-y-1/2 rounded-none': menuRef?.isOpen && menuRef?.data?._id === data._id,
                              }"
                            />
                            <div
                              class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full transition-all duration-100 bg-current"
                              :class="{
                                'opacity-0 scale-0': menuRef?.isOpen && menuRef?.data?._id === data._id,
                              }"
                            />
                            <div
                              class="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transform transition-all duration-100 origin-center bg-current"
                              :class="{
                                'w-4 h-[2px] -rotate-45 bottom-1/2 translate-y-1/2 rounded-none': menuRef?.isOpen && menuRef?.data?._id === data._id,
                              }"
                            />
                          </div>
                        </template>
                      </Button>
                    </div>
                  </template>
                </Column>
              </CuiDataTable>

              <div class="flex flex-row items-end justify-end gap-2">
                <Button
                  severity="success"
                  :loading="isLoading"
                  class="cui-button-medium mr-4 md:mr-0"
                  :label="$t('components.form.button.create_new_user')"
                  @click="openUserDialog()"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>
    </div>

    <CuiMenu
      ref="menuRef"
      :items
      :popover="{
        pt: {
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    ></CuiMenu>
  </div>
</template>

<script setup lang="ts">
import { FilterMatchMode } from '@primevue/core/api';
import TrashIcon from '~icons/mdi/delete';
import EditIcon from '~icons/mdi/account-edit';

import { UsersQuery } from '@/api/routes/users.js';
import UserFormDialog from '@/components/CuiDialog/templates/UserForm/UserForm.vue';
import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';

import type { UserFormProps } from '@/components/CuiDialog/templates/UserForm/types.js';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { PassThrough } from '@primevue/core';
import type { DBUser, PaginationQuery } from '@shared/types';
import type { DataTableFilterMeta, DataTablePassThroughOptions } from 'primevue';

const usersQuery = new UsersQuery();

const dialog = useCuiDialog();
const { mdBreakpoint } = useSharedCuiBreakpoint();
const { t } = useI18n();

const pagination = ref<PaginationQuery>({ pageSize: 15, page: 1 });

const { data: users, isBusy: usersLoading } = usersQuery.getUsersQuery(pagination);
const { mutate: removeUser, isPending: removeLoading } = usersQuery.removeUserQuery();

const tablePtOptions: PassThrough<DataTablePassThroughOptions> = {
  bodyRow: {
    class: 'text-sm text-secondary',
  },
  column: {
    columnTitle: {
      class: 'text-sm',
    },
  },
};

const filters = ref<DataTableFilterMeta>({
  global: { value: null, matchMode: FilterMatchMode.CONTAINS },
});
const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');

const isLoading = computed(() => usersLoading.value || removeLoading.value);

const items = computed<MenuItem[]>(() => {
  return [
    {
      label: t('views.settings.edit'),
      icon: EditIcon,
      buttonProps: {
        disabled: isLoading.value,
      },
      onClick: (data: DBUser) => {
        openUserDialog(data);
      },
    },
    {
      label: t('views.settings.remove'),
      icon: TrashIcon,
      iconProps: {
        class: 'text-red-500',
      },
      labelProps: {
        class: 'text-red-500',
      },
      buttonProps: {
        disabled: isLoading.value,
        severity: 'danger',
      },
      onClick: (user: DBUser) => {
        removeUser({ username: user.username });
      },
    },
  ];
});

function openUserDialog(user?: DBUser) {
  dialog.openComponentDialog<UserFormProps>(UserFormDialog, {
    data: {
      title: user ? t('components.dialog.title.edit_user') : t('components.dialog.title.create_new_user'),
      confirmText: user ? t('components.form.button.save') : t('components.form.button.add'),
      loading: isLoading,
      contentProps: {
        user: toRaw(user),
      },
    },
  });
}
</script>

<style scoped></style>
