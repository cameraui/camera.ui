<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">{{ $t('views.settings.registered_users') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.registered_users_info') }}</span>

              <CuiDataTable
                :value="users?.result"
                :paginator="pagination.page! > 1 || (users?.result && users.result.length > 15)"
                data-key="id"
                :loading="isLoading"
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

      <div>
        <span class="card-title">{{ $t('views.settings.logged_in_users') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.logged_in_users_info') }}</span>

              <CuiDataTable :value="sessions" :loading="sessionsLoading" :pt="tablePtOptions" striped-rows scrollable>
                <template #loading>
                  <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
                </template>

                <Column field="status" :header="''" style="width: 3rem">
                  <template #body="{ data }">
                    <div class="flex items-center justify-center">
                      <Badge
                        v-tooltip="{ value: data.is_current ? $t('components.user_table.you') : undefined }"
                        :style="{ background: data.is_current ? 'var(--primary-500)' : 'transparent' }"
                      />
                    </div>
                  </template>
                </Column>
                <Column field="device.name" :header="$t('components.user_table.title_device')">
                  <template #body="{ data }">
                    <span class="font-medium block max-w-[200px] truncate">{{ data.device.name }}</span>
                  </template>
                </Column>
                <Column field="device.ip" :header="$t('components.user_table.title_address')">
                  <template #body="{ data }">
                    {{ data.device.ip ?? '-' }}
                  </template>
                </Column>
                <Column field="device.kind" :header="$t('components.user_table.title_kind')" />
                <Column field="action" class="text-right">
                  <template #body="{ data }">
                    <Button
                      v-tooltip="{ value: $t('views.settings.active_sessions.revoke') }"
                      severity="danger"
                      text
                      rounded
                      :loading="revokeLoading"
                      class="cui-icon-md"
                      @click="revokeSession({ id: data.id })"
                    >
                      <template #icon>
                        <i-mdi:logout width="100%" height="100%" />
                      </template>
                    </Button>
                  </template>
                </Column>
                <template #empty>
                  <span class="text-muted text-sm">{{ $t('views.settings.no_sessions') }}</span>
                </template>
              </CuiDataTable>
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
import TrashIcon from '~icons/mdi/delete';
import EditIcon from '~icons/mdi/account-edit';

import { AuthQuery } from '@/api/routes/auth.js';
import { UsersQuery } from '@/api/routes/users.js';
import UserFormDialog from '@/components/CuiDialog/templates/UserForm/UserForm.vue';
import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';

import type { UserFormProps } from '@/components/CuiDialog/templates/UserForm/types.js';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { PassThrough } from '@openvue/core';
import type { DBUser, PaginationQuery } from '@shared/types';
import type { DataTablePassThroughOptions } from 'openvue';

const authQuery = new AuthQuery();
const usersQuery = new UsersQuery();

const dialog = useCuiDialog();
const { mdBreakpoint } = useSharedCuiBreakpoint();
const { t } = useI18n();

const pagination = ref<PaginationQuery>({ pageSize: 15, page: 1 });
const sessionsPagination = ref<PaginationQuery>({ page: 1, pageSize: -1 });

const { data: users, isBusy: usersLoading } = usersQuery.getUsersQuery(pagination);
const { mutate: removeUser, isPending: removeLoading } = usersQuery.removeUserQuery();
const { data: userSessions, isBusy: tokensLoading } = authQuery.listAllSessionsQuery(sessionsPagination);
const { mutate: revokeSession, isPending: revokeLoading } = authQuery.revokeSessionQuery();

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

const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');

const isLoading = computed(() => usersLoading.value || removeLoading.value);

const sessions = computed(() => userSessions.value ?? []);
const sessionsLoading = computed(() => Boolean(tokensLoading.value));

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
