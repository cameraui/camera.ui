<template>
  <div class="w-full h-full">
    <div v-if="!serverInfoForm || !remoteInfoForm" class="w-full h-full flex items-center justify-center">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <div v-else class="flex flex-col w-full gap-6">
      <div v-if="connectionInfo">
        <span class="card-title">{{ $t('views.settings.connection_status') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex items-center gap-4">
              <component :is="connectionIcon" class="shrink-0 w-6 h-6" :class="connectionIconColor" />
              <div class="flex flex-col field-switch-gap min-w-0">
                <span class="text-sm font-bold text-color">{{ connectionTypeLabel }}</span>
                <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint truncate">{{
                  connectionInfo.currentConnection.address
                }}</Message>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <Form ref="remoteFormRef" class="flex flex-col w-full gap-6" :validation-schema="remotePatchSchema" @submit="onPatchRemote($event as PatchRemoteInput)">
        <div>
          <span class="card-title">{{ $t('views.settings.cloud') }}</span>
          <Card class="cui-card">
            <template #content>
              <div class="flex flex-col gap-6">
                <Field
                  v-slot="{ field, errors }"
                  :model-value="remoteInfoForm.enabled"
                  :value="true"
                  :unchecked-value="false"
                  type="checkbox"
                  name="enabled"
                  as="div"
                  class="flex flex-col field-gap cui-toggle-switch"
                >
                  <div class="flex items-center gap-4">
                    <div class="flex flex-col field-switch-gap">
                      <label for="enabled" class="cui-label-switch">{{ $t('components.form.label.enabled') }}</label>

                      <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                        $t('components.form.hint.cloud_access_enabled_info')
                      }}</Message>

                      <Transition name="fade">
                        <ErrorMessage name="enabled" class="cui-input-switch-error" />
                      </Transition>
                    </div>

                    <ToggleSwitch
                      :model-value="remoteInfoForm.enabled"
                      v-bind="field"
                      :invalid="errors.length > 0"
                      :loading="isLoading"
                      class="ml-auto shrink-0"
                      @value-change="(e) => (remoteInfoForm!.enabled = e)"
                      @update:model-value="(enabled) => onToggleCloud(enabled)"
                    />
                  </div>
                </Field>

                <div class="flex flex-col field-gap">
                  <label for="serverName" class="cui-label">{{ $t('views.settings.server_name_label') }}</label>
                  <InputGroup>
                    <InputText id="serverName" v-model.trim="serverNameInput" :disabled="!isNameEditable" :loading="isLoading" type="text" :maxlength="100" />
                    <InputGroupAddon>
                      <Button
                        v-tooltip="{ value: $t('components.form.button.save') }"
                        text
                        severity="secondary"
                        :loading="updateNameLoading"
                        :disabled="!canSaveName"
                        type="button"
                        @click="onUpdateServerName"
                      >
                        <template #icon>
                          <i-material-symbols:check />
                        </template>
                      </Button>
                    </InputGroupAddon>
                  </InputGroup>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('views.settings.server_name_info') }}</Message>
                </div>

                <div class="flex items-center gap-4">
                  <div class="flex flex-col field-switch-gap">
                    <span class="text-sm">{{ $t('views.settings.status') }}</span>
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('views.settings.status_info') }}</Message>
                  </div>
                  <div class="ml-auto shrink-0">
                    <ProgressSpinner v-if="isLoading" class="w-[15px] h-[15px] m-0" stroke-width="5" />
                    <span v-else-if="needsReauth" class="text-sm font-bold text-amber-500">{{ $t('views.settings.needs_reauth') }}</span>
                    <span v-else class="text-sm font-bold">{{ isRegistered ? $t('views.settings.registered') : $t('views.settings.not_registered') }}</span>
                  </div>
                </div>

                <template v-if="isRegistered">
                  <div class="flex items-center gap-4">
                    <div class="flex flex-col field-switch-gap">
                      <span class="text-sm">{{ $t('views.settings.tunnel_status') }}</span>
                      <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('views.settings.tunnel_status_info') }}</Message>
                    </div>
                    <div class="ml-auto shrink-0">
                      <ProgressSpinner v-if="tunnelStatusLoading" class="w-[15px] h-[15px] m-0" stroke-width="5" />
                      <Tag
                        v-else
                        :severity="tunnelStatus?.connected ? 'success' : 'secondary'"
                        :value="tunnelStatus?.connected ? $t('views.settings.tunnel_connected') : $t('views.settings.tunnel_disconnected')"
                      />
                    </div>
                  </div>
                </template>

                <Transition name="fade" mode="out-in">
                  <div v-if="pairCode" key="pairing" class="cui-toggle-switch flex flex-col gap-4">
                    <Message severity="error" variant="simple" size="small" class="text-primary">
                      {{ $t('views.settings.pair_instructions') }}
                    </Message>

                    <div class="cui-pair-layout">
                      <div class="cui-pair-qr">
                        <CuiQRCode :value="pairUrl" :size="180" :logo-size="36" />
                      </div>

                      <div class="flex flex-col gap-4 flex-1 min-w-0">
                        <div class="flex flex-col field-gap">
                          <label class="cui-label">{{ $t('views.settings.pair_code') }}</label>
                          <InputGroup>
                            <InputText :model-value="pairCode" readonly class="font-mono text-lg text-center tracking-widest" />
                            <InputGroupAddon>
                              <CuiActionButton
                                :action-text="$t('components.form.tooltip.copied')"
                                :icon="CopyIcon"
                                :button-props="{ severity: 'secondary', text: true }"
                                @action="onCopyPairCode"
                              />
                            </InputGroupAddon>
                          </InputGroup>
                          <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.pair_code_hint') }}</Message>
                        </div>

                        <div class="flex flex-col field-gap">
                          <label class="cui-label">{{ $t('views.settings.pair_url') }}</label>
                          <InputGroup>
                            <InputText :model-value="pairUrl" readonly class="font-mono text-sm" />
                            <InputGroupAddon>
                              <CuiActionButton
                                :action-text="$t('components.form.tooltip.copied')"
                                :icon="CopyIcon"
                                :button-props="{ severity: 'secondary', text: true }"
                                @action="onCopyPairUrl"
                              />
                            </InputGroupAddon>
                            <InputGroupAddon>
                              <Button v-tooltip="{ value: $t('components.form.button.open_in_browser') }" type="button" severity="secondary" text @click="onOpenPairUrl">
                                <template #icon>
                                  <OpenIcon />
                                </template>
                              </Button>
                            </InputGroupAddon>
                          </InputGroup>
                        </div>

                        <div class="flex items-center gap-3">
                          <ProgressSpinner class="w-[20px] h-[20px] m-0" stroke-width="5" />
                          <span class="text-sm">{{ $t('views.settings.pair_waiting', { remaining: pairCountdown }) }}</span>
                          <Button
                            type="button"
                            severity="secondary"
                            class="cui-button-small ml-auto"
                            :label="$t('components.form.button.cancel')"
                            @click="onCancelPairing"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Transition>

                <div class="flex items-center gap-4">
                  <div class="flex">
                    <Button
                      v-tooltip="{ value: isRegistered ? $t('views.settings.registered') : $t('views.settings.not_registered') }"
                      severity="secondary"
                      rounded
                      class="cui-icon-lg text-color"
                      :disabled="!isRegistered"
                      @click="$router.absUrl(CLOUD_SERVICE_URL, true)"
                    >
                      <template #icon>
                        <i-material-symbols:cloud v-if="isRegistered" width="100%" height="100%" />
                        <i-material-symbols-light:cloud-off v-else width="100%" height="100%" />
                      </template>
                    </Button>
                  </div>
                  <div class="ml-auto"></div>
                  <Button
                    v-if="!isRegistered && !pairCode"
                    :loading="pairInitLoading"
                    class="cui-button-medium"
                    :label="$t('components.form.button.register_server')"
                    @click="onStartPairing"
                  />
                  <Button
                    v-if="needsReauth && !pairCode"
                    :loading="pairInitLoading"
                    severity="warn"
                    class="cui-button-medium"
                    :label="$t('components.form.button.reconnect_server')"
                    @click="onStartPairing"
                  />
                  <Button
                    v-if="isRegistered"
                    :loading="isLoading"
                    :severity="needsReauth ? 'secondary' : undefined"
                    :text="needsReauth"
                    class="cui-button-medium"
                    :label="$t('components.form.button.unregister_server')"
                    @click="openUnregisterServerDialog"
                  />
                </div>
              </div>
            </template>
          </Card>
        </div>

        <div>
          <span class="card-title">{{ $t('views.settings.direct_connection') }}</span>
          <Card class="cui-card">
            <template #content>
              <div class="flex flex-col gap-6">
                <Field
                  v-slot="{ field, errors }"
                  :model-value="remoteInfoForm.directEnabled"
                  :value="true"
                  :unchecked-value="false"
                  type="checkbox"
                  name="directEnabled"
                  as="div"
                  class="flex flex-col field-gap cui-toggle-switch"
                >
                  <div class="flex items-center gap-4">
                    <div class="flex flex-col field-switch-gap">
                      <label for="directEnabled" class="cui-label-switch">{{ $t('components.form.label.enabled') }}</label>
                      <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                        $t('views.settings.direct_connection_info')
                      }}</Message>
                      <Transition name="fade">
                        <ErrorMessage name="directEnabled" class="cui-input-switch-error" />
                      </Transition>
                    </div>
                    <ToggleSwitch
                      :model-value="directEffective"
                      v-bind="field"
                      :invalid="errors.length > 0"
                      :loading="isLoading"
                      :disabled="remoteInfoForm.enabled"
                      class="ml-auto shrink-0"
                      @value-change="(e) => (remoteInfoForm!.directEnabled = e)"
                      @update:model-value="(enabled) => onToggleDirect(enabled)"
                    />
                  </div>
                  <Transition name="fade">
                    <Message v-if="directOverride.active" variant="simple" size="small" class="cui-input-switch-hint text-primary">
                      {{ directOverride.fallback ? $t('views.settings.direct_override_fallback') : $t('views.settings.direct_override_active') }}
                    </Message>
                  </Transition>
                </Field>

                <template v-if="directEffective">
                  <div class="flex flex-col field-gap">
                    <label class="cui-label">{{ $t('views.settings.external_url') }}</label>
                    <InputText readonly type="text" :value="connectionInfo?.externalUrl ?? $t('components.form.label.disconnected')" />
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.external_url_info') }}</Message>
                  </div>

                  <Field v-slot="{ errors }" :model-value="remoteInfoForm.directMode" name="directMode" as="div" class="flex flex-col field-gap">
                    <label for="directMode" class="cui-label">{{ $t('views.settings.connection_method') }}</label>
                    <Select
                      :model-value="remoteInfoForm.directMode"
                      :options="directModes"
                      option-label="label"
                      option-value="value"
                      :invalid="errors.length > 0"
                      :loading="isLoading"
                      @update:model-value="(value) => onSelectMode(value as DBRemoteDirectMode)"
                    />
                    <Transition name="fade">
                      <ErrorMessage name="directMode" class="cui-input-error" />
                    </Transition>

                    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ currentModeDescription }}</Message>
                  </Field>

                  <div v-if="remoteInfoForm.directMode === 'cloudflare'" class="cui-toggle-switch flex flex-col gap-4">
                    <div class="flex flex-col field-gap">
                      <label for="cloudflareVariant" class="cui-label">{{ $t('components.form.label.cloudflare_variant') }}</label>
                      <Select
                        :model-value="cloudflareVariantInput"
                        :options="cloudflareVariants"
                        option-label="label"
                        option-value="value"
                        :loading="isLoading"
                        @update:model-value="(value) => onSelectCloudflareVariant(value as DBCloudflareMode)"
                      />
                      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ currentCloudflareVariantDescription }}</Message>
                    </div>

                    <template v-if="cloudflareVariantInput === 'quick'">
                      <div class="flex items-center gap-3">
                        <Button
                          type="button"
                          severity="secondary"
                          :loading="testRunning"
                          class="cui-button-small"
                          :label="$t('components.form.button.test_connection')"
                          @click="onTestMode('cloudflare')"
                        />
                      </div>
                    </template>

                    <template v-else-if="cloudflareVariantInput === 'token'">
                      <div class="flex flex-col field-gap">
                        <label for="cloudflareHostname" class="cui-label">{{ $t('components.form.label.hostname') }}</label>
                        <InputText
                          id="cloudflareHostname"
                          v-model.trim="cloudflareHostnameInput"
                          :loading="isLoading"
                          type="text"
                          placeholder="nvr.example.com"
                          :maxlength="253"
                        />
                        <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                          $t('components.form.hint.cloudflare_hostname_info')
                        }}</Message>
                      </div>

                      <div class="flex flex-col field-gap">
                        <label for="cloudflareToken" class="cui-label">{{ $t('components.form.label.tunnel_token') }}</label>
                        <Password
                          id="cloudflareToken"
                          v-model.trim="cloudflareTokenInput"
                          :loading="isLoading"
                          :feedback="false"
                          toggle-mask
                          fluid
                          :placeholder="cloudflareTokenSet ? '••••••••••••' : 'eyJ...'"
                        />
                        <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                          cloudflareTokenSet ? $t('components.form.hint.cloudflare_token_already_set') : $t('components.form.hint.cloudflare_token_info')
                        }}</Message>
                      </div>

                      <div class="flex items-center gap-3">
                        <Button
                          type="button"
                          severity="secondary"
                          :loading="testRunning"
                          :disabled="!canTestCloudflare"
                          class="cui-button-small"
                          :label="$t('components.form.button.test_connection')"
                          @click="onTestMode('cloudflare')"
                        />
                      </div>
                    </template>

                    <template v-else-if="cloudflareVariantInput === 'managed'">
                      <Transition name="fade" mode="out-in">
                        <div :key="managedState" class="flex flex-col gap-4">
                          <template v-if="managedState === 'idle'">
                            <div class="flex flex-col field-gap">
                              <label for="cloudflareHostnameManaged" class="cui-label">{{ $t('components.form.label.hostname') }}</label>
                              <InputText
                                id="cloudflareHostnameManaged"
                                v-model.trim="cloudflareHostnameInput"
                                :loading="isLoading"
                                type="text"
                                placeholder="nvr.example.com"
                                :maxlength="253"
                              />
                              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                                $t('components.form.hint.cloudflare_hostname_info')
                              }}</Message>
                            </div>

                            <Message v-if="managedStatus?.lastError" severity="error" variant="simple" size="small">
                              {{ managedStatus.lastError }}
                            </Message>

                            <div class="flex items-center gap-3">
                              <Button
                                type="button"
                                :loading="managedConnectLoading"
                                :disabled="!canConnectManaged"
                                class="cui-button-medium"
                                :label="$t('components.form.button.connect_cloudflare')"
                                @click="onManagedConnect"
                              />
                            </div>
                          </template>

                          <template v-else-if="managedState === 'awaiting_login'">
                            <div v-if="managedStatus?.loginUrl" class="cf-login-setup">
                              <div class="cf-login-qr">
                                <CuiQRCode :value="managedStatus.loginUrl" :size="160" :logo-size="32" />
                              </div>

                              <div class="flex flex-col gap-4 flex-1 min-w-0">
                                <Message variant="simple" size="small" class="text-primary">
                                  {{
                                    $t('components.form.hint.cloudflare_managed_awaiting_login', {
                                      hostname: cloudflareHostnameInput,
                                    })
                                  }}
                                </Message>

                                <div class="flex flex-col field-gap">
                                  <label class="cui-label">{{ $t('components.form.label.cloudflare_url') }}</label>
                                  <InputGroup>
                                    <InputText :model-value="managedStatus.loginUrl" readonly class="font-mono text-sm" />
                                    <InputGroupAddon>
                                      <CuiActionButton
                                        :action-text="$t('components.form.tooltip.copied')"
                                        :icon="CopyIcon"
                                        :button-props="{ severity: 'secondary', text: true }"
                                        @action="onCopyManagedUrl(managedStatus.loginUrl!)"
                                      />
                                    </InputGroupAddon>
                                    <InputGroupAddon>
                                      <Button
                                        v-tooltip="{ value: $t('components.form.button.open_in_browser') }"
                                        type="button"
                                        severity="secondary"
                                        text
                                        @click="onOpenManagedUrl(managedStatus.loginUrl!)"
                                      >
                                        <template #icon>
                                          <OpenIcon />
                                        </template>
                                      </Button>
                                    </InputGroupAddon>
                                  </InputGroup>
                                </div>

                                <div class="flex items-center gap-3">
                                  <ProgressSpinner class="w-[20px] h-[20px] m-0" stroke-width="5" />
                                  <span class="text-sm">{{ $t('views.settings.cloudflare_login_waiting') }}</span>
                                  <Button
                                    type="button"
                                    severity="secondary"
                                    :loading="managedCancelLoading"
                                    class="cui-button-small ml-auto"
                                    :label="$t('components.form.button.cancel')"
                                    @click="onManagedCancel"
                                  />
                                </div>
                              </div>
                            </div>

                            <div v-else class="flex items-center gap-3">
                              <ProgressSpinner class="w-[20px] h-[20px] m-0" stroke-width="5" />
                              <span class="text-sm">{{ $t('views.settings.cloudflare_login_waiting') }}</span>
                              <Button
                                type="button"
                                severity="secondary"
                                :loading="managedCancelLoading"
                                class="cui-button-small ml-auto"
                                :label="$t('components.form.button.cancel')"
                                @click="onManagedCancel"
                              />
                            </div>
                          </template>

                          <template v-else-if="managedState === 'creating_tunnel' || managedState === 'setting_dns'">
                            <div class="flex items-center gap-3">
                              <ProgressSpinner class="w-[20px] h-[20px] m-0" stroke-width="5" />
                              <span class="text-sm">{{
                                managedState === 'creating_tunnel'
                                  ? $t('components.form.hint.cloudflare_managed_creating_tunnel')
                                  : $t('components.form.hint.cloudflare_managed_setting_dns', {
                                      hostname: cloudflareHostnameInput,
                                    })
                              }}</span>
                              <Button
                                type="button"
                                severity="secondary"
                                :loading="managedCancelLoading"
                                class="cui-button-small ml-auto"
                                :label="$t('components.form.button.cancel')"
                                @click="onManagedCancel"
                              />
                            </div>
                          </template>

                          <template v-else-if="managedState === 'running'">
                            <div class="flex flex-col field-gap">
                              <label class="cui-label">{{ $t('components.form.label.hostname') }}</label>
                              <InputText readonly :value="`https://${managedStatus?.hostname ?? ''}`" type="text" />
                              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                                $t('components.form.hint.cloudflare_hostname_info')
                              }}</Message>
                            </div>
                            <div v-if="managedStatus?.tunnelId" class="flex flex-col field-gap">
                              <label class="cui-label">{{ $t('components.form.label.tunnel_id') }}</label>
                              <InputText readonly :value="managedStatus.tunnelId" type="text" />
                              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                                $t('components.form.hint.cloudflare_tunnel_id_info')
                              }}</Message>
                            </div>

                            <div class="flex items-center gap-3">
                              <Button
                                type="button"
                                severity="secondary"
                                :loading="testRunning"
                                class="cui-button-small"
                                :label="$t('components.form.button.test_connection')"
                                @click="onTestMode('cloudflare')"
                              />
                              <Button
                                type="button"
                                severity="secondary"
                                :loading="managedDisconnectLoading"
                                class="cui-button-small ml-auto"
                                :label="$t('components.form.button.disconnect')"
                                @click="onManagedDisconnect"
                              />
                              <Button
                                type="button"
                                severity="danger"
                                :loading="managedLogoutLoading"
                                class="cui-button-small"
                                :label="$t('components.form.button.logout')"
                                @click="onManagedLogout"
                              />
                            </div>
                          </template>
                        </div>
                      </Transition>
                    </template>
                  </div>

                  <div v-else-if="remoteInfoForm.directMode === 'customDomain'" class="cui-toggle-switch flex flex-col gap-4">
                    <Field
                      v-slot="{ field, errors }"
                      v-model.trim="customDomainUrlInput"
                      :loading="isLoading"
                      name="customDomain.url"
                      as="div"
                      class="flex flex-col field-gap"
                    >
                      <label for="customDomain.url" class="cui-label">{{ $t('components.form.label.url') }}</label>
                      <InputText v-bind="field" :invalid="errors.length > 0" :loading="isLoading" type="text" placeholder="https://my.example.com" />

                      <Transition name="fade">
                        <ErrorMessage name="customDomain.url" class="cui-input-error" />
                      </Transition>
                    </Field>

                    <div class="flex items-center gap-3">
                      <Button
                        type="button"
                        severity="secondary"
                        :loading="testRunning"
                        :disabled="!customDomainUrlInput"
                        class="cui-button-small"
                        :label="$t('components.form.button.test_connection')"
                        @click="onTestMode('customDomain')"
                      />
                    </div>
                  </div>

                  <Button type="submit" :loading="isLoading" :disabled="!canSaveDirect" class="cui-button-medium ml-auto" :label="$t('components.form.button.save')" />
                </template>
              </div>
            </template>
          </Card>
        </div>
      </Form>

      <Form ref="serverFormRef" class="flex flex-col w-full gap-6" :validation-schema="serverPatchSchema" @submit="onPatchServer($event as PatchServerInput)">
        <div>
          <span class="card-title">{{ $t('views.settings.network') }}</span>
          <Card class="cui-card">
            <template #content>
              <div class="flex flex-col gap-6">
                <span class="text-sm">{{ $t('views.settings.network_info') }}</span>

                <Field v-slot="{ field, errors }" :model-value="serverInfoForm.serverAddresses" name="serverAddresses" as="div" class="flex flex-col field-gap">
                  <label for="serverAddresses" class="cui-label">{{ $t('components.form.label.server_addresses') }}</label>
                  <InputGroup>
                    <MultiSelect
                      v-bind="field"
                      :model-value="serverInfoForm.serverAddresses"
                      :options="serverInfo?.availableAddresses || []"
                      :invalid="errors.length > 0"
                      :loading="isLoading"
                      :max-selected-labels="2"
                      :show-toggle-all="false"
                      show-clear
                      option-label="address"
                      option-value="address"
                      type="text"
                      display="chip"
                      @value-change="(e) => (serverInfoForm!.serverAddresses = e)"
                    />
                  </InputGroup>

                  <Transition name="fade">
                    <ErrorMessage name="serverAddresses" class="cui-input-error" />
                  </Transition>
                </Field>

                <Button type="submit" :loading="isLoading" class="cui-button-medium ml-auto" :label="$t('components.form.button.save')" />
              </div>
            </template>
          </Card>
        </div>
      </Form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ErrorMessage, Field, Form } from 'vee-validate';
