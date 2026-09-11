<template>
  <div class="w-full h-full">
    <div v-if="!form" class="w-full h-full flex items-center justify-center">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <div v-else class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">{{ $t('views.settings.status') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex items-center gap-4">
              <div class="flex flex-col field-switch-gap min-w-0">
                <span class="text-sm font-bold text-color">{{ $t('views.settings.assistant_title') }}</span>
                <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint truncate">{{ statusHint }}</Message>
              </div>
              <Tag class="ml-auto shrink-0" :severity="statusSeverity" :value="statusLabel" />
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.assistant_model') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <div class="flex items-center gap-4 cui-toggle-switch">
                <div class="flex flex-col field-switch-gap">
                  <label for="enabled" class="cui-label-switch">{{ $t('components.form.label.enabled') }}</label>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('views.settings.assistant_enabled_info') }}</Message>
                </div>
                <ToggleSwitch
                  :model-value="info?.settings.enabled ?? false"
                  input-id="enabled"
                  :disabled="patchMutation.isPending.value"
                  class="ml-auto shrink-0"
                  @update:model-value="(value) => patchMutation.mutate({ enabled: value })"
                />
              </div>

              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_models_info') }}</Message>

              <div v-if="models.length" class="flex flex-col divide-y divide-(--border-color)">
                <div v-for="entry in models" :key="entry._id" class="flex items-start gap-3 py-3 text-sm">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium text-color">{{ entry.name }}</span>
                      <Tag v-if="entry._id === defaultEntry?._id" severity="info" :value="$t('views.settings.assistant_model_default')" class="text-[10px]" />
                      <Tag v-if="entry.userAccess === false" severity="secondary" :value="$t('views.settings.assistant_model_admins_only')" class="text-[10px]" />
                      <Tag
                        v-for="tag in capabilityTags(entry)"
                        :key="tag.key"
                        :severity="tag.severity"
                        :value="$t(`views.settings.assistant_capability_${tag.key}`)"
                        class="text-[10px]"
                      />
                    </div>
                    <div class="mt-0.5 truncate text-muted">{{ providerLabel(entry.provider) }} · {{ entry.model }}</div>
                    <div v-if="entry.capabilities?.error" class="mt-1 text-xs text-danger line-clamp-2">{{ entry.capabilities.error }}</div>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <Button
                      v-if="entry._id !== defaultEntry?._id"
                      v-tooltip.top="{ value: $t('views.settings.assistant_model_make_default') }"
                      type="button"
                      severity="secondary"
                      text
                      rounded
                      class="cui-icon-md"
                      :disabled="patchMutation.isPending.value"
                      @click="makeDefault(entry)"
                    >
                      <template #icon>
                        <i-mdi:star-outline width="100%" height="100%" />
                      </template>
                    </Button>
                    <Button
                      v-tooltip.top="{ value: $t('views.settings.assistant_model_edit') }"
                      type="button"
                      severity="secondary"
                      text
                      rounded
                      class="cui-icon-md"
                      @click="openModelDialog(entry)"
                    >
                      <template #icon>
                        <i-mdi:pencil-outline width="100%" height="100%" />
                      </template>
                    </Button>
                    <Button
                      v-tooltip.top="{ value: $t('views.settings.assistant_model_delete') }"
                      type="button"
                      severity="danger"
                      text
                      rounded
                      class="cui-icon-md"
                      @click="confirmDeleteModel(entry)"
                    >
                      <template #icon>
                        <i-mdi:delete-outline width="100%" height="100%" />
                      </template>
                    </Button>
                  </div>
                </div>
              </div>
              <div v-else class="text-sm text-muted">{{ $t('views.settings.assistant_models_empty') }}</div>

              <div class="flex">
                <Button
                  type="button"
                  severity="secondary"
                  outlined
                  class="cui-button-medium ml-auto"
                  :label="$t('views.settings.assistant_model_add')"
                  :disabled="models.length >= 20"
                  @click="openModelDialog()"
                >
                  <template #icon>
                    <i-mdi:plus class="w-4 h-4" />
                  </template>
                </Button>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.assistant_plugins') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_plugins_info') }}</Message>

              <div v-if="info?.plugins.length" class="flex flex-col divide-y divide-(--border-color)">
                <div v-for="plugin in info.plugins" :key="plugin.id" class="flex flex-col gap-2 py-3 text-sm md:flex-row md:items-center md:gap-4">
                  <div class="flex min-w-0 items-center gap-2 md:w-48 md:shrink-0">
                    <span class="truncate font-medium text-color">{{ plugin.name }}</span>
                    <Tag
                      v-if="pluginModel(plugin.id)?.capabilities?.vision === false"
                      severity="warn"
                      :value="$t('views.settings.assistant_capability_no_vision')"
                      class="shrink-0 text-[10px]"
                    />
                  </div>
                  <Select
                    :model-value="pluginChoice(plugin.id)"
                    :options="pluginOptions"
                    option-label="label"
                    option-value="value"
                    class="w-full md:min-w-0 md:flex-1"
                    @update:model-value="(value) => setPluginChoice(plugin.id, value)"
                  />
                </div>
              </div>
              <div v-else class="text-sm text-muted">{{ $t('views.settings.assistant_plugins_empty') }}</div>

              <div class="flex">
                <Button
                  type="button"
                  :loading="patchMutation.isPending.value"
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.save')"
                  @click="onSave"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.assistant_behavior') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <div class="flex items-center gap-4 cui-toggle-switch">
                <div class="flex flex-col field-switch-gap">
                  <label for="memoryEnabled" class="cui-label-switch">{{ $t('views.settings.assistant_memory') }}</label>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('views.settings.assistant_memory_info') }}</Message>
                </div>
                <ToggleSwitch v-model="form.memoryEnabled" input-id="memoryEnabled" class="ml-auto shrink-0" />
              </div>

              <div class="flex items-center gap-4 cui-toggle-switch">
                <div class="flex flex-col field-switch-gap">
                  <label for="terminalEnabled" class="cui-label-switch">{{ $t('views.settings.assistant_terminal') }}</label>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('views.settings.assistant_terminal_info') }}</Message>
                </div>
                <ToggleSwitch v-model="form.terminalEnabled" input-id="terminalEnabled" class="ml-auto shrink-0" />
              </div>

              <div class="flex flex-col field-gap">
                <label for="language" class="cui-label">{{ $t('views.settings.assistant_language_label') }}</label>
                <Select v-model="form.language" :options="languageOptions" option-label="label" option-value="value" fluid />
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_language_info') }}</Message>
              </div>

              <div class="flex flex-col field-gap">
                <label for="reasoning" class="cui-label">{{ $t('views.settings.assistant_reasoning_label') }}</label>
                <Select v-model="form.reasoning" input-id="reasoning" :options="reasoningOptions" option-label="label" option-value="value" fluid />
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_reasoning_info') }}</Message>
              </div>

              <div class="flex flex-col md:flex-row gap-6">
                <div class="flex flex-col field-gap flex-1">
                  <label for="maxIterations" class="cui-label">{{ $t('views.settings.assistant_max_iterations_label') }}</label>
                  <InputNumber v-model="form.maxIterations" :min="1" :max="30" :use-grouping="false" fluid />
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_max_iterations_info') }}</Message>
                </div>
                <div class="flex flex-col field-gap flex-1">
                  <label for="maxToolCalls" class="cui-label">{{ $t('views.settings.assistant_max_tool_calls_label') }}</label>
                  <InputNumber v-model="form.maxToolCalls" :min="1" :max="100" :use-grouping="false" fluid />
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_max_tool_calls_info') }}</Message>
                </div>
              </div>

              <div class="flex flex-col field-gap">
                <label for="contextTokens" class="cui-label">{{ $t('views.settings.assistant_context_tokens_label') }}</label>
                <InputNumber id="contextTokens" v-model="form.contextTokens" :min="8000" :max="400000" :step="1000" :use-grouping="false" fluid />
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_context_tokens_info') }}</Message>
              </div>

              <div class="flex flex-col md:flex-row gap-4">
                <div class="flex flex-col field-gap flex-1">
                  <label for="historyThreads" class="cui-label">{{ $t('views.settings.assistant_history_threads_label') }}</label>
                  <InputNumber id="historyThreads" v-model="form.historyThreads" :min="5" :max="500" :use-grouping="false" fluid />
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_history_threads_info') }}</Message>
                </div>
                <div class="flex flex-col field-gap flex-1">
                  <label for="historyImages" class="cui-label">{{ $t('views.settings.assistant_history_images_label') }}</label>
                  <InputNumber id="historyImages" v-model="form.historyImages" :min="0" :max="200" :use-grouping="false" fluid />
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_history_images_info') }}</Message>
                </div>
              </div>

              <div class="flex flex-col field-gap">
                <label for="systemPromptExtra" class="cui-label">{{ $t('views.settings.assistant_extra_prompt_label') }}</label>
                <Textarea v-model="form.systemPromptExtra" rows="3" auto-resize :placeholder="$t('views.settings.assistant_extra_prompt_placeholder')" />
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_extra_prompt_info') }}</Message>
              </div>

              <div class="flex items-center gap-2">
                <Button
                  type="button"
                  severity="secondary"
                  outlined
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.reset_defaults')"
                  @click="resetBehavior"
                >
                  <template #icon>
                    <i-mdi:restore class="w-4 h-4" />
                  </template>
                </Button>
                <Button type="button" :loading="patchMutation.isPending.value" class="cui-button-medium" :label="$t('components.form.button.save')" @click="onSave" />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.assistant_mcp') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_mcp_info') }}</Message>

              <div class="flex flex-col gap-4">
                <div class="flex items-center justify-between gap-4">
                  <div class="flex flex-col">
                    <span class="text-sm font-medium text-color">{{ $t('views.settings.assistant_mcp_enabled_label') }}</span>
                    <span class="text-xs text-muted">{{ $t('views.settings.assistant_mcp_enabled_info') }}</span>
                  </div>
                  <ToggleSwitch v-model="form.mcpEnabled" />
                </div>
                <div class="flex items-center justify-between gap-4">
                  <div class="flex flex-col">
                    <span class="text-sm font-medium text-color">{{ $t('views.settings.assistant_mcp_writes_label') }}</span>
                    <span class="text-xs text-muted">{{ $t('views.settings.assistant_mcp_writes_info') }}</span>
                  </div>
                  <ToggleSwitch v-model="form.mcpWrites" :disabled="!form.mcpEnabled" />
                </div>
              </div>

              <div v-if="form.mcpEnabled" class="flex flex-col gap-6">
                <div class="flex flex-col field-gap">
                  <label for="mcpEndpoint" class="cui-label">{{ $t('views.settings.assistant_mcp_endpoint_label') }}</label>
                  <InputGroup>
                    <InputText id="mcpEndpoint" :model-value="mcpEndpoint" readonly class="font-mono text-sm" />
                    <InputGroupAddon>
                      <CuiActionButton
                        :action-text="$t('components.form.tooltip.copied')"
                        :icon="CopyIcon"
                        :button-props="{ severity: 'secondary', text: true }"
                        @action="copyToClipboard(mcpEndpoint)"
                      />
                    </InputGroupAddon>
                  </InputGroup>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
                    {{ $t('views.settings.assistant_mcp_token_info') }}
                    <RouterLink :to="{ name: 'SettingsAccount' }" class="underline">{{ $t('views.settings.assistant_mcp_token_link') }}</RouterLink>
                  </Message>
                </div>

                <div class="flex flex-col field-gap">
                  <label for="mcpClient" class="cui-label">{{ $t('views.settings.assistant_mcp_client_label') }}</label>
                  <Select v-model="mcpClient" input-id="mcpClient" :options="mcpClientOptions" option-label="label" option-value="value" class="w-full" />
                  <InputGroup>
                    <Textarea id="mcpSnippet" :model-value="mcpSnippet" readonly auto-resize rows="3" class="font-mono text-xs" />
                    <InputGroupAddon>
                      <CuiActionButton
                        :action-text="$t('components.form.tooltip.copied')"
                        :icon="CopyIcon"
                        :button-props="{ severity: 'secondary', text: true }"
                        @action="copyToClipboard(mcpSnippet)"
                      />
                    </InputGroupAddon>
                  </InputGroup>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_mcp_snippet_info') }}</Message>
                </div>
              </div>

              <div class="flex">
                <Button
                  type="button"
                  :loading="patchMutation.isPending.value"
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.save')"
                  @click="onSave"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.assistant_external') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_external_info') }}</Message>

              <div v-for="server in form.mcpServers" :key="server.id" class="cui-assistant-server flex flex-col gap-4 rounded-xl p-4">
                <div class="flex items-center gap-3">
                  <span class="text-sm font-medium text-color truncate">{{ server.name || $t('views.settings.assistant_external_new') }}</span>
                  <span class="text-xs" :class="externalStateClass(server.id)">{{ externalStateLabel(server.id) }}</span>
                  <ToggleSwitch v-model="server.enabled" class="ml-auto shrink-0" />
                  <Button
                    v-tooltip.top="{ value: $t('views.settings.assistant_external_remove') }"
                    type="button"
                    severity="secondary"
                    text
                    rounded
                    class="cui-icon-md shrink-0"
                    @click="removeServer(server.id)"
                  >
                    <template #icon>
                      <i-mdi:delete-outline class="w-4 h-4" />
                    </template>
                  </Button>
                </div>
                <div class="flex flex-col md:flex-row gap-4">
                  <div class="flex flex-col field-gap md:w-56">
                    <label :for="`server-name-${server.id}`" class="cui-label">{{ $t('views.settings.assistant_external_name') }}</label>
                    <InputText :id="`server-name-${server.id}`" v-model="server.name" fluid placeholder="Home Assistant" />
                  </div>
                  <div class="flex flex-col field-gap flex-1">
                    <label :for="`server-url-${server.id}`" class="cui-label">{{ $t('views.settings.assistant_external_url') }}</label>
                    <InputText :id="`server-url-${server.id}`" v-model="server.url" fluid placeholder="http://homeassistant.local:8123/api/mcp" />
                  </div>
                </div>
                <div class="flex flex-col field-gap">
                  <label :for="`server-token-${server.id}`" class="cui-label">{{ $t('views.settings.assistant_external_token') }}</label>
                  <Password
                    :id="`server-token-${server.id}`"
                    v-model="serverTokens[server.id]"
                    :feedback="false"
                    toggle-mask
                    fluid
                    autocomplete="new-password"
                    :placeholder="server.tokenSet ? '••••••••' : ''"
                  />
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                    server.tokenSet ? $t('views.settings.assistant_external_token_set') : $t('views.settings.assistant_external_token_info')
                  }}</Message>
                </div>
                <div class="flex items-center gap-4 cui-toggle-switch">
                  <div class="flex flex-col field-switch-gap">
                    <label :for="`server-insecure-${server.id}`" class="cui-label-switch">{{ $t('views.settings.assistant_external_insecure') }}</label>
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                      $t('views.settings.assistant_external_insecure_info')
                    }}</Message>
                  </div>
                  <ToggleSwitch :input-id="`server-insecure-${server.id}`" v-model="server.insecure" class="ml-auto shrink-0" />
                </div>
              </div>

              <div class="flex items-center gap-2">
                <Button
                  type="button"
                  severity="secondary"
                  outlined
                  class="cui-button-medium"
                  :label="$t('views.settings.assistant_external_add')"
                  :disabled="form.mcpServers.length >= 10"
                  @click="addServer"
                >
                  <template #icon>
                    <i-mdi:plus class="w-4 h-4" />
                  </template>
                </Button>
                <Button
                  type="button"
                  :loading="patchMutation.isPending.value"
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.save')"
                  @click="onSave"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.assistant_schedules') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_schedules_info') }}</Message>

              <div v-if="schedules?.length" class="flex flex-col divide-y divide-(--border-color)">
                <div v-for="schedule in schedules" :key="schedule._id" class="flex items-start gap-3 py-3 text-sm">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium text-color">{{ schedule.title }}</span>
                      <Tag severity="secondary" :value="scheduleLabel(schedule.cron)" class="text-[10px]" />
                      <Tag
                        :severity="deliverySeverity(schedule.deliver)"
                        :value="$t(`views.settings.assistant_schedule_deliver_${schedule.deliver}`)"
                        class="text-[10px]"
                      />
                      <Tag
                        v-if="schedule.profileId"
                        :severity="profileName(schedule.profileId) ? 'secondary' : 'warn'"
                        :value="profileName(schedule.profileId) ?? $t('views.settings.assistant_schedule_profile_missing')"
                        class="text-[10px]"
                      />
                    </div>
                    <div class="mt-0.5 text-muted line-clamp-2">{{ schedule.prompt }}</div>
                    <div class="mt-1 text-xs text-muted">
                      <span v-if="schedule.enabled && schedule.nextRun">{{
                        $t('views.settings.assistant_schedule_next', { time: formatDateTime(schedule.nextRun) })
                      }}</span>
                      <span v-else-if="!schedule.enabled">{{ $t('views.settings.assistant_schedule_paused') }}</span>
                      <span v-if="schedule.lastRun" :class="schedule.lastRun.status === 'error' ? 'text-danger' : ''">
                        · {{ $t(`views.settings.assistant_schedule_last_${schedule.lastRun.status}`, { time: formatDateTime(schedule.lastRun.at) }) }}
                        <template v-if="schedule.lastRun.message">({{ schedule.lastRun.message }})</template>
                      </span>
                    </div>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <Button
                      v-tooltip.top="{ value: $t('views.settings.assistant_schedule_run') }"
                      type="button"
                      severity="secondary"
                      text
                      rounded
                      class="cui-icon-md"
                      :loading="runScheduleMutation.isPending.value && runScheduleMutation.variables.value === schedule._id"
                      @click="runScheduleMutation.mutate(schedule._id)"
                    >
                      <template #icon>
                        <i-mdi:play-outline width="100%" height="100%" />
                      </template>
                    </Button>
                    <ToggleSwitch
                      :model-value="schedule.enabled"
                      @update:model-value="(value) => patchScheduleMutation.mutate({ scheduleId: schedule._id, patch: { enabled: value } })"
                    />
                    <Button type="button" severity="danger" text rounded class="cui-icon-md" @click="deleteScheduleMutation.mutate(schedule._id)">
                      <template #icon>
                        <i-mdi:delete-outline width="100%" height="100%" />
                      </template>
                    </Button>
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-6" :class="{ 'cui-assistant-schedule-form': schedules?.length }">
                <div class="flex flex-col md:flex-row gap-6">
                  <div class="flex flex-col field-gap flex-1">
                    <label for="scheduleTitle" class="cui-label">{{ $t('views.settings.assistant_schedule_title_label') }}</label>
                    <InputText v-model.trim="scheduleForm.title" type="text" :placeholder="$t('views.settings.assistant_schedule_title_placeholder')" class="w-full" />
                  </div>
                  <div class="flex flex-col field-gap w-full md:w-52 shrink-0">
                    <label for="scheduleDeliver" class="cui-label">{{ $t('views.settings.assistant_schedule_deliver_label') }}</label>
                    <Select v-model="scheduleForm.deliver" :options="deliverOptions" option-label="label" option-value="value" fluid />
                  </div>
                </div>

                <div class="flex flex-col field-gap">
                  <label for="schedulePrompt" class="cui-label">{{ $t('views.settings.assistant_schedule_prompt_label') }}</label>
                  <Textarea v-model="scheduleForm.prompt" rows="2" auto-resize :placeholder="$t('views.settings.assistant_schedule_prompt_placeholder')" />
                </div>

                <div v-if="profiles?.length" class="flex flex-col field-gap">
                  <label for="scheduleProfile" class="cui-label">{{ $t('views.settings.assistant_schedule_profile_label') }}</label>
                  <Select
                    v-model="scheduleForm.profileId"
                    input-id="scheduleProfile"
                    :options="profiles"
                    option-label="name"
                    option-value="_id"
                    show-clear
                    fluid
                    :placeholder="$t('views.settings.assistant_schedule_profile_none')"
                  />
                </div>

                <div class="flex flex-col md:flex-row gap-6">
                  <div class="flex flex-col field-gap flex-1">
                    <label for="schedulePreset" class="cui-label">{{ $t('views.settings.assistant_schedule_when_label') }}</label>
                    <Select v-model="scheduleForm.preset" :options="presetOptions" option-label="label" option-value="value" fluid />
                  </div>
                  <div v-if="scheduleForm.preset !== 'hourly' && scheduleForm.preset !== 'custom'" class="flex flex-col field-gap w-full md:w-40 shrink-0">
                    <label for="scheduleTime" class="cui-label">{{ $t('views.settings.assistant_schedule_time_label') }}</label>
                    <InputText v-model="scheduleForm.time" type="time" class="cui-time-input w-full" />
                  </div>
                  <div v-if="scheduleForm.preset === 'custom'" class="flex flex-col field-gap flex-1">
                    <label for="scheduleCron" class="cui-label">{{ $t('views.settings.assistant_schedule_cron_label') }}</label>
                    <InputText v-model.trim="scheduleForm.cron" type="text" placeholder="0 20 * * *" class="w-full font-mono text-sm" />
                  </div>
                </div>

                <div class="flex">
                  <Button
                    type="button"
                    :loading="createScheduleMutation.isPending.value"
                    :disabled="!scheduleForm.title || !scheduleForm.prompt || !scheduleCron"
                    class="cui-button-medium ml-auto"
                    :label="$t('views.settings.assistant_schedule_add')"
                    @click="onAddSchedule"
                  />
                </div>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.assistant_usage') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-3">
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.assistant_usage_info') }}</Message>
              <CuiDataTable :value="usage ?? []" data-key="key" :loading="usageLoading" :pt="usageTablePt" striped-rows scrollable>
                <template #loading>
                  <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
                </template>
                <template #empty>
                  <span class="text-sm text-muted">{{ $t('views.settings.assistant_usage_empty') }}</span>
                </template>
                <Column field="month" :header="$t('views.settings.assistant_usage_month')" header-class="p-2" class="p-2 tabular-nums" />
                <Column field="username" :header="$t('views.settings.assistant_usage_user')" header-class="p-2" class="p-2">
                  <template #body="{ data }">
                    <span class="truncate">{{ data.pluginName ?? data.username ?? data.userId }}</span>
                  </template>
                </Column>
                <Column field="model" :header="$t('views.settings.assistant_usage_model')" header-class="p-2" class="p-2">
                  <template #body="{ data }">
                    <span class="truncate">{{ usageModelLabel(data) }}</span>
                  </template>
                </Column>
                <Column field="runs" :header="$t('views.settings.assistant_usage_runs')" header-class="p-2" class="p-2 text-right tabular-nums" :pt="NUMERIC_COLUMN_PT" />
                <Column
                  field="promptTokens"
                  :header="$t('views.settings.assistant_usage_in')"
                  header-class="p-2"
                  class="p-2 text-right tabular-nums"
                  :pt="NUMERIC_COLUMN_PT"
                >
                  <template #body="{ data }">{{ formatTokens(data.promptTokens) }}</template>
                </Column>
                <Column
                  field="completionTokens"
                  :header="$t('views.settings.assistant_usage_out')"
                  header-class="p-2"
                  class="p-2 text-right tabular-nums"
                  :pt="NUMERIC_COLUMN_PT"
                >
                  <template #body="{ data }">{{ formatTokens(data.completionTokens) }}</template>
                </Column>
                <Column
                  field="costUsd"
                  :header="$t('views.settings.assistant_usage_cost')"
                  header-class="p-2"
                  class="p-2 text-right tabular-nums"
                  :pt="NUMERIC_COLUMN_PT"
                >
                  <template #body="{ data }">{{ data.costUsd ? `$${data.costUsd.toFixed(data.costUsd < 1 ? 3 : 2)}` : '–' }}</template>
                </Column>
              </CuiDataTable>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.assistant_tools') }}</span>
        <Card class="cui-card">
          <template #content>
            <div v-if="!toolSources.length" class="text-sm text-muted">{{ $t('views.settings.assistant_tools_empty') }}</div>
            <Tabs v-else v-model:value="toolSource" scrollable>
              <TabList class="mb-3">
                <Tab v-for="source in toolSources" :key="source.key" :value="source.key" class="text-sm">{{ source.label }} ({{ source.tools.length }})</Tab>
              </TabList>
              <TabPanels class="!p-0 !bg-transparent">
                <TabPanel v-for="source in toolSources" :key="source.key" :value="source.key">
                  <div class="flex max-h-96 flex-col divide-y divide-(--border-color) overflow-y-auto pr-2">
                    <div v-for="tool in source.tools" :key="tool.name" class="flex items-start gap-3 py-2 text-sm">
                      <i-mdi:wrench-outline class="w-4 h-4 mt-0.5 shrink-0 text-muted" />
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-medium text-color">{{ toolDisplayName(tool.name) }}</span>
                          <Tag v-if="tool.approval" severity="warn" :value="$t('views.settings.assistant_tool_approval')" class="text-[10px]" />
                          <Tag v-if="tool.adminOnly" severity="info" :value="$t('views.settings.assistant_tool_admin')" class="text-[10px]" />
                        </div>
                        <div class="text-muted">{{ toolDescription(tool.description) }}</div>
                      </div>
                    </div>
                  </div>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import CopyIcon from '~icons/mdi/content-copy';

