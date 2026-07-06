<template>
  <Form ref="formRef" class="flex flex-col gap-6" :validation-schema="user ? userPatchSchema : userCreateSchema">
    <Field
      v-slot="{ field, errors }"
      v-model.trim="userData.username"
      :value="user?.username ?? userData.username"
      name="username"
      as="div"
      class="flex flex-col field-gap"
    >
      <label for="username" class="cui-label">{{ $t('components.form.label.username') }}</label>
      <InputGroup>
        <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" />
      </InputGroup>

      <Transition name="fade">
        <ErrorMessage name="username" class="cui-input-error" />
      </Transition>
    </Field>

    <Field v-slot="{ field, errors }" v-model="userData.password" name="password" as="div" class="flex flex-col field-gap">
      <label for="password" class="cui-label">{{ $t('components.form.label.new_password') }}</label>
      <InputGroup>
        <Password :invalid="errors.length > 0" v-bind="field" :loading="isLoading" :feedback="false" toggle-mask />
      </InputGroup>

      <Transition name="fade">
        <ErrorMessage name="password" class="cui-input-error" />
      </Transition>
    </Field>

    <Field v-slot="{ field, errors }" v-model="userData.passwordConfirm" name="passwordConfirm" as="div" class="flex flex-col field-gap">
      <label for="passwordConfirm" class="cui-label">{{ $t('components.form.label.new_password_confirm') }}</label>
      <InputGroup>
        <Password :invalid="errors.length > 0" v-bind="field" :loading="isLoading" :feedback="false" toggle-mask />
      </InputGroup>

      <Transition name="fade">
        <ErrorMessage name="passwordConfirm" class="cui-input-error" />
      </Transition>
    </Field>

    <Field v-if="user?.role !== 'master'" v-slot="{ errors }" :model-value="userData.role" name="role" as="div" class="flex flex-col field-gap">
      <label for="role" class="cui-label">{{ $t('components.form.label.role') }}</label>
      <InputGroup>
        <Select
          :model-value="user?.role ?? userData.role"
          :options="roles"
          :invalid="errors.length > 0"
          :loading="isLoading"
          type="text"
          @value-change="(e) => (userData.role = e)"
        />
      </InputGroup>

      <Transition name="fade">
        <ErrorMessage name="role" class="cui-input-error" />
      </Transition>
    </Field>
  </Form>
</template>

<script setup lang="ts">
import { ErrorMessage, Field, Form } from 'vee-validate';

import { UsersQuery } from '@/api/routes/users.js';
import { userCreateSchema, userPatchSchema } from '@/schemas/users.schema.js';

import type { CustomDialogComponent, DialogRefProps } from '@/composables/useCuiDialog.js';
import type { CreateUserInput, PatchUserInput } from '@/schemas/users.schema.js';
import type { DBRoles } from '@shared/types';
import type { UserFormProps } from './types.js';

const usersQuery = new UsersQuery();

const props = defineProps<UserFormProps>();

const log = useLogger();
const toast = useCuiToast();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { mutateAsync: addUser, isPending: addLoading } = usersQuery.createUserQuery();
const { mutateAsync: patchUser, isPending: patchLoading } = usersQuery.patchUserQuery();

const { user } = toRefs(props);
const formRef = useTemplateRef<InstanceType<typeof Form>>('formRef');
const userData = ref<Partial<CreateUserInput | PatchUserInput>>({});
const roles = ref<DBRoles[]>(['user', 'admin']);

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || addLoading.value || patchLoading.value));

async function onConfirm(): Promise<void | null> {
  const result = await formRef.value?.validate();

  if (!result?.valid) {
    log.error('Validation failed', result);
    toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
    return null;
  }

  if (user.value) {
    await patchUser({ username: user.value.username, userData: userData.value });
  } else {
    await addUser({ userData: userData.value as CreateUserInput });
  }
}

defineExpose<CustomDialogComponent>({
  isLoading,
  onConfirm,
});
</script>

<style scoped></style>
