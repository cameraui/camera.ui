<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <template v-if="firststeps">
        <Form ref="formRef" :validation-schema="firststepsSchema" class="flex flex-col w-full gap-6">
          <div class="relative">
            <div class="image-upload rounded-full z-1">
              <label for="file-input">
                <CuiAvatar :src="avatarSrc" :size="64" :show-border="false" class="cursor-pointer" />
                <input id="file-input" type="file" class="hidden" accept="image/png,image/jpeg,image/jpg" @change="changeInput($event)" />
              </label>
            </div>

            <span class="card-title">{{ $t('views.settings.profile') }}</span>
            <Card class="cui-card">
              <template #content>
                <div class="flex flex-col gap-6">
                  <Field v-slot="{ field, errors }" :model-value="user?.username" name="username" as="div" class="flex flex-col field-gap">
                    <label for="username" class="cui-label">{{ $t('components.form.label.username') }}</label>
                    <InputGroup>
                      <InputText v-bind="field" :invalid="errors.length > 0" type="text" />
                    </InputGroup>
                    <Transition name="fade">
                      <ErrorMessage name="username" class="cui-input-error" />
                    </Transition>
                  </Field>
                </div>
              </template>
            </Card>
          </div>

          <div>
            <span class="card-title">{{ $t('views.settings.password') }}</span>
            <Card class="cui-card">
              <template #content>
                <div class="flex flex-col gap-6">
                  <Field v-slot="{ field, errors }" name="password" as="div" class="flex flex-col field-gap">
                    <label for="password" class="cui-label">{{ $t('components.form.label.new_password') }}</label>
                    <InputGroup>
                      <Password :invalid="errors.length > 0" v-bind="field" :feedback="false" toggle-mask />
                    </InputGroup>
                    <Transition name="fade">
                      <ErrorMessage name="password" class="cui-input-error" />
                    </Transition>
                  </Field>

                  <Field v-slot="{ field, errors }" name="passwordConfirm" as="div" class="flex flex-col field-gap">
                    <label for="passwordConfirm" class="cui-label">{{ $t('components.form.label.new_password_confirm') }}</label>
                    <InputGroup>
                      <Password :invalid="errors.length > 0" v-bind="field" :feedback="false" toggle-mask />
                    </InputGroup>
                    <Transition name="fade">
                      <ErrorMessage name="passwordConfirm" class="cui-input-error" />
                    </Transition>
                  </Field>
                </div>
              </template>
            </Card>
          </div>
        </Form>
      </template>

      <template v-else>
        <div class="relative">
          <div class="image-upload rounded-full z-1">
            <label for="file-input">
              <CuiAvatar :src="avatarSrc" :size="64" :show-border="false" class="cursor-pointer" />
              <input id="file-input" type="file" class="hidden" accept="image/png,image/jpeg,image/jpg" @change="changeInput($event)" />
            </label>
          </div>

          <span class="card-title">{{ $t('views.settings.profile') }}</span>
          <Card class="cui-card">
            <template #content>
              <div class="flex flex-col gap-6">
                <div class="flex flex-col field-gap">
                  <label for="username" class="cui-label">{{ $t('components.form.label.username') }}</label>
                  <InputGroup>
                    <InputText v-model="profileUsername" :loading="profileLoading" type="text" />
                  </InputGroup>
                </div>

                <div class="flex flex-row items-end justify-end">
                  <Button :loading="profileLoading" class="cui-button-medium" :label="$t('components.form.button.update_profile')" @click="saveProfile" />
                </div>
              </div>
            </template>
          </Card>
        </div>

        <div>
          <span class="card-title">{{ $t('views.settings.password') }}</span>
          <Card class="cui-card">
            <template #content>
              <Form ref="passwordFormRef" :validation-schema="passwordSchema" class="flex flex-col gap-6" @submit="savePassword($event as PasswordInput)">
                <Field v-slot="{ field, errors }" name="password" as="div" class="flex flex-col field-gap">
                  <label for="password" class="cui-label">{{ $t('components.form.label.new_password') }}</label>
                  <InputGroup>
                    <Password :invalid="errors.length > 0" v-bind="field" :loading="passwordLoading" :feedback="false" toggle-mask />
                  </InputGroup>

                  <Transition name="fade">
                    <ErrorMessage name="password" class="cui-input-error" />
                  </Transition>
                </Field>

                <Field v-slot="{ field, errors }" name="passwordConfirm" as="div" class="flex flex-col field-gap">
                  <label for="passwordConfirm" class="cui-label">{{ $t('components.form.label.new_password_confirm') }}</label>
                  <InputGroup>
                    <Password :invalid="errors.length > 0" v-bind="field" :loading="passwordLoading" :feedback="false" toggle-mask />
                  </InputGroup>

                  <Transition name="fade">
                    <ErrorMessage name="passwordConfirm" class="cui-input-error" />
                  </Transition>
                </Field>

                <div class="flex flex-row items-end justify-end">
                  <Button type="submit" :loading="passwordLoading" class="cui-button-medium" :label="$t('components.form.button.change_password')" />
                </div>
              </Form>
            </template>
          </Card>
        </div>

        <div>
          <span class="card-title">{{ $t('views.settings.security.title') }}</span>
          <Card class="cui-card">
            <template #content>
              <div v-if="is2FALoading" class="flex justify-center py-6">
                <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
              </div>

              <Transition v-else name="fade" mode="out-in">
                <div v-if="!twoFactorStatus?.enabled && !setupData && !setupLoading" key="initial" class="flex flex-col gap-6">
                  <div class="flex flex-col gap-1">
                    <span class="tfa-row-title">{{ $t('views.settings.security.2fa_title') }}</span>
                    <span class="tfa-row-description">{{ $t('views.settings.security.2fa_description') }}</span>
                  </div>
                  <Button class="cui-button-medium ml-auto" :label="$t('views.settings.security.setup_2fa')" @click="startSetup" />
                </div>

                <div v-else-if="!twoFactorStatus?.enabled && setupLoading" key="loading" class="flex flex-col items-center py-8 gap-3">
                  <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
                  <span class="text-sm text-muted">{{ $t('views.settings.security.generating_qr') }}</span>
                </div>

                <div v-else-if="!twoFactorStatus?.enabled && setupData" key="setup" class="tfa-setup">
                  <div class="tfa-setup-qr">
                    <CuiQRCode :value="otpauthUri" :size="160" :logo-size="36" />
                    <p class="text-sm text-muted text-center mt-3">{{ $t('views.settings.security.scan_qr') }}</p>
                  </div>

                  <div class="flex flex-col gap-5 flex-1">
                    <div class="flex flex-col field-gap">
                      <label class="cui-label">{{ $t('views.settings.security.manual_entry') }}</label>
                      <InputGroup>
                        <InputText :model-value="setupData?.secret" readonly class="font-mono text-sm" />
                        <InputGroupAddon>
                          <CuiActionButton
                            :action-text="$t('components.form.tooltip.copied')"
                            :icon="CopyIcon"
                            :button-props="{ severity: 'secondary', text: true }"
                            @action="copySecret"
                          />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>

                    <div class="flex flex-col field-gap">
                      <label class="cui-label">{{ $t('views.settings.security.enter_code') }}</label>
                      <InputOtp v-model="setupCode" :length="6" integer-only />
                    </div>

                    <div class="flex gap-2 justify-end">
                      <Button severity="secondary" class="cui-button-medium" :label="$t('components.form.button.cancel')" @click="cancelSetup" />
                      <Button
                        class="cui-button-medium"
                        :label="$t('views.settings.security.enable_2fa')"
                        :loading="enableLoading"
                        :disabled="setupCode.length < 6"
                        @click="enable2FA"
                      />
                    </div>
                  </div>
                </div>

                <div v-else key="enabled" class="flex flex-col gap-6">
                  <div class="tfa-row tfa-row-enabled">
                    <div class="tfa-status-icon">
                      <i-mdi:shield-check class="w-5 h-5" />
                    </div>
                    <div class="tfa-row-content">
                      <span class="tfa-row-title">{{ $t('views.settings.security.2fa_enabled') }}</span>
                    </div>
                  </div>

                  <div v-if="twoFactorStatus?.backupCodesCount !== undefined" class="tfa-backup-info">
                    <i-mdi:key class="w-4 h-4" />
                    <span>{{
                      $t('views.settings.security.backup_codes_remaining', {
                        count: twoFactorStatus.backupCodesCount,
                      })
                    }}</span>
                  </div>

                  <div class="flex gap-2 justify-end">
                    <Button severity="secondary" class="cui-button-medium" :label="$t('views.settings.security.regenerate_backup')" @click="openRegenerateDialog" />
                    <Button severity="danger" class="cui-button-medium" :label="$t('views.settings.security.disable_2fa')" @click="openDisableDialog" />
                  </div>
                </div>
              </Transition>
            </template>
          </Card>
        </div>

        <div v-if="biometricCardVisible">
          <span class="card-title">{{ $t('views.settings.biometric.title') }}</span>
          <Card class="cui-card">
            <template #content>
              <div class="flex items-center gap-4">
                <i-mdi:face-recognition class="shrink-0 w-6 h-6 text-color" />
                <div class="flex flex-col field-switch-gap min-w-0">
                  <span class="text-sm font-bold text-color">{{ $t('views.settings.biometric.label') }}</span>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">
                    {{ $t('views.settings.biometric.description') }}
                  </Message>
                </div>
                <ToggleSwitch :model-value="biometricEnabled" :loading="biometricToggling" class="ml-auto shrink-0" @update:model-value="onToggleBiometric" />
              </div>
            </template>
          </Card>
        </div>

        <div>
          <span class="card-title">{{ $t('views.settings.active_sessions.title') }}</span>
          <Card class="cui-card">
            <template #content>
              <div class="flex flex-col gap-6">
                <CuiDataTable :value="sessions ?? []" data-key="id" :loading="sessionsLoading" :pt="sessionsTablePt" striped-rows scrollable>
                  <template #loading>
                    <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
                  </template>

                  <template #empty>
                    <span class="text-muted text-sm">{{ $t('views.settings.active_sessions.empty') }}</span>
                  </template>

                  <Column field="device" :header="$t('views.settings.title_device')" header-class="p-2 h-7 min-h-7 max-h-7" class="p-2 h-7 min-h-7 max-h-7">
                    <template #body="{ data }">
                      <div class="flex items-center gap-3">
                        <component :is="iconForKind(data.device.kind)" class="cui-session-icon" />
                        <div class="flex flex-col min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="text-sm font-semibold text-color truncate">{{ data.device.name }}</span>
                            <Tag v-if="data.is_current" severity="success" :value="$t('views.settings.active_sessions.this_device')" class="cui-session-tag" />
                          </div>
                          <span class="text-xs text-muted truncate">{{ data.device.ip || '—' }}</span>
                        </div>
                      </div>
                    </template>
                  </Column>

                  <Column field="action" header-class="p-2 h-7 min-h-7 max-h-7" class="p-2 h-7 min-h-7 max-h-7 text-right">
                    <template #body="{ data }">
                      <Button
                        v-if="!data.is_current"
                        v-tooltip="{ value: $t('views.settings.active_sessions.revoke') }"
                        severity="danger"
                        text
                        rounded
                        class="cui-icon-md"
                        :loading="revokingId === data.id"
                        @click="onRevoke(data.id)"
                      >
                        <template #icon>
                          <i-mdi:logout width="100%" height="100%" />
                        </template>
                      </Button>
                    </template>
                  </Column>
                </CuiDataTable>

                <div v-if="otherSessionsCount > 0" class="flex flex-row items-end justify-end gap-2">
                  <Button
                    :loading="revokeAllLoading"
                    class="cui-button-medium mr-4 md:mr-0"
                    :label="$t('views.settings.active_sessions.revoke_all_others', { count: otherSessionsCount })"
                    @click="onRevokeOthers"
                  />
                </div>
              </div>
            </template>
          </Card>
        </div>

        <div>
          <span class="card-title">{{ $t('views.settings.api_tokens.title') }}</span>
          <Card class="cui-card">
            <template #content>
              <div class="flex flex-col gap-6">
                <span class="text-sm text-muted">{{ $t('views.settings.api_tokens.info') }}</span>

                <CuiDataTable :value="apiTokens ?? []" data-key="id" :loading="apiTokensLoading" :pt="sessionsTablePt" striped-rows scrollable>
                  <template #loading>
                    <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
                  </template>

                  <template #empty>
                    <span class="text-muted text-sm">{{ $t('views.settings.api_tokens.empty') }}</span>
                  </template>

                  <Column field="name" :header="$t('views.settings.api_tokens.name_label')" header-class="p-2 h-7 min-h-7 max-h-7" class="p-2 h-7 min-h-7 max-h-7">
                    <template #body="{ data }">
                      <div class="flex items-center gap-3">
                        <KeyIcon class="cui-session-icon" />
                        <div class="flex flex-col min-w-0">
                          <span class="text-sm font-semibold text-color truncate">{{ data.name }}</span>
                          <span class="text-xs text-muted truncate font-mono">{{ data.token_hint }}</span>
                        </div>
                      </div>
                    </template>
                  </Column>

                  <Column field="last_seen_at" :header="$t('views.settings.api_tokens.last_used')" header-class="p-2 h-7 min-h-7 max-h-7" class="p-2 h-7 min-h-7 max-h-7">
                    <template #body="{ data }">
                      <span class="text-xs text-muted">
                        {{ data.last_seen_at > data.created_at ? formatRelativeTime(data.last_seen_at) : $t('views.settings.api_tokens.never') }}
                      </span>
                    </template>
                  </Column>

                  <Column field="action" header-class="p-2 h-7 min-h-7 max-h-7" class="p-2 h-7 min-h-7 max-h-7 text-right">
                    <template #body="{ data }">
                      <Button
                        v-tooltip="{ value: $t('views.settings.api_tokens.revoke') }"
                        severity="danger"
                        text
                        rounded
                        class="cui-icon-md"
                        :loading="revokingTokenId === data.id"
                        @click="onRevokeApiToken(data)"
                      >
                        <template #icon>
                          <i-mdi:delete-outline width="100%" height="100%" />
                        </template>
                      </Button>
                    </template>
                  </Column>
                </CuiDataTable>

                <div class="flex flex-row items-end justify-end gap-2">
                  <Button
                    :loading="createTokenLoading"
                    class="cui-button-medium mr-4 md:mr-0"
                    :label="$t('views.settings.api_tokens.create')"
                    @click="onCreateApiToken"
                  />
                </div>
              </div>
            </template>
          </Card>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ErrorMessage, Field, Form } from 'vee-validate';
