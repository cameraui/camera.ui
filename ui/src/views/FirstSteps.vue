<template>
  <div class="h-full flex flex-col">
    <div class="border-color-bottom draggable-region">
      <div class="max-w-3xl mx-auto flex items-center justify-between px-4 py-3">
        <div class="flex items-center gap-2">
          <InlineSvg :src="getImageUrl('logo_animated.svg')" width="20px" height="22px" title="camera.ui" aria-label="camera.ui" />
          <span class="font-semibold">camera.ui</span>
        </div>
        <Button class="cui-button-small non-draggable-region" severity="secondary" variant="text" :label="$t('components.form.button.logout')" @click="clickLogout" />
      </div>
    </div>

    <div class="flex-1 overflow-auto">
      <div class="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        <div class="flex items-center w-full">
          <template v-for="(step, idx) in steps" :key="step">
            <div class="flex flex-col items-center gap-2 flex-shrink-0">
              <div class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200" :class="stepCircleClass(idx)">
                <i-tabler:check v-if="idx < currentCategoryIndex" class="w-4 h-4" />
                <span v-else>{{ idx + 1 }}</span>
              </div>
              <span class="text-xs font-medium hidden sm:block whitespace-nowrap" :class="idx <= currentCategoryIndex ? 'text-color' : 'text-muted'">
                {{ $t(`views.firststeps.step_${step}`) }}
              </span>
            </div>
            <div
              v-if="idx < steps.length - 1"
              class="flex-1 h-px mx-2 sm:mx-3 transition-colors duration-200"
              :class="idx < currentCategoryIndex ? 'bg-primary-500' : 'bg-[var(--border-color)]'"
            />
          </template>
        </div>

        <Tabs v-model:value="currentCategoryIndex" lazy>
          <TabPanels class="!p-0 !bg-transparent">
            <TabPanel :value="0">
              <Card class="cui-card">
                <template #content>
                  <div class="flex flex-col items-center gap-6 py-6">
                    <span class="text-muted">{{ $t('views.firststeps.welcome_to') }}</span>

                    <div class="flex flex-row items-center justify-center gap-2">
                      <InlineSvg :src="getImageUrl('logo_animated.svg')" width="26px" height="32px" title="camera.ui" aria-label="camera.ui" />
                      <span class="text-4xl">camera.ui</span>
                    </div>

                    <p class="max-w-[375px] text-center text-muted">{{ $t('views.firststeps.slogan') }}</p>

                    <div v-if="isMaster" class="flex flex-col items-center gap-3 w-full">
                      <p class="text-center text-muted max-w-[375px]">{{ $t('views.firststeps.start_message') }}</p>

                      <div class="flex flex-row items-center justify-center gap-2">
                        <Button class="cui-button-medium" :loading="isLoading" :label="$t('views.firststeps.new_installation')" @click="nextStep" />
                        <Button
                          class="cui-button-medium"
                          severity="secondary"
                          :loading="isLoading"
                          :label="$t('views.firststeps.from_backup')"
                          @click="triggerFileInput"
                        />
                      </div>

                      <input ref="backupFileInputRef" type="file" accept="application/gzip, .tar, .tar.gz" class="hidden" @change="handleBackupFileSelect" />
                    </div>

                    <Button v-else class="cui-button-medium" :loading="isLoading" :label="$t('views.firststeps.start')" @click="nextStep" />
                  </div>
                </template>
              </Card>
            </TabPanel>

            <TabPanel :value="1">
              <SettingsAppearance />
            </TabPanel>

            <TabPanel :value="2">
              <SettingsAccount ref="accountFormRef" firststeps />
            </TabPanel>

            <TabPanel :value="3">
              <Card class="cui-card">
                <template #content>
                  <div class="flex flex-col items-center gap-6 py-8">
                    <InlineSvg :src="getImageUrl('logo_animated.svg')" width="78px" height="84px" title="camera.ui" aria-label="camera.ui" />
                    <p class="text-center text-muted max-w-[375px]">{{ $t('views.firststeps.finish_message') }}</p>
                  </div>
                </template>
              </Card>
            </TabPanel>
          </TabPanels>
        </Tabs>

        <div class="flex items-center justify-between gap-2">
          <Button v-if="currentCategoryIndex > 0" class="cui-button-medium" severity="secondary" :label="$t('components.form.button.previous')" @click="previousStep" />
          <span v-else />

          <Button
            v-if="currentCategoryIndex > 0 && currentCategoryIndex < steps.length - 1"
            class="cui-button-medium"
            :label="$t('components.form.button.next')"
            @click="nextStep"
          />
          <Button
            v-else-if="currentCategoryIndex === steps.length - 1"
            class="cui-button-medium"
            :loading="isLoading"
            :label="$t('views.firststeps.enjoy')"
            @click="onFormSubmit"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import InlineSvg from 'vue-inline-svg';