import { axiosInstance } from '@/api/index.js';
import { AssistantQuery } from '@/api/routes/assistant.js';
import { ASSISTANT_PROVIDERS, capabilityTags, defaultModel, modelInput } from '@/common/assistantModels.js';
import { copyToClipboard, deepToRaw, randomId } from '@/common/utils.js';
import { toolDisplayName } from '@/components/CuiAssistantToolCall/types.js';
import AssistantModelDialog from '@/components/CuiDialog/templates/AssistantModel/AssistantModel.vue';

import type { AssistantModelFormProps } from '@/components/CuiDialog/templates/AssistantModel/types.js';
import type { PassThrough } from '@primevue/core';
import type {
  AssistantInfo,
  AssistantMaskedSettings,
  AssistantModelInput,
  AssistantModelView,
  AssistantToolInfo,
  AssistantUsageRow,
  DBAssistantProvider,
  DBAssistantScheduleDelivery,
  PatchAssistantInput,
} from '@shared/types';
import type { DataTablePassThroughOptions } from 'primevue';

type SchedulePreset = 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'hourly' | 'custom';

const NO_PLUGIN_ACCESS = 'none';
const BEHAVIOR_DEFAULTS = {
  memoryEnabled: true,
  terminalEnabled: false,
  language: null,
  reasoning: 'default',
  maxIterations: 8,
  maxToolCalls: 25,
  contextTokens: 48_000,
  historyThreads: 50,
  historyImages: 24,
} satisfies Partial<AssistantMaskedSettings>;
const NUMERIC_COLUMN_PT = { columnHeaderContent: { class: 'justify-end' } };
const usageTablePt: PassThrough<DataTablePassThroughOptions> = {
  bodyRow: { class: 'text-sm text-secondary' },
  column: { columnTitle: { class: 'text-sm' } },
};