import { z } from 'zod';
import CopyIcon from '~icons/fluent/copy-16-filled';
import PhoneIcon from '~icons/mdi/cellphone';
import KeyIcon from '~icons/mdi/key-variant';
import LaptopIcon from '~icons/mdi/laptop';

import { AuthQuery } from '@/api/routes/auth.js';
import { copyToClipboard, formatRelativeTime, readImgUpload } from '@/common/utils.js';
import ApiTokenCreatedDialog from '@/components/CuiDialog/templates/ApiTokenCreated/ApiTokenCreated.vue';
import CreateApiTokenDialog from '@/components/CuiDialog/templates/CreateApiToken/CreateApiToken.vue';
import TwoFactorBackupCodesDialog from '@/components/CuiDialog/templates/TwoFactorBackupCodes/TwoFactorBackupCodes.vue';
import TwoFactorDisableDialog from '@/components/CuiDialog/templates/TwoFactorDisable/TwoFactorDisable.vue';
import TwoFactorRegenerateDialog from '@/components/CuiDialog/templates/TwoFactorRegenerate/TwoFactorRegenerate.vue';
import { checkBiometryAvailable, clearCredentials, hasStoredCredentials } from '@/composables/useBiometricCredentials.js';
import { getCurrentServerId, isCapacitor } from '@/connection/index.js';
import { userPasswordSchema } from '@/schemas/users.schema.js';