import LocalIcon from '~icons/boxicons/computer-filled';
import CopyIcon from '~icons/fluent/copy-16-filled';
import OpenIcon from '~icons/fluent/open16-filled';
import CloudIcon from '~icons/material-symbols/cloud-outline';
import EarthIcon from '~icons/mdi/earth';
import LanIcon from '~icons/mdi/lan';

import { RemoteQuery } from '@/api/routes/remote.js';
import { ServerQuery } from '@/api/routes/server.js';
import { CLOUD_SERVICE_URL, PROXY_SERVICE_HOST } from '@/common/constants.js';
import { deepToRaw } from '@/common/utils.js';
import { isCapacitor, isInCloudSession } from '@/connection/index.js';
import { remotePatchSchema } from '@/schemas/remote.schema.js';
import { serverPatchSchema } from '@/schemas/server.schema.js';

import type { PatchRemoteInput } from '@/schemas/remote.schema.js';
import type { PatchServerInput } from '@/schemas/server.schema.js';
import type { DBCloudflareMode, DBRemote, DBRemoteDirectMode, DBServer } from '@shared/types';

const serverQuery = new ServerQuery();
const remoteQuery = new RemoteQuery();

const log = useLogger();
const dialog = useCuiDialog();
const toast = useCuiToast();
const { t } = useI18n();