import { deepToRaw, getImageUrl } from '@/common/utils.js';
import SettingsAccount from '@/subviews/SettingsAccount.vue';
import SettingsAppearance from '@/subviews/SettingsAppearance.vue';

import type { PatchUserInput } from '@/schemas/users.schema.js';
import type { Form } from 'vee-validate';

const log = useLogger();
const dialog = useCuiDialog();
const toast = useCuiToast();
const { t } = useI18n();

const authStore = useAuthStore();
const { loginLoading } = storeToRefs(authStore);

const steps = ref(['welcome', 'appearance', 'account', 'finish']);
const accountFormRef = useTemplateRef<InstanceType<typeof SettingsAccount>>('accountFormRef');
const backupFileInputRef = useTemplateRef('backupFileInputRef');
const file = shallowRef<File>();
const uploadedFile = shallowRef<File>();
const currentCategoryIndex = ref(0);
const loading = ref(false);
const lastFormValues = ref<Record<string, any>>();

const isLoading = computed(() => loading.value || loginLoading.value);
const isMaster = computed(() => hasPermission(undefined, 'master'));
const formRef = computed<InstanceType<typeof Form>>(() => accountFormRef.value?.formRef as any);

function stepCircleClass(idx: number): string {
  if (idx < currentCategoryIndex.value) return 'bg-primary-500 text-white';
  if (idx === currentCategoryIndex.value) return 'bg-primary-500 text-white ring-4 ring-primary-500/20';
  return 'border border-color text-muted';
}

async function nextStep() {
  if (currentCategoryIndex.value < steps.value.length - 1) {
    if (currentCategoryIndex.value === 2) {
      const values = formRef.value?.getValues();

      if (values) {
        if (!values.password || !values.passwordConfirm) {
          formRef.value?.setFieldError('password', 'Required');
          formRef.value?.setFieldError('passwordConfirm', 'Required');
          return;
        }

        if (!values.username) {
          formRef.value?.setFieldError('username', 'Required');
          return;
        }
      }

      const result = await formRef.value?.validate();
      if (result?.valid) {
        lastFormValues.value = deepToRaw(values);
        currentCategoryIndex.value++;
      } else if (!result?.valid) {
        log.error('Validation failed', result);
        toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
      }
    } else {
      currentCategoryIndex.value++;
    }
  }
}

function previousStep() {
  if (currentCategoryIndex.value > 0) {
    currentCategoryIndex.value--;
  }
}

async function clickLogout(): Promise<void> {
  try {
    await authStore.logout();
  } catch (error: any) {
    log.error(error.response?.data?.message ?? error.message ?? error);
  }
}

function triggerFileInput() {
  backupFileInputRef.value?.click();
}

function handleBackupFileSelect(event: Event) {
  const fileInput = event.target as HTMLInputElement;
  if (fileInput.files && fileInput.files[0]) {
    uploadedFile.value = fileInput.files[0];

    dialog.openTextDialog({
      data: {
        title: t('components.dialog.title.confirm'),
        confirmText: t('components.form.button.restore_and_restart'),
        contentText: t('components.dialog.message.confirm_restore'),
        loading: isLoading,
      },
      onConfirm: restoreBackup,
    });
  }
  fileInput.value = '';
}

async function restoreBackup(): Promise<void> {
  if (!uploadedFile.value) return;

  loading.value = true;
  await useBackupRestore().run(uploadedFile.value);
  loading.value = false;
}

async function onFormSubmit(): Promise<void> {
  if (!lastFormValues.value) {
    toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
    return;
  }

  let formData: FormData | undefined;
  const form = deepToRaw(lastFormValues.value) as PatchUserInput;

  form.firstLogin = false;
  delete form.upload;

  try {
    if (file.value) {
      formData = new FormData();
      formData.append('upload', file.value);
    }

    await authStore.updateUser(form, formData);

    authStore.logout();
  } catch {
    // ignore
  }
}

watchEffect(() => {
  if (currentCategoryIndex.value === 2) {
    lastFormValues.value = undefined;
  }
});
</script>