const assistantQuery = new AssistantQuery();

const toast = useCuiToast();
const dialog = useCuiDialog();
const { t, locale } = useI18n();

const { data: usageRows, isLoading: usageLoading } = assistantQuery.usageAllQuery();
const { data: info } = assistantQuery.getAssistantInfoQuery();
const patchMutation = assistantQuery.patchAssistantInfoMutation();
const { data: profiles } = assistantQuery.listProfilesQuery();
const { data: schedules } = assistantQuery.listSchedulesQuery();
const createScheduleMutation = assistantQuery.createScheduleMutation();
const patchScheduleMutation = assistantQuery.patchScheduleMutation();
const deleteScheduleMutation = assistantQuery.deleteScheduleMutation();
const runScheduleMutation = assistantQuery.runScheduleMutation();

const form = ref<AssistantMaskedSettings | null>(null);
const scheduleForm = ref<{
  title: string;
  prompt: string;
  preset: SchedulePreset;
  time: string;
  cron: string;
  deliver: DBAssistantScheduleDelivery;
  profileId: string | null;
}>({
  title: '',
  prompt: '',
  preset: 'daily',
  time: '20:00',
  cron: '',
  deliver: 'push',
  profileId: null,
});
const serverTokens = ref<Record<string, string>>({});
const mcpClient = ref<'claude-code' | 'cursor' | 'claude-desktop'>('claude-code');
const toolSource = ref('core');