const { data: serverInfo, isBusy: serverInfoLoading } = serverQuery.getServerInfoQuery();
const { data: remoteInfo, isBusy: remoteInfoLoading } = remoteQuery.getRemoteInfoQuery();
const { data: registrationStatus, isBusy: registrationStatusLoading } = remoteQuery.getRegistrationStatusQuery();
const { data: tunnelStatus, isLoading: tunnelStatusLoading } = remoteQuery.getTunnelStatusQuery();
const { data: connectionInfo } = remoteQuery.getConnectionInfoQuery();
const { mutateAsync: patchServer, isPending: patchServerLoading } = serverQuery.patchSystemInfoQuery();
const { mutateAsync: patchRemote, isPending: patchRemoteLoading } = remoteQuery.patchRemoteInfoQuery();
const { mutateAsync: pairInit, isPending: pairInitLoading } = remoteQuery.pairInitMutation();
const { mutateAsync: pairPoll } = remoteQuery.pairPollMutation();
const { mutateAsync: unregisterServer, isPending: unregisterLoading } = remoteQuery.unregisterServerQuery();
const { mutateAsync: updateName, isPending: updateNameLoading } = remoteQuery.updateServerNameQuery();
const { mutateAsync: testRemoteMode, isPending: testRunning } = remoteQuery.testRemoteModeMutation();
const { data: managedStatus } = remoteQuery.getCloudflareManagedStatusQuery();
const { mutateAsync: managedConnect, isPending: managedConnectLoading } = remoteQuery.cloudflareManagedConnectMutation();
const { mutateAsync: managedCancel, isPending: managedCancelLoading } = remoteQuery.cloudflareManagedCancelMutation();
const { mutateAsync: managedDisconnect, isPending: managedDisconnectLoading } = remoteQuery.cloudflareManagedDisconnectMutation();
const { mutateAsync: managedLogout, isPending: managedLogoutLoading } = remoteQuery.cloudflareManagedLogoutMutation();