import type { ApiTokenCreatedProps } from '@/components/CuiDialog/templates/ApiTokenCreated/types.js';
import type { CreateApiTokenProps } from '@/components/CuiDialog/templates/CreateApiToken/types.js';
import type { TwoFactorBackupCodesProps } from '@/components/CuiDialog/templates/TwoFactorBackupCodes/types.js';
import type { TwoFactorDisableProps } from '@/components/CuiDialog/templates/TwoFactorDisable/types.js';
import type { TwoFactorRegenerateProps } from '@/components/CuiDialog/templates/TwoFactorRegenerate/types.js';
import type { PassThrough } from '@primevue/core';
import type { ApiTokenInfo, ClientKind } from '@shared/types';
import type { DataTablePassThroughOptions } from 'primevue';

const authQuery = new AuthQuery();

const props = defineProps<{
  firststeps?: boolean;
}>();

const dialog = useCuiDialog();
const toast = useCuiToast();
const { t } = useI18n();
const { firststeps } = toRefs(props);

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const { data: twoFactorStatus, isLoading: is2FALoading } = authQuery.toggleQueryActivator('get2FAStatusQuery', !firststeps.value).get2FAStatusQuery();
const { mutateAsync: setup2FAFn, isPending: setupLoading } = authQuery.setup2FAQuery();
const { mutateAsync: enable2FAFn, isPending: enableLoading } = authQuery.enable2FAQuery();
const { data: sessions, isBusy: sessionsLoading } = authQuery.toggleQueryActivator('listSessionsQuery', !firststeps.value).listSessionsQuery({ page: 1, pageSize: -1 });
const { mutateAsync: revokeSession } = authQuery.revokeSessionQuery();
const { mutateAsync: revokeOtherSessions } = authQuery.revokeOtherSessionsQuery();
const { data: apiTokens, isBusy: apiTokensLoading } = authQuery.toggleQueryActivator('listApiTokensQuery', !firststeps.value).listApiTokensQuery();
const { mutateAsync: createApiToken, isPending: createTokenLoading } = authQuery.createApiTokenQuery();
const { mutateAsync: revokeApiToken } = authQuery.revokeApiTokenQuery();