const models = computed(() => info.value?.settings.models ?? []);
const defaultEntry = computed(() => (info.value ? defaultModel(info.value.settings) : undefined));
const pluginOptions = computed(() => [
  { label: t('views.settings.assistant_plugin_no_access'), value: NO_PLUGIN_ACCESS },
  ...models.value.map((model) => ({ label: model.name, value: model._id })),
]);

const toolSources = computed(() => {
  const groups = new Map<string, { key: string; label: string; tools: AssistantToolInfo[] }>();
  for (const tool of info.value?.tools ?? []) {
    const key = tool.source.kind === 'plugin' ? tool.source.pluginId : tool.source.kind === 'external' ? tool.source.serverId : 'core';
    const label = tool.source.kind === 'plugin' ? tool.source.pluginName : tool.source.kind === 'external' ? tool.source.serverName : 'camera.ui';
    const group = groups.get(key) ?? { key, label, tools: [] };
    group.tools.push(tool);
    groups.set(key, group);
  }
  return Array.from(groups.values());
});

const usage = computed(() => usageRows.value?.map((row) => ({ ...row, key: `${row.userId}-${row.month}-${row.provider}-${row.model}` })));

const status = computed(() => info.value?.status);

const languageOptions = computed(() => [
  { label: t('views.settings.assistant_language_auto'), value: null },
  { label: 'Deutsch', value: 'de' },
  { label: 'English', value: 'en' },
]);