const serverInfoForm = ref<DBServer>();
const remoteInfoForm = ref<DBRemote>();
const serverNameInput = ref('');
const customDomainUrlInput = ref('');
const cloudflareVariantInput = ref<DBCloudflareMode>('quick');
const cloudflareHostnameInput = ref('');
const cloudflareTokenInput = ref('');
const cloudflareTokenSet = ref(false);
const pairCode = ref<string | null>(null);
const pairUrl = ref('');
const pairExpiresAt = ref<number | null>(null);
const pairPollIntervalSec = ref(2);
const pairCountdown = ref('');
let pairPollTimer: ReturnType<typeof setTimeout> | null = null;
let pairCountdownTimer: ReturnType<typeof setInterval> | null = null;

const isLoading = computed(() => {
  return (
    patchServerLoading.value ||
    patchRemoteLoading.value ||
    serverInfoLoading.value ||
    remoteInfoLoading.value ||
    registrationStatusLoading.value ||
    unregisterLoading.value
  );
});

const directEffective = computed(() => Boolean(remoteInfoForm.value?.enabled || remoteInfoForm.value?.directEnabled));
const directOverride = computed(() => remoteInfo.value?.directOverride ?? { active: false, fallback: false });

const isRegistered = computed(() => registrationStatus.value?.isRegistered ?? false);
const needsReauth = computed(() => registrationStatus.value?.needsReauth ?? false);
const isNameEditable = computed(() => !isLoading.value);