const passwordSchema = z
  .object({
    password: userPasswordSchema,
    passwordConfirm: z.string().min(1),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'Passwords do not match',
    path: ['passwordConfirm'],
  });

const firststepsSchema = z
  .object({
    username: z.string().min(1),
    password: userPasswordSchema,
    passwordConfirm: z.string().min(1),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'Passwords do not match',
    path: ['passwordConfirm'],
  });

type PasswordInput = z.infer<typeof passwordSchema>;

const formRef = useTemplateRef<InstanceType<typeof Form>>('formRef');
const passwordFormRef = useTemplateRef<InstanceType<typeof Form>>('passwordFormRef');

const file = shallowRef<File>();
const avatarSrc = ref('avatar');
const profileUsername = ref(user.value?.username ?? '');
const profileLoading = ref(false);

const passwordLoading = ref(false);

const setupData = ref<{ qrCode: string; secret: string } | null>(null);
const setupCode = ref('');

const revokingId = ref<string | null>(null);
const revokeAllLoading = ref(false);
const revokingTokenId = ref<string | null>(null);

const biometryAvailable = ref(false);
const biometricEnabled = ref(false);
const biometricToggling = ref(false);

const biometricCardVisible = computed(() => isCapacitor && biometryAvailable.value && !firststeps.value);

