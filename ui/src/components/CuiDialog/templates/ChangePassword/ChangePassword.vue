<template>
  <Form ref="formRef" class="flex flex-col gap-6" :validation-schema="schema">
    <Field v-if="!isProxy" v-slot="{ field, errors }" name="currentPassword" as="div" class="flex flex-col field-gap">
      <label for="currentPassword" class="cui-label">{{ $t('components.form.label.current_password') }}</label>
      <InputGroup>
        <Password :invalid="errors.length > 0" v-bind="field" :loading="isLoading" :feedback="false" toggle-mask />
      </InputGroup>

      <Transition name="fade">
        <ErrorMessage name="currentPassword" class="cui-input-error" />
      </Transition>
    </Field>

    <Field v-slot="{ field, errors }" name="password" as="div" class="flex flex-col field-gap">
      <label for="password" class="cui-label">{{ $t('components.form.label.new_password') }}</label>
      <InputGroup>
        <Password :invalid="errors.length > 0" v-bind="field" :loading="isLoading" :feedback="false" toggle-mask />
      </InputGroup>

      <Transition name="fade">
        <ErrorMessage name="password" class="cui-input-error" />
      </Transition>
    </Field>

    <Field v-slot="{ field, errors }" name="passwordConfirm" as="div" class="flex flex-col field-gap">
      <label for="passwordConfirm" class="cui-label">{{ $t('components.form.label.new_password_confirm') }}</label>
      <InputGroup>
        <Password :invalid="errors.length > 0" v-bind="field" :loading="isLoading" :feedback="false" toggle-mask />
      </InputGroup>

      <Transition name="fade">
        <ErrorMessage name="passwordConfirm" class="cui-input-error" />
      </Transition>
    </Field>
  </Form>
</template>

<script setup lang="ts">
import { ErrorMessage, Field, Form } from 'vee-validate';
import { z } from 'zod';

import { isProxySignIn } from '@/common/base.js';
import { userPasswordSchema } from '@/schemas/users.schema.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';

const toast = useCuiToast();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const authStore = useAuthStore();

// behind a proxy the account never typed a password
const isProxy = isProxySignIn();
const schema = z
  .object({
    currentPassword: isProxy ? z.string().optional() : z.string().min(1, 'Current password is required'),
    password: userPasswordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'Passwords do not match',
    path: ['passwordConfirm'],
  });

const formRef = useTemplateRef<InstanceType<typeof Form>>('formRef');
const saving = ref(false);

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || saving.value));

async function onConfirm(): Promise<void | null> {
  const result = await formRef.value?.validate();
  if (!result?.valid) {
    return null;
  }

  const { currentPassword, password, passwordConfirm } = formRef.value!.getValues<z.infer<typeof schema>>();

  saving.value = true;
  try {
    await authStore.updateUser({ password, passwordConfirm, ...(currentPassword && { currentPassword }) });
    toast.add({ severity: 'success', detail: t('components.toast.password_updated'), life: 3000 });
    if (!isProxy) authStore.logout();
  } catch {
    // the mutation already shows the error
    return null;
  } finally {
    saving.value = false;
  }
}

defineExpose({
  isLoading,
  onConfirm,
});
</script>