const canSaveName = computed(() => {
  if (!isNameEditable.value) return false;
  const name = serverNameInput.value.trim();
  if (!name || name.length > 100) return false;
  return name !== (registrationStatus.value?.serverName ?? '');
});

const canSaveDirect = computed(() => {
  if (!remoteInfoForm.value) return false;
  if (remoteInfoForm.value.directMode === 'customDomain') {
    const trimmed = customDomainUrlInput.value.trim();
    if (!trimmed) return false;
    try {
      new URL(trimmed);
    } catch {
      return false;
    }
    return trimmed !== (remoteInfo.value?.remoteSettings.customDomain.url ?? '');
  }
  if (remoteInfoForm.value.directMode === 'cloudflare') {
    const stored = remoteInfo.value?.remoteSettings.cloudflare;
    const directModeChanged = remoteInfo.value?.remoteSettings.directMode !== 'cloudflare';
    const variant = cloudflareVariantInput.value;

    if (variant === 'quick') {
      return directModeChanged || stored?.mode !== 'quick';
    }
    const hostname = cloudflareHostnameInput.value.trim();
    if (!hostname || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(hostname)) return false;
    if (variant === 'token') {
      const token = cloudflareTokenInput.value.trim();
      if (!token && !cloudflareTokenSet.value) return false;
      const tokenChanged = token.length > 0;
      return directModeChanged || stored?.mode !== 'token' || stored?.hostname !== hostname || tokenChanged;
    }
    if (variant === 'managed') {
      return directModeChanged || stored?.mode !== 'managed' || stored?.hostname !== hostname;
    }
    return false;
  }
  return remoteInfoForm.value.directMode !== remoteInfo.value?.remoteSettings.directMode;
});