const sessionsTablePt: PassThrough<DataTablePassThroughOptions> = {
  bodyRow: {
    class: 'text-sm text-secondary',
  },
  column: {
    columnTitle: {
      class: 'text-sm',
    },
  },
};

const otherSessionsCount = computed(() => (sessions.value ?? []).filter((s) => !s.is_current).length);

const otpauthUri = computed(() => {
  if (!setupData.value?.secret || !user.value?.username) return '';
  const issuer = encodeURIComponent('camera.ui');
  const label = encodeURIComponent(`camera.ui:${user.value.username}`);
  return `otpauth://totp/${label}?secret=${setupData.value.secret}&issuer=${issuer}`;
});

async function copySecret(): Promise<void> {
  if (setupData.value?.secret) {
    await copyToClipboard(setupData.value.secret);
  }
}

function iconForKind(kind: ClientKind) {
  return kind === 'native' ? PhoneIcon : LaptopIcon;
}

async function onRevoke(id: string): Promise<void> {
  revokingId.value = id;
  try {
    await revokeSession({ id });
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  } finally {
    revokingId.value = null;
  }
}

function onCreateApiToken(): void {
  dialog.openComponentDialog<CreateApiTokenProps>(CreateApiTokenDialog, {
    data: {
      title: t('views.settings.api_tokens.create'),
      confirmText: t('views.settings.api_tokens.create_confirm'),
      contentProps: {
        existingNames: (apiTokens.value ?? []).map((token) => token.name),
      },
    },
    onConfirm: async (name: string | null) => {
      if (!name) return;
      try {
        const created = await createApiToken({ name });
        openApiTokenCreatedDialog(created.token);
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error, life: 3000 });
      }
    },
  });
}