const reasoningOptions = computed(() =>
  (['default', 'off', 'low', 'high'] as const).map((value) => ({ label: t(`views.settings.assistant_reasoning_${value}`), value })),
);

const mcpEndpoint = computed(() => new URL(`${axiosInstance.defaults.baseURL ?? '/api'}/assistant/mcp`.replace(/\/{2,}/g, '/'), window.location.origin).toString());

const mcpClientOptions = computed(() => [
  { label: 'Claude Code', value: 'claude-code' },
  { label: 'Cursor, Windsurf, VS Code', value: 'cursor' },
  { label: 'Claude Desktop', value: 'claude-desktop' },
]);

const mcpSnippet = computed(() => {
  const url = mcpEndpoint.value;
  if (mcpClient.value === 'claude-code') return `claude mcp add --transport http camera-ui ${url} --header "Authorization: Bearer <api token>"`;
  if (mcpClient.value === 'cursor') {
    return JSON.stringify({ mcpServers: { 'camera-ui': { url, headers: { Authorization: 'Bearer <api token>' } } } }, null, 2);
  }
  return JSON.stringify({ mcpServers: { 'camera-ui': { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization: Bearer <api token>'] } } }, null, 2);
});

const deliverOptions = computed(() =>
  (['push', 'thread', 'both'] as DBAssistantScheduleDelivery[]).map((value) => ({ label: t(`views.settings.assistant_schedule_deliver_${value}`), value })),
);

const presetOptions = computed(() =>
  (['daily', 'weekdays', 'weekends', 'weekly', 'hourly', 'custom'] as SchedulePreset[]).map((value) => ({
    label: t(`views.settings.assistant_schedule_preset_${value}`),
    value,
  })),
);

const scheduleCron = computed(() => {
  const { preset, time, cron } = scheduleForm.value;
  const [hours, minutes] = time.split(':').map((part) => Number.parseInt(part, 10));
  if (preset === 'custom') return cron.trim();
  if (preset === 'hourly') return '0 * * * *';
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return '';
  const days = preset === 'weekdays' ? '1-5' : preset === 'weekends' ? '0,6' : preset === 'weekly' ? '0' : '*';
  return `${minutes} ${hours} * * ${days}`;
});

const statusSeverity = computed(() => {
  switch (status.value?.state) {
    case 'ready':
      return 'success';
    case 'unconfigured':
      return 'warn';
    default:
      return 'secondary';
  }
});

const statusLabel = computed(() => t(`views.settings.assistant_state_${status.value?.state ?? 'disabled'}`));

const statusHint = computed(() => {
  if (!status.value) return '';
  if (status.value.state === 'ready') {
    return t('views.settings.assistant_status_ready', { model: status.value.model });
  }
  return t('views.settings.assistant_status_info');
});

function scheduleLabel(cron: string): string {
  const match = /^(\d+) (\d+) \* \* (\*|1-5|0,6|0)$/.exec(cron);
  if (!match) return cron;
  const time = `${match[2].padStart(2, '0')}:${match[1].padStart(2, '0')}`;
  const preset = match[3] === '*' ? 'daily' : match[3] === '1-5' ? 'weekdays' : match[3] === '0' ? 'weekly' : 'weekends';
  return `${t(`views.settings.assistant_schedule_preset_${preset}`)} ${time}`;
}

function deliverySeverity(deliver: DBAssistantScheduleDelivery): 'info' | 'secondary' | 'success' {
  return deliver === 'push' ? 'info' : deliver === 'thread' ? 'secondary' : 'success';
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(locale.value, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function onAddSchedule(): Promise<void> {
  await createScheduleMutation.mutateAsync({
    title: scheduleForm.value.title,
    prompt: scheduleForm.value.prompt,
    cron: scheduleCron.value,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: locale.value,
    deliver: scheduleForm.value.deliver,
    profileId: scheduleForm.value.profileId,
    enabled: true,
  });
  scheduleForm.value = { ...scheduleForm.value, title: '', prompt: '', cron: '', profileId: null };
}

function toolDescription(description: string): string {
  return description.replace(/^\[[^\]]+\]\s*/, '');
}

function formatTokens(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

function externalStatus(id: string) {
  return info.value?.external.find((server) => server.id === id);
}

function externalStateLabel(id: string): string {
  const status = externalStatus(id);
  if (!status) return '';
  if (status.state === 'connected') return t('views.settings.assistant_external_state_connected', { n: status.toolCount });
  if (status.state === 'error') return t('views.settings.assistant_external_state_error', { message: status.error ?? '' });
  return t(`views.settings.assistant_external_state_${status.state}`);
}

function externalStateClass(id: string): string {
  const state = externalStatus(id)?.state;
  return state === 'connected' ? 'text-success' : state === 'error' ? 'text-danger' : 'text-muted';
}

function addServer(): void {
  if (!form.value) return;
  form.value.mcpServers.push({ id: randomId(), name: '', url: '', enabled: true, insecure: false, tokenSet: false });
}

function removeServer(id: string): void {
  if (!form.value) return;
  form.value.mcpServers = form.value.mcpServers.filter((server) => server.id !== id);
  delete serverTokens.value[id];
}

function buildPatch(): PatchAssistantInput {
  const raw = deepToRaw(form.value!);
  const patch: PatchAssistantInput = {
    language: raw.language,
    maxIterations: raw.maxIterations,
    maxToolCalls: raw.maxToolCalls,
    contextTokens: raw.contextTokens,
    historyThreads: raw.historyThreads,
    historyImages: raw.historyImages,
    terminalEnabled: raw.terminalEnabled,
    reasoning: raw.reasoning,
    systemPromptExtra: raw.systemPromptExtra,
    mcpEnabled: raw.mcpEnabled,
    mcpWrites: raw.mcpWrites,
    memoryEnabled: raw.memoryEnabled,
    plugins: raw.plugins.map(({ pluginId, modelId }) => ({ pluginId, modelId })),
    mcpServers: raw.mcpServers
      .filter((server) => server.name.trim() || server.url.trim())
      .map((server) => ({
        id: server.id,
        name: server.name.trim(),
        url: server.url.trim(),
        enabled: server.enabled,
        insecure: server.insecure,
        ...(serverTokens.value[server.id] ? { token: serverTokens.value[server.id] } : {}),
      })),
  };
  return patch;
}

function resetBehavior(): void {
  if (!form.value) return;
  Object.assign(form.value, BEHAVIOR_DEFAULTS);
}

async function onSave(): Promise<void> {
  if (!form.value) return;
  await patchMutation.mutateAsync(buildPatch());
  serverTokens.value = {};
}

function providerLabel(provider: DBAssistantProvider): string {
  return ASSISTANT_PROVIDERS.find((option) => option.value === provider)?.label ?? provider;
}

async function saveModels(next: AssistantModelInput[]): Promise<AssistantInfo> {
  return patchMutation.mutateAsync({ models: next });
}

function openModelDialog(entry?: AssistantModelView): void {
  const before = new Set(models.value.map((model) => model._id));
  dialog.openComponentDialog<AssistantModelFormProps>(AssistantModelDialog, {
    data: {
      title: entry ? t('views.settings.assistant_model_edit') : t('views.settings.assistant_model_add'),
      confirmText: t('components.form.button.save'),
      awaitConfirm: true,
      contentProps: { entry: entry ? toRaw(entry) : undefined, models: toRaw(models.value) },
    },
    onConfirm: async (input: AssistantModelInput) => {
      const next = entry ? models.value.map((model) => (model._id === entry._id ? input : modelInput(model))) : [...models.value.map(modelInput), input];
      const updated = await saveModels(next);
      reportTest(updated.settings.models.find((model) => (entry ? model._id === entry._id : !before.has(model._id))));
    },
  });
}

function reportTest(entry: AssistantModelView | undefined): void {
  const capabilities = entry?.capabilities;
  if (!capabilities) return;

  // prettier-ignore
  const detail = capabilities.error
    ? t('views.settings.assistant_test_failed', { message: capabilities.error })
    : !capabilities.toolCalling
        ? t('views.settings.assistant_test_tools_missing')
        : capabilities.vision === false
          ? t('views.settings.assistant_test_vision_missing')
          : '';

  if (detail) toast.add({ severity: capabilities.error ? 'error' : 'warn', detail, life: 8000 });
}

function confirmDeleteModel(entry: AssistantModelView): void {
  dialog.openTextDialog({
    data: {
      title: t('views.settings.assistant_model_delete'),
      contentText: t('views.settings.assistant_model_delete_confirm', { name: entry.name }),
      confirmText: t('views.settings.assistant_model_delete'),
      confirmButtonProps: { severity: 'danger' },
    },
    onConfirm: async () => {
      await saveModels(models.value.filter((model) => model._id !== entry._id).map(modelInput));
    },
  });
}

async function makeDefault(entry: AssistantModelView): Promise<void> {
  await patchMutation.mutateAsync({ defaultModelId: entry._id });
}

function pluginChoice(pluginId: string): string {
  return form.value?.plugins.find((row) => row.pluginId === pluginId)?.modelId ?? NO_PLUGIN_ACCESS;
}

function pluginModel(pluginId: string): AssistantModelView | undefined {
  return models.value.find((model) => model._id === pluginChoice(pluginId));
}

function setPluginChoice(pluginId: string, modelId: string): void {
  if (!form.value) return;
  const rows = form.value.plugins.filter((row) => row.pluginId !== pluginId);
  form.value.plugins = modelId === NO_PLUGIN_ACCESS ? rows : [...rows, { pluginId, modelId }];
}

function usageModelLabel(row: AssistantUsageRow): string {
  return models.value.find((model) => model.provider === row.provider && model.model === row.model)?.name ?? row.model;
}

function profileName(profileId: string): string | undefined {
  return profiles.value?.find((profile) => profile._id === profileId)?.name;
}

watch(
  info,
  (value) => {
    if (value && !form.value) {
      form.value = deepToRaw(value.settings);
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.cui-assistant-server {
  background: var(--card-inner-background);
  border: 1px solid var(--border-color-inner);
}

.cui-assistant-schedule-form {
  border-top: 1px solid var(--border-color);
  padding-top: 1.5rem;
}

.cui-time-input {
  -webkit-appearance: none;
  min-width: 100%;
}

.cui-time-input::-webkit-date-and-time-value {
  text-align: left;
}
</style>