const directModes = computed<{ value: DBRemoteDirectMode; label: string; description: string }[]>(() => [
  {
    value: 'cloudflare',
    label: t('components.form.label.cloudflare'),
    description: t('components.form.hint.cloudflare_mode_info'),
  },
  {
    value: 'customDomain',
    label: t('components.form.label.custom_domain'),
    description: t('components.form.hint.custom_domain_mode_info'),
  },
]);

const currentModeDescription = computed(() => {
  return directModes.value.find((m) => m.value === remoteInfoForm.value?.directMode)?.description ?? '';
});

const cloudflareVariants = computed<{ value: DBCloudflareMode; label: string; description: string }[]>(() => [
  {
    value: 'quick',
    label: t('components.form.label.cloudflare_variant_quick'),
    description: t('components.form.hint.cloudflare_variant_quick'),
  },
  {
    value: 'token',
    label: t('components.form.label.cloudflare_variant_token'),
    description: t('components.form.hint.cloudflare_variant_token'),
  },
  {
    value: 'managed',
    label: t('components.form.label.cloudflare_variant_managed'),
    description: t('components.form.hint.cloudflare_variant_managed'),
  },
]);

const currentCloudflareVariantDescription = computed(() => {
  return cloudflareVariants.value.find((v) => v.value === cloudflareVariantInput.value)?.description ?? '';
});

const canTestCloudflare = computed(() => {
  if (cloudflareVariantInput.value === 'quick') return true;
  const stored = remoteInfo.value?.remoteSettings.cloudflare;
  return stored?.mode === cloudflareVariantInput.value && !!stored?.hostname;
});

const managedState = computed(() => managedStatus.value?.state ?? 'idle');

const canConnectManaged = computed(() => {
  if (managedState.value !== 'idle') return false;
  const hostname = cloudflareHostnameInput.value.trim();
  return !!hostname && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(hostname);
});