function openApiTokenCreatedDialog(token: string): void {
  dialog.openComponentDialog<ApiTokenCreatedProps>(ApiTokenCreatedDialog, {
    data: {
      title: t('views.settings.api_tokens.created_title'),
      confirmText: t('components.form.button.close'),
      hideCancelButton: true,
      contentProps: {
        token,
      },
    },
  });
}

function onRevokeApiToken(token: ApiTokenInfo): void {
  dialog.openTextDialog({
    data: {
      title: t('views.settings.api_tokens.revoke_title'),
      contentText: t('views.settings.api_tokens.revoke_confirm', { name: token.name }),
      confirmText: t('views.settings.api_tokens.revoke'),
      confirmButtonProps: { severity: 'danger' },
    },
    onConfirm: async () => {
      revokingTokenId.value = token.id;
      try {
        await revokeApiToken({ id: token.id });
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error, life: 3000 });
      } finally {
        revokingTokenId.value = null;
      }
    },
  });
}

function onRevokeOthers(): void {
  dialog.openTextDialog({
    data: {
      title: t('views.settings.active_sessions.revoke_others_title'),
      contentText: t('views.settings.active_sessions.revoke_others_confirm', { count: otherSessionsCount.value }),
      confirmText: t('views.settings.active_sessions.revoke'),
      confirmButtonProps: { severity: 'danger' },
    },
    onConfirm: async () => {
      revokeAllLoading.value = true;
      try {
        await revokeOtherSessions();
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error, life: 3000 });
      } finally {
        revokeAllLoading.value = false;
      }
    },
  });
}