const connectionTypeLabel = computed(() => {
  const type = connectionInfo.value?.currentConnection.type ?? 'lan';
  return t(`views.settings.connection_type.${type}`);
});

const connectionIcon = computed(() => {
  const type = connectionInfo.value?.currentConnection.type;
  if (type === 'cloud') return CloudIcon;
  if (type === 'external') return EarthIcon;
  if (type === 'local') return LocalIcon;
  return LanIcon;
});

const connectionIconColor = computed(() => {
  const type = connectionInfo.value?.currentConnection.type;
  if (type === 'cloud') return 'text-warning';
  if (type === 'external') return 'text-info';
  if (type === 'local') return 'text-primary';
  return 'text-success';
});

async function onUpdateServerName() {
  const name = serverNameInput.value.trim();
  if (!name) return;
  try {
    await updateName(name);
  } catch {
    //
  }
}

function openUnregisterServerDialog() {
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.unregister_server'),
      confirmText: t('components.form.button.unregister'),
      contentText: t('components.dialog.message.confirm_unregister_server'),
      loading: isLoading,
    },
    onConfirm: async () => {
      try {
        await unregisterServer();
      } catch {
        //
      }
    },
  });
}

function clearPairTimers() {
  if (pairPollTimer) {
    clearTimeout(pairPollTimer);
    pairPollTimer = null;
  }
  if (pairCountdownTimer) {
    clearInterval(pairCountdownTimer);
    pairCountdownTimer = null;
  }
}

function resetPairState() {
  clearPairTimers();
  pairCode.value = null;
  pairUrl.value = '';
  pairExpiresAt.value = null;
  pairCountdown.value = '';
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function startCountdown() {
  if (pairCountdownTimer) clearInterval(pairCountdownTimer);
  const update = () => {
    if (!pairExpiresAt.value) return;
    const remaining = pairExpiresAt.value - Date.now();
    if (remaining <= 0) {
      resetPairState();
      toast.add({ severity: 'warn', detail: t('components.toast.pair_expired'), life: 3000 });
      return;
    }
    pairCountdown.value = formatCountdown(remaining);
  };
  update();
  pairCountdownTimer = setInterval(update, 1000);
}

function schedulePoll() {
  if (pairPollTimer) clearTimeout(pairPollTimer);
  pairPollTimer = setTimeout(runPoll, pairPollIntervalSec.value * 1000);
}

async function runPoll() {
  if (!pairCode.value) return;
  const code = pairCode.value;
  try {
    const result = await pairPoll({ name: serverNameInput.value.trim() || undefined });
    if (!pairCode.value || pairCode.value !== code) return;
    if (result.state === 'confirmed') {
      resetPairState();
      return;
    }
    if (result.state === 'expired') {
      resetPairState();
      toast.add({ severity: 'warn', detail: t('components.toast.pair_expired'), life: 3000 });
      return;
    }
    if (result.state === 'denied') {
      resetPairState();
      toast.add({ severity: 'warn', detail: t('components.toast.pair_denied'), life: 3000 });
      return;
    }
    if (result.state === 'slow_down') {
      pairPollIntervalSec.value = Math.min(pairPollIntervalSec.value + 2, 10);
    }
    schedulePoll();
  } catch (err: any) {
    if (!pairCode.value || pairCode.value !== code) return;
    // Network blip — keep trying; cloud-side TTL governs hard expiry.
    log.error('pair poll failed:', err);
    schedulePoll();
  }
}

async function onStartPairing() {
  resetPairState();
  try {
    const desiredName = serverNameInput.value.trim();
    if (desiredName && desiredName !== (registrationStatus.value?.serverName ?? '')) {
      try {
        await updateName(desiredName);
      } catch {
        // Non-fatal — the cloud side still gets the name via pollPairing.
      }
    }
    const result = await pairInit(desiredName || undefined);
    pairCode.value = result.userCode;
    pairUrl.value = result.verificationUriComplete;
    pairExpiresAt.value = Date.now() + result.expiresIn * 1000;
    pairPollIntervalSec.value = Math.max(1, result.pollInterval);
    startCountdown();
    schedulePoll();
  } catch (err: any) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  }
}

function onCancelPairing() {
  resetPairState();
}

async function onCopyPairCode() {
  if (!pairCode.value) return;
  try {
    await navigator.clipboard.writeText(pairCode.value);
  } catch {
    //
  }
}

async function onCopyPairUrl() {
  if (!pairUrl.value) return;
  try {
    await navigator.clipboard.writeText(pairUrl.value);
  } catch {
    //
  }
}

function onOpenPairUrl() {
  if (!pairUrl.value) return;
  window.open(pairUrl.value, '_blank', 'noopener');
}

function onToggleCloud(enabled: boolean) {
  const isRemoteSession = window.location.host === PROXY_SERVICE_HOST || (isCapacitor && isInCloudSession());

  let messageKey: string;
  if (enabled) {
    messageKey = 'components.dialog.message.confirm_enable_cloud';
  } else if (isRemoteSession) {
    messageKey = 'components.dialog.message.confirm_disable_cloud_remote';
  } else {
    messageKey = 'components.dialog.message.confirm_disable_cloud_local';
  }

  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t(messageKey),
      confirmText: t(enabled ? 'components.form.button.enable' : 'components.form.button.disable'),
      loading: isLoading,
      confirmButtonProps: enabled ? undefined : { severity: 'danger' },
    },
    onConfirm: async () => {
      try {
        const patch: PatchRemoteInput = enabled ? { enabled: true } : { enabled: false };
        await patchRemote(patch);
      } catch {
        if (remoteInfoForm.value) remoteInfoForm.value.enabled = !enabled;
      }
    },
    onCancel: () => {
      if (remoteInfoForm.value) remoteInfoForm.value.enabled = !enabled;
    },
  });
}

function onToggleDirect(enabled: boolean) {
  patchRemote({ directEnabled: enabled }).catch(() => {
    if (remoteInfoForm.value) remoteInfoForm.value.directEnabled = !enabled;
  });
}

function onSelectMode(mode: DBRemoteDirectMode) {
  if (!remoteInfoForm.value) return;
  remoteInfoForm.value.directMode = mode;
}

function onSelectCloudflareVariant(variant: DBCloudflareMode) {
  cloudflareVariantInput.value = variant;
}

async function onManagedConnect() {
  const hostname = cloudflareHostnameInput.value.trim();
  if (!hostname) return;
  try {
    await patchRemote({ directMode: 'cloudflare', cloudflare: { mode: 'managed', hostname } });
    await managedConnect(hostname);
  } catch {
    //
  }
}

async function onManagedCancel() {
  try {
    await managedCancel();
  } catch {
    //
  }
}

async function onManagedDisconnect() {
  try {
    await managedDisconnect();
  } catch {
    //
  }
}

async function onManagedLogout() {
  try {
    await managedLogout();
  } catch {
    //
  }
}

async function onCopyManagedUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    //
  }
}

function onOpenManagedUrl(url: string) {
  window.open(url, '_blank', 'noopener');
}

async function onTestMode(mode: DBRemoteDirectMode) {
  try {
    const result = await testRemoteMode(mode);
    if (result.ok) {
      toast.add({ severity: 'success', detail: t('components.toast.remote_test_success'), life: 3000 });
    } else {
      toast.add({ severity: 'error', detail: t('components.toast.remote_test_failed', { message: result.message ?? '' }), life: 5000 });
    }
  } catch (error: any) {
    toast.add({ severity: 'error', detail: t('components.toast.remote_test_failed', { message: error?.message ?? '' }), life: 5000 });
  }
}

async function onPatchRemote(values: PatchRemoteInput) {
  const patch: PatchRemoteInput = { directMode: values.directMode };
  if (values.directMode === 'customDomain') {
    patch.customDomain = { url: customDomainUrlInput.value.trim() };
  } else if (values.directMode === 'cloudflare') {
    const variant = cloudflareVariantInput.value;
    if (variant === 'quick') {
      patch.cloudflare = { mode: 'quick', hostname: null, token: null };
    } else if (variant === 'token') {
      const token = cloudflareTokenInput.value.trim();
      patch.cloudflare = {
        mode: 'token',
        hostname: cloudflareHostnameInput.value.trim(),
        ...(token ? { token } : {}),
      };
    } else if (variant === 'managed') {
      patch.cloudflare = {
        mode: 'managed',
        hostname: cloudflareHostnameInput.value.trim(),
        token: null,
      };
    }
  }
  try {
    await patchRemote(patch);
  } catch {
    //
  }
}

async function onPatchServer(values: PatchServerInput) {
  try {
    await patchServer(values);
  } catch {
    //
  }
}

watch(
  () => registrationStatus.value?.serverName,
  (name) => {
    if (name) {
      serverNameInput.value = name;
    }
  },
  { immediate: true },
);

watch(isRegistered, (registered) => {
  if (registered && pairCode.value) {
    resetPairState();
  }
});

watch(
  serverInfo,
  (info) => {
    if (info) {
      const serverInfoRaw = deepToRaw(info);
      serverInfoForm.value = {
        ...serverInfoRaw,
        serverAddresses: (serverInfoRaw.serverAddresses || []).filter(Boolean),
      };
    }
  },
  { deep: true, immediate: true },
);

watch(
  remoteInfo,
  (info) => {
    if (info) {
      const remoteInfoRaw = deepToRaw(info);
      remoteInfoForm.value = { ...remoteInfoRaw.remoteSettings };
      customDomainUrlInput.value = remoteInfoRaw.remoteSettings.customDomain.url ?? '';
      const cf = remoteInfoRaw.remoteSettings.cloudflare;
      cloudflareVariantInput.value = cf?.mode ?? 'quick';
      cloudflareHostnameInput.value = cf?.hostname ?? '';
      cloudflareTokenInput.value = '';
      cloudflareTokenSet.value = remoteInfoRaw.cloudflareTokenSet ?? false;
    }
  },
  { deep: true, immediate: true },
);

onBeforeUnmount(() => {
  clearPairTimers();
});
</script>

<style scoped>
.cf-login-setup,
.cui-pair-layout {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

@media (min-width: 768px) {
  .cf-login-setup,
  .cui-pair-layout {
    flex-direction: row;
    align-items: flex-start;
    gap: 2rem;
  }
}

.cf-login-qr,
.cui-pair-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}
</style>