async function startSetup(): Promise<void> {
  try {
    setupData.value = await setup2FAFn();
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

function cancelSetup(): void {
  setupData.value = null;
  setupCode.value = '';
}

async function enable2FA(): Promise<void> {
  try {
    const response = await enable2FAFn({ code: setupCode.value });
    setupData.value = null;
    setupCode.value = '';
    toast.add({ severity: 'success', detail: t('views.settings.security.2fa_enabled_success'), life: 3000 });

    openBackupCodesDialog(response.backupCodes);
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

function openDisableDialog(): void {
  dialog.openComponentDialog<TwoFactorDisableProps>(TwoFactorDisableDialog, {
    data: {
      title: t('views.settings.security.disable_2fa'),
      confirmText: t('views.settings.security.disable_2fa'),
      confirmButtonProps: { severity: 'danger' },
      contentProps: {},
    },
  });
}

function openRegenerateDialog(): void {
  dialog.openComponentDialog<TwoFactorRegenerateProps>(TwoFactorRegenerateDialog, {
    data: {
      title: t('views.settings.security.regenerate_backup'),
      confirmText: t('views.settings.security.regenerate_backup'),
      contentProps: {
        onBackupCodesGenerated: (codes: string[]) => {
          openBackupCodesDialog(codes);
        },
      },
    },
  });
}

function openBackupCodesDialog(codes: string[]): void {
  dialog.openComponentDialog<TwoFactorBackupCodesProps>(TwoFactorBackupCodesDialog, {
    data: {
      title: t('views.settings.security.backup_codes'),
      confirmText: t('components.form.button.close'),
      hideCancelButton: true,
      contentProps: {
        backupCodes: codes,
      },
    },
  });
}

async function changeInput(event: any): Promise<void> {
  const fileList: FileList | null = (event.target as HTMLInputElement)?.files;
  file.value = fileList?.[0];

  avatarSrc.value = (await readImgUpload(event)) ?? avatarSrc.value;
}

async function saveProfile(): Promise<void> {
  profileLoading.value = true;

  try {
    let formData: FormData | undefined;

    if (file.value) {
      formData = new FormData();
      formData.append('upload', file.value);
    }

    const usernameChanged = user.value?.username !== profileUsername.value;

    if (usernameChanged) {
      await authStore.updateUser({ username: profileUsername.value }, formData);
    } else if (formData) {
      await authStore.updateUser(undefined, formData);
    } else {
      profileLoading.value = false;
      return;
    }

    toast.add({ severity: 'success', detail: t('components.toast.profile_updated'), life: 3000 });
    file.value = undefined;

    if (usernameChanged) {
      authStore.logout();
    }
  } catch {
    // ignore
  }

  profileLoading.value = false;
}

async function savePassword(values: { password: string; passwordConfirm: string }): Promise<void> {
  passwordLoading.value = true;

  try {
    await authStore.updateUser({ password: values.password, passwordConfirm: values.passwordConfirm });
    toast.add({ severity: 'success', detail: t('components.toast.password_updated'), life: 3000 });
    passwordFormRef.value?.resetForm();
    authStore.logout();
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }

  passwordLoading.value = false;
}

async function refreshBiometricState(): Promise<void> {
  if (!isCapacitor) return;
  const [biometry, hasCreds] = await Promise.all([checkBiometryAvailable(), hasStoredCredentials(getCurrentServerId())]);
  biometryAvailable.value = biometry.available;
  biometricEnabled.value = hasCreds;
}

async function onToggleBiometric(next: boolean): Promise<void> {
  if (next === biometricEnabled.value) return;
  // Enabling needs fresh credentials — we don't keep the password in memory
  // beyond the login form. Surface that requirement instead of silently
  // doing nothing.
  if (next) {
    toast.add({ severity: 'info', detail: t('views.settings.biometric.enable_hint'), life: 3000 });
    return;
  }
  biometricToggling.value = true;
  try {
    await clearCredentials(getCurrentServerId());
    biometricEnabled.value = false;
    toast.add({ severity: 'success', detail: t('views.settings.biometric.cleared'), life: 3000 });
  } finally {
    biometricToggling.value = false;
  }
}

onMounted(() => {
  refreshBiometricState();
});

defineExpose({
  formRef,
});
</script>

<style scoped>
.image-upload {
  position: absolute;
  right: 30px;
  top: -15px;
  border: 6px solid var(--ground-background);
}

/* 2FA Styles */
.tfa-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.tfa-row-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.tfa-row-title {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.tfa-row-description {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  line-height: 1.4;
}

.tfa-row-enabled {
  padding: 0.75rem;
  background: color-mix(in srgb, var(--p-green-500) 10%, transparent);
  border-radius: 10px;
}

.tfa-status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--p-green-500) 15%, transparent);
  color: var(--p-green-500);
  flex-shrink: 0;
}

.tfa-backup-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: var(--p-form-field-background);
  border-radius: 8px;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.tfa-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

/* Setup Flow */
.tfa-setup {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

@media (min-width: 768px) {
  .tfa-setup {
    flex-direction: row;
    align-items: flex-start;
    gap: 2rem;
  }
}

.tfa-setup-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.cui-session-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  color: var(--p-text-muted-color);
}

.cui-session-tag {
  font-size: 0.6875rem;
  padding: 0.0625rem 0.375rem;
  flex-shrink: 0;
}
</style>
