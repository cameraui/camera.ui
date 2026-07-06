<template>
  <div
    :style="{
      viewTransitionName: viewTransition ? `camera-card-${cameraName.replace(/[^a-zA-Z0-9-_]/g, '-')}` : undefined,
      viewTransitionClass: cameraIsInRouter && viewTransition ? 'active-transition' : undefined,
    }"
  >
    <Card class="cui-card" :pt="cardPt">
      <template #content>
        <Button
          v-if="backButton"
          class="dark-mode absolute top-[10px] left-4 z-6 bg-black/20 hover:bg-black/40 active:bg-black/60"
          rounded
          text
          severity="contrast"
          @click="goBack"
        >
          <template #icon>
            <i-iconamoon:arrow-left-2-light class="w-6 h-6" />
          </template>
        </Button>

        <div
          id="video-container"
          ref="playerContainerRef"
          class="bg-black flex items-center justify-center relative min-w-0"
          :class="{
            'detection-detected': showDetectionIndicator,
            'edit-mode': shortcutsEditMode,
            'overflow-visible': isZoomingIn,
            'overflow-hidden': !isZoomingIn,
            'resizable-mode': resizable,
          }"
          :style="[
            videoContainerStyle,
            {
              '--cam-ar-w': arParsed.w,
              '--cam-ar-h': arParsed.h,
            },
          ]"
          @click="resumeStream"
        >
          <TransitionGroup name="fade">
            <div v-if="isDisabled && !nvrPlaybackVisible" key="disabled" class="absolute inset-0 bg-black/80 flex items-center justify-center z-8 pointer-events-none">
              <div class="flex flex-col items-center justify-center text-center gap-2">
                <i-fluent:video-off-32-filled class="text-white/60 w-[50px] h-[50px]" />
                <p v-if="isFullPlayer" class="text-white/50 text-sm max-w-xs">{{ $t('views.camera.camera_disabled') }}</p>
                <p v-if="isFullPlayer" class="text-white/30 text-xs max-w-xs">{{ $t('views.camera.camera_disabled_hint') }}</p>
              </div>
            </div>

            <div v-if="inStandby && !camera?.disabled" key="sleep" class="absolute inset-0 bg-black/80 flex items-center justify-center z-7 pointer-events-none">
              <div class="flex flex-col items-center justify-center text-center">
                <i-solar:moon-sleep-bold class="text-white w-[50px] h-[50px]" />
                <p v-if="isFullPlayer" class="text-white/80 text-sm max-w-xs mt-3">{{ $t('components.player.stream_paused') }}</p>
              </div>
            </div>

            <div
              v-if="showCenterSpinner && !inStandby && !isDisabled"
              key="loading"
              class="absolute inset-0 flex flex-col items-center justify-center z-6 pointer-events-none"
            >
              <ProgressSpinner class="w-[30px] h-[30px] m-0" :class="nvrPlaybackVisible ? 'nvr-spinner' : ''" stroke-width="5" />
              <span v-if="reconnecting && !nvrPlaybackVisible && isFullPlayer" class="mt-3 text-white text-sm text-shadow"
                >{{ $t('components.player.reconnecting') }}...</span
              >
            </div>

            <div v-if="infoText && !inStandby && !isDisabled" key="info" class="absolute w-full flex justify-center z-6 mt-4 pointer-events-none">
              <span class="camera-card-info-box">{{ infoText }}</span>
            </div>

            <div
              v-show="timelineState && !showPtz && !inStandby && !gridSearchActive && !cameraStream.isFullscreen.value"
              id="timeline-container"
              key="timeline"
              class="absolute inset-0 z-5"
            ></div>

            <div
              v-if="showPtz && !timelineState && !inStandby && !gridSearchActive && cameraDevice"
              key="ptz"
              class="absolute top-0 left-0 right-0 z-7"
              :style="{ bottom: showControl ? '48px' : '0px', transition: 'bottom 0.2s ease' }"
            >
              <CuiPTZControl ref="ptzRef" :camera-device />
            </div>
          </TransitionGroup>

          <Transition
            enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-200 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div v-if="showDescription && eventDescription" class="ai-description-overlay">
              <i-tabler:sparkles class="w-4 h-4 text-white/90 shrink-0 mt-0.5" />
              <div class="min-w-0">
                <p class="text-sm font-semibold text-white">{{ eventDescription.title }}</p>
                <p class="text-xs text-white/85 mt-1">{{ eventDescription.description }}</p>
              </div>
            </div>
          </Transition>

          <VueZoomable
            ref="arBoxRef"
            v-model:pan="panValue"
            v-model:zoom="zoomValue"
            :disabled="resizable || (expandableCard && !isExpanded) || !isHoveredZoom || timelineState || showPtz || inStandby || gridSearchActive || isDisabled"
            :pan-enabled="zoomValue > 1"
            :enable-control-button="false"
            :dbl-click-enabled="false"
            :min-zoom="1"
            :max-zoom="effectiveMaxZoom"
            :selector="resizable ? 'disabled' : `[data-zoomable-content='${randomId}']`"
            zoom-origin="pointer"
            class="ar-box flex items-center justify-center"
            :style="arStyle"
            :class="{ 'zoom-constraining': isConstraining, 'touch-none': resizable }"
            @panned="onZoomPan"
            @zoom="onZoomPan"
            @dblclick="onDoubleClickZoom"
            @touchstart="onContentTouchStart"
            @touchmove="onContentTouchMove"
            @touchend="onContentTouchEnd"
            @mousedown="onContentMouseDown"
            @wheel="onContentWheel"
          >
            <div :data-zoomable-content="randomId" class="relative h-full min-w-0" :style="videoWrapperStyle">
              <div class="absolute inset-0 z-3 pointer-events-none">
                <CuiShortcuts
                  v-if="!inStandby && !isDisabled && showShortcuts"
                  :camera-name
                  :visible="shortcutsVisible"
                  :editing="shortcutsEditMode"
                  :interaction-locked="zoomValue > 1"
                />

                <CuiBBoxPlayground v-if="boundingBoxOverlay && !inStandby && !nvrPlaybackVisible && !isDisabled" ref="detectionCanvasRef" :classes="bboxClasses" />

                <CuiPolygon v-if="zoneState && !inStandby && !isDisabled" :camera-zones :camera-lines />

                <CuiGridSearch
                  v-if="gridSearch?.active.value && !isDisabled"
                  :model-value="gridSearch.regions.value"
                  @update:model-value="
                    (v) => {
                      if (gridSearch) gridSearch.regions.value = v;
                    }
                  "
                />

                <CuiHeatmap v-if="heatmapEnabled && camera && !isDisabled" :camera-id="camera._id" />
              </div>

              <div v-if="nvrNoData || nvrLicenseRequired" class="absolute inset-0 z-3 pointer-events-none overflow-hidden">
                <div class="w-full h-full blur-xs">
                  <CuiCameraSnapshot v-if="camera" :camera :show-loading-screen="false" :image-style="{ objectFit: 'fill' }" />
                </div>
                <div class="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div class="flex flex-col items-center justify-center text-center">
                    <i-mdi:license v-if="nvrLicenseRequired" class="text-white w-[50px] h-[50px]" />
                    <i-mdi:video-off v-else class="text-white w-[50px] h-[50px]" />
                    <p v-if="isFullPlayer" class="text-white/80 text-sm max-w-xs mt-3">
                      {{ nvrLicenseRequired ? $t('components.player.license_required') : $t('components.player.no_recording') }}
                    </p>
                  </div>
                </div>
              </div>

              <CuiCameraSnapshot
                v-if="camera"
                key="snapshot"
                ref="snapshotRef"
                :camera
                :show-loading-screen="false"
                class="absolute inset-0 cursor-[inherit] z-0"
                :image-style="{ objectFit: 'fill' }"
                :class="{
                  'cursor-pointer': cardIsTappable,
                  'pointer-events-none': !cardIsTappable,
                }"
                @click="onCardClick"
              />

              <div
                :ref="
                  (el) => {
                    if (el) cameraStream.containerElement.value = el as HTMLElement;
                  }
                "
                :data-player-id="randomId"
                class="w-full h-full cursor-[inherit] relative z-1"
                :class="{
                  'cursor-pointer': cardIsTappable,
                }"
                @click="onCardClick"
              />
            </div>
          </VueZoomable>

          <div
            v-if="!inStandby && (showCameraName || liveIndicatorOverlay)"
            class="absolute top-0 w-full p-4 flex items-center justify-between gap-2 pointer-events-none"
            :class="isDisabled ? 'z-9' : 'z-6'"
          >
            <div
              v-if="liveIndicatorOverlay"
              class="w-[10px] h-[10px] rounded-full shadow-md"
              :class="isDisabled ? 'bg-gray-500' : nvrPlaybackVisible ? 'bg-sky-500' : streamFinishedLoading ? 'bg-red-500' : 'bg-gray-500'"
            />
            <span v-if="showCameraName" class="text-sm font-semibold p-2 bg-black/60 rounded-xl text-white">{{ cameraName }}</span>
          </div>

          <Transition name="fade-2">
            <div v-if="showControl && !timelineState" class="absolute bottom-0 inset-x-0 z-6 dark-mode" :class="{ 'control-bar-tiny': isTinyPlayer }">
              <div class="control-bar-gradient pointer-events-none" />
              <div class="relative flex items-center gap-1 px-3 pb-3 pt-8">
                <div class="flex items-center gap-0.5">
                  <Button
                    v-if="controlRewindButton && controlBarLayout.rewind.inline"
                    :disabled="!nvr"
                    fluid
                    text
                    severity="contrast"
                    class="control-bar-btn"
                    @click="toggleRewind"
                  >
                    <template #icon>
                      <i-mdi:rewind-30 class="w-[18px] h-[18px]" />
                    </template>
                  </Button>

                  <Button v-if="controlPlayPauseButton" :disabled="isLoading" fluid text severity="contrast" class="control-bar-btn" @click="togglePlay">
                    <template #icon>
                      <i-basil:play-solid v-if="!showPlayPauseIcon" class="w-[18px] h-[18px]" />
                      <i-basil:pause-solid v-else class="w-[18px] h-[18px]" />
                    </template>
                  </Button>

                  <Button
                    v-if="controlFastForwardButton && controlBarLayout.fastForward.inline"
                    :disabled="nvrMode === 'idle'"
                    fluid
                    text
                    severity="contrast"
                    class="control-bar-btn"
                    @click="toggleFastForward"
                  >
                    <template #icon>
                      <i-mdi:fast-forward-30 class="w-[18px] h-[18px]" />
                    </template>
                  </Button>

                  <Button
                    v-if="controlBarLayout.speed.inline"
                    :disabled="nvrMode === 'idle'"
                    fluid
                    text
                    severity="contrast"
                    class="control-bar-btn"
                    style="font-size: 12px; font-weight: 600"
                    @click="speedPopoverRef?.toggle($event)"
                  >
                    <template #icon>
                      <span>{{ nvr?.speed.value ?? 1 }}×</span>
                    </template>
                  </Button>
                </div>

                <div class="flex-1" />

                <div class="flex items-center gap-0.5">
                  <Button
                    v-if="controlSpeakerButton && controlBarLayout.speaker.inline"
                    :disabled="!streamHasSound || isLoading"
                    fluid
                    text
                    severity="contrast"
                    class="control-bar-btn"
                    @click="toggleMute()"
                  >
                    <template #icon>
                      <i-heroicons:speaker-wave-16-solid v-if="!muted" class="w-[18px] h-[18px]" />
                      <i-heroicons:speaker-x-mark-16-solid v-else class="w-[18px] h-[18px]" />
                    </template>
                  </Button>

                  <Button
                    v-if="controlMicrophoneButton && controlBarLayout.microphone.inline"
                    :disabled="micButtonDisabled"
                    fluid
                    text
                    severity="contrast"
                    class="control-bar-btn"
                    @click="toggleMicrophone(undefined, true)"
                  >
                    <template #icon>
                      <i-mage:microphone-fill v-if="micActive" class="w-[18px] h-[18px]" />
                      <i-mage:microphone-mute-fill v-else class="w-[18px] h-[18px]" />
                    </template>
                  </Button>

                  <Button
                    v-if="expandableCard && controlBarLayout.expand.inline && !tapsForExpand"
                    v-tooltip.top="{ value: isExpanded ? $t('components.player.shrink') : $t('components.player.expand') }"
                    fluid
                    text
                    severity="contrast"
                    class="control-bar-btn"
                    @click="toggleExpand"
                  >
                    <template #icon>
                      <i-eva:collapse-outline v-if="isExpanded" class="w-[18px] h-[18px]" />
                      <i-eva:expand-outline v-else class="w-[18px] h-[18px]" />
                    </template>
                  </Button>

                  <Button v-if="hasMoreMenuItems" fluid text severity="contrast" class="control-bar-btn" @click="morePopoverRef?.toggle($event)">
                    <template #icon>
                      <i-lucide:more-vertical class="w-[18px] h-[18px]" />
                    </template>
                  </Button>

                  <Button v-if="controlFsButton" :disabled="isLoading" fluid text severity="contrast" class="control-bar-btn" @click="toggleFs">
                    <template #icon>
                      <i-mingcute:fullscreen-fill v-if="!cameraStream.isFullscreen.value" class="w-[18px] h-[18px]" />
                      <i-mingcute:fullscreen-exit-fill v-else class="w-[18px] h-[18px]" />
                    </template>
                  </Button>

                  <Button
                    v-if="showOpenCameraButton"
                    v-tooltip.top="{ value: $t('components.player.open_camera') }"
                    fluid
                    text
                    severity="contrast"
                    class="control-bar-btn"
                    @click="$router.push(routerLink!)"
                  >
                    <template #icon>
                      <i-fluent:open-32-filled class="w-[18px] h-[18px]" />
                    </template>
                  </Button>
                </div>
              </div>

              <Popover
                ref="speedPopoverRef"
                class="more-menu-popover"
                :append-to="popoverAppendTarget"
                @show="controlBarPopoverOpen = true"
                @hide="controlBarPopoverOpen = false"
              >
                <div class="flex flex-col min-w-[60px]">
                  <button
                    v-for="opt in speedOptions"
                    :key="opt"
                    class="more-menu-item justify-center"
                    :class="{ 'more-menu-item-active': (nvr?.speed.value ?? 1) === opt }"
                    @click="
                      nvr?.setSpeed(opt);
                      speedPopoverRef?.hide();
                    "
                  >
                    {{ opt }}×
                  </button>
                </div>
              </Popover>

              <Popover ref="morePopoverRef" class="more-menu-popover" :append-to="popoverAppendTarget" @show="morePopoverOpen = true" @hide="morePopoverOpen = false">
                <div class="flex flex-col">
                  <button
                    v-if="controlRewindButton && controlBarLayout.rewind.inMenu"
                    :disabled="!nvr"
                    class="more-menu-item"
                    @click="
                      toggleRewind();
                      morePopoverRef?.hide();
                    "
                  >
                    <i-mdi:rewind-30 class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ $t('components.player.rewind') }}</span>
                  </button>

                  <button
                    v-if="controlFastForwardButton && controlBarLayout.fastForward.inMenu"
                    :disabled="nvrMode === 'idle'"
                    class="more-menu-item"
                    @click="
                      toggleFastForward();
                      morePopoverRef?.hide();
                    "
                  >
                    <i-mdi:fast-forward-30 class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ $t('components.player.fast_forward') }}</span>
                  </button>

                  <button v-if="controlBarLayout.speed.inMenu" :disabled="nvrMode === 'idle'" class="more-menu-item" @click="openSpeedFromMore($event)">
                    <i-mdi:speedometer class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ $t('components.player.speed') }} ({{ nvr?.speed.value ?? 1 }}×)</span>
                  </button>

                  <button
                    v-if="controlSpeakerButton && controlBarLayout.speaker.inMenu"
                    :disabled="!streamHasSound || isLoading"
                    class="more-menu-item"
                    @click="
                      toggleMute();
                      morePopoverRef?.hide();
                    "
                  >
                    <i-heroicons:speaker-wave-16-solid v-if="!muted" class="w-[18px] h-[18px] shrink-0" />
                    <i-heroicons:speaker-x-mark-16-solid v-else class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ muted ? $t('components.form.tooltip.unmute') : $t('components.form.tooltip.mute') }}</span>
                  </button>

                  <button
                    v-if="expandableCard && controlBarLayout.expand.inMenu && !tapsForExpand"
                    class="more-menu-item"
                    @click="
                      toggleExpand();
                      morePopoverRef?.hide();
                    "
                  >
                    <i-eva:collapse-outline v-if="isExpanded" class="w-[18px] h-[18px] shrink-0" />
                    <i-eva:expand-outline v-else class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ isExpanded ? $t('components.player.shrink') : $t('components.player.expand') }}</span>
                  </button>

                  <button
                    v-if="controlMicrophoneButton && controlBarLayout.microphone.inMenu"
                    :disabled="micButtonDisabled"
                    class="more-menu-item"
                    @click="
                      toggleMicrophone(undefined, true);
                      morePopoverRef?.hide();
                    "
                  >
                    <i-mage:microphone-fill v-if="micActive" class="w-[18px] h-[18px] shrink-0" />
                    <i-mage:microphone-mute-fill v-else class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ $t('components.form.tooltip.intercom') }}</span>
                  </button>

                  <button
                    v-if="controlPipButton && controlBarLayout.pip.inMenu"
                    :disabled="!isPipSupported || isLoading || nvrPlaybackVisible"
                    class="more-menu-item"
                    @click="
                      togglePictureInPicture();
                      morePopoverRef?.hide();
                    "
                  >
                    <i-fluent:picture-in-picture-16-regular v-if="!isPip" class="w-[18px] h-[18px] shrink-0" />
                    <i-fluent:picture-in-picture-16-filled v-else class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ isPip ? $t('components.player.hide_pip') : $t('components.player.show_pip') }}</span>
                  </button>

                  <button
                    v-if="subcontrol && subcontrolQualityButton && controlBarLayout.quality.inMenu"
                    :disabled="isLoading"
                    class="more-menu-item"
                    @click="
                      toggleSourceRole();
                      morePopoverRef?.hide();
                    "
                  >
                    <i-mynaui:letter-l-square-solid v-if="displayResolution === 'low-resolution'" class="w-[18px] h-[18px] shrink-0" />
                    <i-mynaui:letter-m-square-solid v-else-if="displayResolution === 'mid-resolution'" class="w-[18px] h-[18px] shrink-0" />
                    <i-mynaui:letter-h-square-solid v-else class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ getCurrentResolution() }}</span>
                  </button>

                  <button
                    v-if="subcontrol && subcontrolStreamingModeButton && controlBarLayout.streamingMode.inMenu"
                    :disabled="isLoading || nvrPlaybackVisible"
                    class="more-menu-item"
                    @click="
                      toggleStreamingMode();
                      morePopoverRef?.hide();
                    "
                  >
                    <i-cbi:iosfacetime v-if="activeMode === 'mse'" class="w-[18px] h-[18px] shrink-0" />
                    <i-simple-icons:webrtc v-else class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ getCurrentStreamingMode() }}</span>
                  </button>

                  <button
                    v-if="subcontrol && subcontrolActivityModeButton && controlBarLayout.activityMode.inMenu"
                    :disabled="isLoading || nvrPlaybackVisible"
                    class="more-menu-item"
                    @click="
                      toggleActivityMode();
                      morePopoverRef?.hide();
                    "
                  >
                    <i-mdi:webcam v-if="activityMode === 'always-on'" class="w-[18px] h-[18px] shrink-0" />
                    <i-icon-park-solid:sleep v-else-if="activityMode === 'standby'" class="w-[18px] h-[18px] shrink-0" />
                    <i-fluent:pulse-24-filled v-else class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ getCurrentActivityMode() }}</span>
                  </button>

                  <button
                    v-if="subcontrol && subcontrolPtzButton && hasPtz && controlBarLayout.ptz.inMenu"
                    :disabled="isLoading || timelineState || nvrPlaybackVisible"
                    class="more-menu-item"
                    :class="{ 'more-menu-item-active': ptzState }"
                    @click="
                      togglePtz();
                      morePopoverRef?.hide();
                    "
                  >
                    <i-grommet-icons:pan class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ $t('components.player.ptz') }}</span>
                  </button>

                  <button
                    v-if="ptzState && hasPtz && ptzRef?.hasHome"
                    :disabled="isLoading || ptzRef?.isLoading || nvrPlaybackVisible"
                    class="more-menu-item"
                    @click="
                      ptzRef?.goToHome();
                      morePopoverRef?.hide();
                    "
                  >
                    <i-material-symbols:home-rounded class="w-[18px] h-[18px] shrink-0" />
                    <span>{{ $t('components.player.ptz_go_to_home') }}</span>
                  </button>
                </div>
              </Popover>
            </div>
          </Transition>

          <Transition name="fade-2">
            <div v-if="zoomMinimapStyle" class="zoom-minimap" :class="{ 'zoom-minimap-raised': showControl }">
              <div class="zoom-minimap-viewport" :style="zoomMinimapStyle" />
            </div>
          </Transition>
        </div>

        <div
          v-if="toolbar"
          :class="[
            'relative w-full min-h-[60px] h-[60px] camera-toolbar-background border-t-[1px] border-color flex items-center justify-between py-2 px-4 gap-1 z-10',
            toolbarClass,
            { 'pointer-events-none opacity-50': gridSearchActive },
          ]"
          :style="[toolbarStyle]"
        >
          <div
            v-if="resizable"
            class="absolute left-0 right-0 top-0.5 h-5 flex items-center justify-center cursor-ns-resize touch-none z-20"
            @mousedown="onResizeStart"
            @touchstart.passive="onResizeTouchStart"
          >
            <div class="w-9 h-1 rounded-full bg-surface-400/50" />
          </div>
          <div class="flex items-center gap-2">
            <ProgressSpinner v-if="streamIsLoading" stroke-width="5" class="w-[10px] h-[10px]" :class="nvrPlaybackVisible ? 'nvr-spinner' : ''" />
            <div
              v-else
              class="w-[10px] h-[10px] rounded-full"
              :class="isDisabled && !nvrPlaybackVisible ? 'bg-gray-500' : nvrPlaybackVisible ? 'bg-sky-500' : 'bg-primary-500'"
            ></div>
            <span class="text-base font-semibold">{{ cameraName }}</span>
            <i-fluent:video-off-32-filled v-if="isDisabled" v-tooltip.top="{ value: $t('views.camera.camera_disabled') }" class="w-4 h-4 text-red-400" />
            <i-solar:moon-sleep-bold v-else-if="isSnoozed" v-tooltip.top="{ value: $t('views.camera.camera_snoozed') }" class="w-4 h-4 text-amber-400" />
          </div>

          <div class="ml-auto"></div>

          <template v-if="!isDisabled">
            <Button
              v-if="toolbarShareButton && hasPermission(undefined, 'admin')"
              v-tooltip.top="{ value: $t('components.player.share_camera') }"
              fluid
              text
              severity="contrast"
              class="cui-icon-lg not-hover:text-surface-400"
              @click="openShareDialog()"
            >
              <template #icon>
                <i-tabler:share width="100%" height="100%" />
              </template>
            </Button>

            <Button
              v-if="toolbarPipToggleButton"
              v-tooltip.top="{ value: $t('components.player.toggle_pip') }"
              fluid
              text
              severity="contrast"
              class="cui-icon-lg not-hover:text-surface-400 flipped-h"
              :class="{ active: toolbarPipToggleActive }"
              @click="emit('togglePip')"
            >
              <template #icon>
                <i-mdi:picture-in-picture-bottom-right width="100%" height="100%" />
              </template>
            </Button>

            <Button
              v-if="toolbarSnapshotButton"
              v-tooltip.top="{ value: $t('components.player.capture_snapshot') }"
              fluid
              text
              severity="contrast"
              class="cui-icon-lg not-hover:text-surface-400"
              @click="captureScreenshot"
            >
              <template #icon>
                <i-solar:camera-square-linear width="100%" height="100%" />
              </template>
            </Button>

            <Button
              v-if="toolbarShortcutsButton"
              v-tooltip.top="{ value: shortcutsEditMode ? $t('components.player.finish_editing') : $t('components.player.shortcuts') }"
              fluid
              text
              :severity="shortcutsEditMode ? 'danger' : 'contrast'"
              class="cui-icon-lg"
              :class="{ 'not-hover:text-surface-400': !shortcutsEditMode, active: shortcutsVisible && !shortcutsEditMode }"
              @click="shortcutsEditMode ? exitShortcutsEditMode() : toggleShortcuts()"
            >
              <template #icon>
                <i-lucide:check v-if="shortcutsEditMode" width="100%" height="100%" />
                <i-lucide:layout-grid v-else-if="!shortcutsVisible" width="100%" height="100%" />
                <i-lucide:layout-grid v-else width="100%" height="100%" />
              </template>
            </Button>
          </template>

          <Button
            v-if="toolbarTimelineButton"
            v-tooltip.top="{ value: timelineState ? $t('components.player.hide_timeline') : $t('components.player.show_timeline') }"
            :disabled="showPtz"
            fluid
            text
            severity="contrast"
            class="cui-icon-lg not-hover:text-surface-400"
            :class="{ active: timelineState }"
            @click="toggleTimeline"
          >
            <template #icon>
              <i-mingcute:timeline-line v-if="!timelineState" width="100%" height="100%" />
              <i-mingcute:timeline-fill v-else width="100%" height="100%" />
            </template>
          </Button>

          <Button
            v-if="!isDisabled"
            v-tooltip.top="{ value: $t('components.player.options') }"
            fluid
            text
            severity="contrast"
            class="cui-icon-lg"
            :class="streamMenuActive ? '!text-primary' : 'not-hover:text-surface-400'"
            @click="streamMenuRef?.toggleMenu"
          >
            <template #icon>
              <i-lucide:more-vertical width="100%" height="100%" />
            </template>
          </Button>

          <Button
            v-if="toolbarSettingsButton && hasPermission(undefined, 'admin')"
            v-tooltip.top="{ value: $t('components.player.settings') }"
            fluid
            text
            severity="contrast"
            class="cui-icon-lg not-hover:text-surface-400"
            :class="{ active: drawer.isOpen.value }"
            @click="drawer.open({ cameraName })"
          >
            <template #icon>
              <i-mdi:cog-outline v-if="!drawer.isOpen.value" width="100%" height="100%" />
              <i-mdi:cog v-else width="100%" height="100%" />
            </template>
          </Button>
        </div>
      </template>
    </Card>

    <CuiMenu
      ref="streamMenuRef"
      :items="streamMenuItems"
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
import {
  useCameraStream,
  useClassifierSensors,
  useFaceSensor,
  useLicensePlateSensor,
  useMotionSensor,
  useObjectSensor,
  useTopmostFullscreenElement,
} from '@camera.ui/browser';
import { mergeWith } from '@camera.ui/common/utils';
import { NvrPlaybackKey, NvrPlaybackMapKey } from '@camera.ui/nvr';
import VueZoomable from 'vue-zoomable';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { startIntercomService, stopIntercomService } from '@/common/intercomService.js';
import { randomLetter } from '@/common/utils.js';
import ShareForm from '@/components/CuiDialog/templates/ShareForm/ShareForm.vue';
import { GridSearchKey } from '@/components/CuiGridSearch/types.js';
import { CAMERA_CARD_DEFAULTS } from './types.js';

import type CuiBBoxPlayground from '@/components/CuiBBoxPlayground/CuiBBoxPlayground.vue';
import type { ShareFormProps } from '@/components/CuiDialog/templates/ShareForm/types.js';
import type CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type CuiPTZControl from '@/components/CuiPTZControl/CuiPTZControl.vue';
import type { CameraActivityMode, VideoStreamingMode } from '@camera.ui/browser';
import type { NvrPlayback } from '@camera.ui/nvr';
import type { Detection, DetectionLabel, FaceDetection, StreamingRole, TrackedDetection } from '@camera.ui/sdk';
import type { PassThrough } from '@primevue/core';
import type { DBCamera } from '@shared/types';
import type { CardPassThroughOptions, Popover } from 'primevue';
import type { WatchHandle } from 'vue';
import type { ZoomableEvent } from 'vue-zoomable';
import type { CuiCameraCardEmits, CuiCameraCardModels, CuiCameraCardProps } from './types.js';

const camerasQuery = new CamerasQuery();

const props = withDefaults(defineProps<CuiCameraCardProps>(), CAMERA_CARD_DEFAULTS);

const emit = defineEmits<CuiCameraCardEmits>();

const activityMode = defineModel<CuiCameraCardModels['activityMode']>('activityMode', { default: 'always-on' });
const sourceRole = defineModel<CuiCameraCardModels['sourceRole']>('sourceRole');
const streamingMode = defineModel<CuiCameraCardModels['streamingMode']>('streamingMode');

const log = useLogger();
const router = useRouter();
const drawer = useCuiCameraDrawer();
const dialog = useCuiDialog();
const { mdBreakpoint } = useSharedCuiBreakpoint();
const { isPipSupported } = useSharedCuiUserAgent();
const { height: windowHeight } = useSharedWindowSize();
const { t } = useI18n();
const { pressed: isMousePressed } = useMousePressed();

const {
  cameraInfo,
  backButton,
  doubleClickZoom,
  expandableCard,
  flatCard,
  resizable,
  cardProps,
  routerLink,
  cardClickAction,
  viewTransition,
  cardBackgroundColor,
  cameraNameOverlay,
  liveIndicatorOverlay,
  detectionIndicatorOverlay,
  boundingBoxOverlay,
  control,
  controlFastForwardButton,
  controlFsButton,
  controlMicrophoneButton,
  controlPipButton,
  controlPlayPauseButton,
  controlRewindButton,
  controlSpeakerButton,
  subcontrol,
  subcontrolActivityModeButton,
  subcontrolPtzButton,
  subcontrolQualityButton,
  subcontrolStreamingModeButton,
  toolbar,
  toolbarClass,
  toolbarDetectionButton,
  toolbarPipToggleButton,
  toolbarPipToggleActive,
  toolbarSettingsButton,
  toolbarShareButton,
  toolbarShortcutsButton,
  toolbarSnapshotButton,
  toolbarStyle,
  toolbarTimelineButton,
  toolbarZoneButton,
  toolbarDescriptionButton,
  eventDescription,
  showShortcuts,
} = toRefs(props);

camerasQuery.toggleQueryActivator('getCameraQuery', false);
const { data: cameraObj, isBusy: cameraLoading } = camerasQuery.getCameraQuery(typeof cameraInfo.value === 'string' ? cameraInfo.value : '');

const DETECTION_INDICATOR_TIMEOUT = 2000;
const DOUBLE_TAP_DELAY = 300;
const DOUBLE_TAP_DISTANCE = 50;
const UNIFIED_MAX_ZOOM = 5;
const PLAYER_TINY_BREAKPOINT = 200;
const PLAYER_FULL_BREAKPOINT = 350;

const randomId = randomLetter();
const speedOptions = [0.25, 0.5, 1, 2, 4, 8];

// Stateless AI-description toggle: independent of whether an event is under the
// playhead. When on, the overlay shows whenever `eventDescription` is set.
const showDescription = ref(false);

const streamMenuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('streamMenuRef');
const detectionCanvasRef = useTemplateRef<InstanceType<typeof CuiBBoxPlayground>>('detectionCanvasRef');
const ptzRef = useTemplateRef<InstanceType<typeof CuiPTZControl>>('ptzRef');
const playerContainerRef = useTemplateRef('playerContainerRef');
const arBoxRef = useTemplateRef<HTMLElement>('arBoxRef');
const speedPopoverRef = useTemplateRef<InstanceType<typeof Popover>>('speedPopoverRef');
const morePopoverRef = useTemplateRef<InstanceType<typeof Popover>>('morePopoverRef');

// Always inject regardless of nvrController prop — prop may change at runtime (e.g. PiP swap).
const nvrMap = inject(NvrPlaybackMapKey, undefined);
const nvrDirect = inject(NvrPlaybackKey, undefined);
const gridSearch = inject(GridSearchKey, undefined);

const isHovered = useElementHover(playerContainerRef, { delayLeave: 1000 });
const isHoveredZoom = useElementHover(playerContainerRef, { delayLeave: 0 });
const playerContainer = useElementSize(playerContainerRef);
const arBoxSize = useElementSize(arBoxRef);

const cameraIsInRouter = ref(false);
const userMediaStream = shallowRef<MediaStream>();
const isAdapting = ref(false);
const panValue = ref({ x: 0, y: 0 });
const zoomValue = ref(1);
const lastZoom = ref(1);
const isConstraining = ref(false);
const isZoomingIn = ref(false);
const internalExpanded = ref(false);
const isResizing = ref(false);
const resizeStartY = ref(0);
const resizeStartZoom = ref(1);
const isPanning = ref(false);
const hasPanMoved = ref(false);
const panStartPos = ref({ x: 0, y: 0 });
const panStartValue = ref({ x: 0, y: 0 });
const isPinching = ref(false);
const pinchStartDistance = ref(0);
const pinchStartZoom = ref(1);
const pinchStartPan = ref({ x: 0, y: 0 });
const pinchCenter = ref({ x: 0, y: 0 });
const lastTapTime = ref(0);
const lastTapPos = ref({ x: 0, y: 0 });
const shortcutsVisible = ref(false);
const shortcutsEditMode = ref(false);
const ptzState = ref(false);
const timelineState = ref(false);
const heatmapEnabled = ref(false);
const zoneState = ref(false);
const trimMode = ref(false);
const hasActiveDetection = ref(false);
const initialHover = ref(true);
const muted = ref(true);
const micActive = ref(false);
const timelineScrolling = ref(false);
const bboxEnabled = ref(false);
const controlBarPopoverOpen = ref(false);
const morePopoverOpen = ref(false);

let isUserChangingResolution = false;
let classifierWatchers: WatchHandle[] = [];
let isUnmounting = false;

const cameraName = computed(() => (typeof cameraInfo.value === 'string' ? cameraInfo.value : cameraInfo.value.name));
const camera = computed<DBCamera | undefined>(() => (typeof cameraInfo.value === 'string' ? cameraObj.value : cameraInfo.value));

// In multi-camera mode (CamView), NvrPlaybackMapKey provides per-camera controllers.
// In single-camera mode (Camera.vue), NvrPlaybackKey provides the controller directly.
const nvr = computed<NvrPlayback | undefined>(() => {
  if (props.nvrController) return props.nvrController as NvrPlayback;
  // Isolated cards (shortcuts, PiP) must NOT inherit the parent's NVR controller —
  // they would bind their container to the parent, stealing its canvas.
  if (props.isolatedStream) return undefined;
  if (nvrMap) {
    const cam = camera.value;
    const ctrl = cam ? nvrMap.value.get(cam._id) : undefined;
    if (ctrl) return ctrl;
  }
  return nvrDirect;
});
const nvrMode = computed(() => nvr.value?.mode.value ?? 'idle');
const nvrCurrentTimestamp = computed(() => nvr.value?.currentTimestamp.value ?? 0);
const nvrPlaybackVisible = computed(() => nvrMode.value !== 'idle');
const nvrLicenseRequired = computed(() => nvrPlaybackVisible.value && (nvr.value?.licenseRequired.value ?? false));
const nvrNoData = computed(() => nvrPlaybackVisible.value && !nvrLicenseRequired.value && (nvr.value?.noData.value ?? false));
const nvrLoading = computed(() => nvrPlaybackVisible.value && (nvr.value?.loading.value ?? false));

const selectedStreamingMode = computed<VideoStreamingMode>(() => streamingMode.value ?? camera.value?.interfaceSettings.streamingMode ?? 'webrtc');
const selectedSourceRole = computed<StreamingRole>(() => sourceRole.value ?? camera.value?.interfaceSettings.streamingSource ?? 'high-resolution');

const cameraAspectRatio = computed(() => {
  return camera.value?.interfaceSettings.aspectRatio.replace(':', '/') ?? '16/9';
});

const { camera: cameraDevice, isLoading: cameraDeviceLoading } = useCameraById(cameraName);

const topmostFullscreen = useTopmostFullscreenElement();

const cameraStream = useCameraStream({
  camera: cameraName,
  mode: selectedStreamingMode,
  resolution: selectedSourceRole,
  activityMode: () => activityMode.value ?? 'always-on',
  activityConfig: {
    standbyTimeout: 5000,
    activityTimeout: 5000,
  },
  autoStart: () => nvrMode.value === 'idle' && !camera.value?.disabled,
  isolated: props.isolatedStream,
});

const {
  status: streamStatus,
  isPlaying: streamFinishedLoading,
  hasAudio: streamHasAudio,
  hasBackchannel: streamHasBackchannel,
  activeMode,
  activeResolution,
  isReconnecting: reconnecting,
  inStandby,
} = cameraStream;

const { start: startDetectionIndicatorTimeout } = useTimeoutFn(
  () => {
    hasActiveDetection.value = false;
  },
  DETECTION_INDICATOR_TIMEOUT,
  { immediate: false },
);

const needsDetections = computed(() => !nvrPlaybackVisible.value && ((boundingBoxOverlay.value && bboxEnabled.value) || detectionIndicatorOverlay.value));
const gatedCameraDevice = computed(() => (needsDetections.value ? cameraDevice.value : undefined));

const { sensor: motionSensor } = useMotionSensor(gatedCameraDevice);
const { sensor: objectSensor } = useObjectSensor(gatedCameraDevice);
const { sensor: faceSensor } = useFaceSensor(gatedCameraDevice);
const { sensor: licensePlateSensor } = useLicensePlateSensor(gatedCameraDevice);
const { sensors: classifierSensors } = useClassifierSensors(gatedCameraDevice);

const arStyle = computed(() => {
  return {
    height: cameraStream.isFullscreen.value || zoomValue.value > 1 ? 'auto' : '100%',
    aspectRatio: cameraAspectRatio.value,
  };
});

const playing = computed(() => !cameraStream.paused.value);
const isPip = computed(() => cameraStream.isPip.value);

const hasPtz = computed(() => (cameraDevice.value?.hasPtz.value ?? false) && hasPermission(undefined, 'admin'));
const hasMotionDetector = computed(() => cameraDevice.value?.hasMotionSensor.value ?? false);
const hasObjectDetector = computed(() => cameraDevice.value?.hasObjectSensor.value ?? false);

const cameraZones = computed(() => cameraDevice.value?.camera.value?.detectionZones ?? []);
const cameraLines = computed(() => cameraDevice.value?.camera.value?.detectionLines ?? []);

const isExpanded = computed(() => props.expanded ?? internalExpanded.value);
const bboxClasses = computed<DetectionLabel[]>(() => (bboxEnabled.value ? [] : ['__none__' as DetectionLabel]));
const gridSearchActive = computed(() => !!gridSearch?.active.value);

const infoText = computed<string | undefined>(() => undefined);
const hovered = computed(() => (isHovered.value || initialHover.value) && control.value && !shortcutsEditMode.value);
const isDisabled = computed(() => camera.value?.disabled === true);
const isSnoozed = computed(() => camera.value?.detectionSettings?.snooze === true);
const isLoading = computed(() => {
  if (isDisabled.value) return false;
  if (nvrPlaybackVisible.value) return nvrLoading.value;
  return cameraDeviceLoading.value || cameraLoading.value || !streamFinishedLoading.value || reconnecting.value;
});
const showCenterSpinner = computed(() => {
  if (isDisabled.value) return false;
  return nvrPlaybackVisible.value ? nvrLoading.value : isLoading.value;
});
const streamHasSound = computed(() => {
  if (nvrPlaybackVisible.value) return nvr.value?.hasAudio.value ?? false;
  return streamHasAudio.value && streamStatus.value !== 'error';
});
const streamHasIntercom = computed(() => Boolean(navigator.mediaDevices) && streamHasBackchannel.value);
const micButtonDisabled = computed(() => !streamHasIntercom.value || isLoading.value || nvrPlaybackVisible.value);
const streamIsLoading = computed(() => {
  if (nvrPlaybackVisible.value) return nvrLoading.value || timelineScrolling.value;
  if (isDisabled.value) return false;
  return !streamFinishedLoading.value || timelineScrolling.value;
});
const showCameraName = computed(() => cameraNameOverlay.value && hovered.value && !mdBreakpoint.value && isFullPlayer.value && !gridSearchActive.value);
const showControl = computed(
  () =>
    control.value &&
    (hovered.value || controlBarPopoverOpen.value || morePopoverOpen.value) &&
    !inStandby.value &&
    !isDisabled.value &&
    playerContainer.width.value >= 150 &&
    !gridSearchActive.value,
);
const showPlayPauseIcon = computed(() => {
  if (nvrMode.value === 'play') return true;
  if (nvrMode.value !== 'idle') return false;
  return playing.value;
});
const showPtz = computed(() => ptzState.value && isFullPlayer.value && hasPtz.value);
const showDetectionIndicator = computed(() => detectionIndicatorOverlay.value && hasActiveDetection.value);

const arParsed = computed(() => {
  const ratio = cameraAspectRatio.value.split('/');
  return { w: parseFloat(ratio[0]) || 16, h: parseFloat(ratio[1]) || 9 };
});

const baseVideoHeight = computed(() => {
  const width = resizable.value ? playerContainer.width.value || 0 : playerContainer.width.value || 0;
  if (!width) return 0;
  const natural = width * (arParsed.value.h / arParsed.value.w);
  if (resizable.value) return Math.min(natural, windowHeight.value * 0.5);
  return natural;
});
const maxContainerHeight = computed(() => windowHeight.value * 0.6);

const effectiveMaxZoom = computed(() => {
  if (!resizable.value) return UNIFIED_MAX_ZOOM;
  const parentWidth = playerContainer.width.value || 0;
  if (!parentWidth) return UNIFIED_MAX_ZOOM;
  const baseHeight = Math.min(parentWidth * (arParsed.value.h / arParsed.value.w), windowHeight.value * 0.5);
  if (!baseHeight) return UNIFIED_MAX_ZOOM;
  return Math.max(1, Math.min(UNIFIED_MAX_ZOOM, maxContainerHeight.value / baseHeight));
});

const resizableContainerHeight = computed(() => {
  if (!resizable.value) return 0;
  const parentWidth = playerContainer.width.value || 0;
  if (!parentWidth) return 0;
  const baseHeight = Math.min(parentWidth * (arParsed.value.h / arParsed.value.w), windowHeight.value * 0.5);
  const zoomed = baseHeight * zoomValue.value;
  return Math.min(zoomed, maxContainerHeight.value);
});

const videoContainerStyle = computed(() => {
  if (cameraStream.isFullscreen.value || !resizable.value) return {};
  const height = resizableContainerHeight.value;
  if (!height) return {};
  return { height: `${height}px` };
});

const videoContentSize = computed(() => ({
  width: arBoxSize.width.value || 0,
  height: arBoxSize.height.value || 0,
}));

const zoomMinimapStyle = computed(() => {
  const zoom = zoomValue.value;
  if (zoom <= 1) return null;

  const pan = panValue.value;
  const containerWidth = playerContainer.width.value;
  const containerHeight = playerContainer.height.value;
  if (!containerWidth || !containerHeight) return null;

  // Minimap uses video content dimensions (matches pan limits from getMaxPan).
  const { width: videoWidth, height: videoHeight } = videoContentSize.value;
  if (!videoWidth || !videoHeight) return null;

  const scaledVideoWidth = videoWidth * zoom;
  const scaledVideoHeight = videoHeight * zoom;

  const canPanX = scaledVideoWidth > containerWidth;
  const canPanY = scaledVideoHeight > containerHeight;

  const widthPct = canPanX ? (containerWidth / scaledVideoWidth) * 100 : 100;
  const heightPct = canPanY ? (containerHeight / scaledVideoHeight) * 100 : 100;

  const leftPct = canPanX ? ((1 - containerWidth / scaledVideoWidth) / 2) * 100 - (pan.x / scaledVideoWidth) * 100 : 0;
  const topPct = canPanY ? ((1 - containerHeight / scaledVideoHeight) / 2) * 100 - (pan.y / scaledVideoHeight) * 100 : 0;

  return {
    width: `${widthPct}%`,
    height: `${heightPct}%`,
    left: `${leftPct}%`,
    top: `${topPct}%`,
  };
});

const videoWrapperStyle = computed(() => {
  if (!resizable.value)
    return {
      aspectRatio: cameraAspectRatio.value,
    };
  const zoom = zoomValue.value;
  const pan = panValue.value;
  if (zoom <= 1)
    return {
      aspectRatio: cameraAspectRatio.value,
    };
  return {
    aspectRatio: cameraAspectRatio.value,
    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
    transformOrigin: 'center center',
    willChange: 'transform',
  };
});

const streamMenuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [];

  if (toolbarDescriptionButton.value) {
    items.push({
      key: 'ai-descriptions',
      label: t('components.player.ai_descriptions'),
      toggle: true,
      toggleState: showDescription.value,
      onClick: () => {
        showDescription.value = !showDescription.value;
      },
    });
  }

  if (toolbarDetectionButton.value && (hasMotionDetector.value || hasObjectDetector.value)) {
    items.push({
      key: 'detections',
      label: t('components.player.detections'),
      toggle: true,
      toggleState: bboxEnabled.value,
      disabled: nvrPlaybackVisible.value,
      onClick: () => toggleBbox(),
    });
  }

  if (toolbarZoneButton.value) {
    items.push({ key: 'zones', label: t('components.player.zones'), toggle: true, toggleState: zoneState.value, onClick: () => toggleZones() });
  }

  items.push({
    key: 'edit-shortcuts',
    label: t('components.player.edit_shortcuts'),
    toggle: true,
    toggleState: shortcutsEditMode.value,
    onClick: () => {
      if (!shortcutsEditMode.value) {
        shortcutsVisible.value = true;
        shortcutsEditMode.value = true;
      } else {
        exitShortcutsEditMode();
      }
    },
  });

  if (timelineState.value || !toolbarTimelineButton.value) {
    items.push({
      key: 'export',
      label: t('components.player.export'),
      toggle: true,
      toggleState: trimMode.value,
      onClick: () => {
        trimMode.value = !trimMode.value;
      },
    });
  }

  items.push({
    key: 'heatmap',
    label: t('components.player.heatmap'),
    toggle: true,
    toggleState: heatmapEnabled.value,
    onClick: () => {
      heatmapEnabled.value = !heatmapEnabled.value;
    },
  });

  return items;
});

const streamMenuActive = computed(() => streamMenuItems.value.some((item) => item.toggle && item.toggleState));

const cardPt = computed<PassThrough<CardPassThroughOptions>>(() => {
  const basePt: PassThrough<CardPassThroughOptions> = {
    body: { class: 'w-full h-full p-0 overflow-hidden justify-center', style: { backgroundColor: cardBackgroundColor.value } },
    root: { class: {} },
    content: { class: 'flex flex-col justify-center' },
  };

  if (flatCard.value) {
    (basePt as any).root.class = { ...(basePt as any).root.class, '!rounded-none !border-0': true };
  }

  return mergeWith(basePt, cardProps.value?.pt);
});

const isTinyPlayer = computed(() => playerContainer.width.value < PLAYER_TINY_BREAKPOINT);
const isFullPlayer = computed(() => playerContainer.width.value >= PLAYER_FULL_BREAKPOINT);
const tapsForRedirect = computed(() => cardClickAction.value === 'redirect' && routerLink.value !== undefined);
const tapsForExpand = computed(() => cardClickAction.value === 'expand' && expandableCard.value);
const cardIsTappable = computed(() => tapsForRedirect.value || tapsForExpand.value);
const showOpenCameraButton = computed(() => cardClickAction.value !== 'redirect' && routerLink.value !== undefined);
const popoverAppendTarget = computed<HTMLElement | 'body'>(() => topmostFullscreen.value ?? 'body');

const controlBarLayout = computed(() => {
  const full = isFullPlayer.value;
  return {
    rewind: { inline: full, inMenu: !full },
    fastForward: { inline: full, inMenu: !full },
    speed: { inline: full, inMenu: !full },
    speaker: { inline: full, inMenu: !full },
    expand: { inline: full, inMenu: !full },
    microphone: { inline: full, inMenu: !full },
    pip: { inline: false, inMenu: true },
    quality: { inline: false, inMenu: true },
    streamingMode: { inline: false, inMenu: true },
    activityMode: { inline: false, inMenu: true },
    ptz: { inline: false, inMenu: true },
  };
});

const hasMoreMenuItems = computed(() => {
  const l = controlBarLayout.value;
  return (
    (l.rewind.inMenu && controlRewindButton.value) ||
    (l.fastForward.inMenu && controlFastForwardButton.value) ||
    l.speed.inMenu ||
    (l.speaker.inMenu && controlSpeakerButton.value) ||
    (l.expand.inMenu && expandableCard.value && !tapsForExpand.value) ||
    (l.microphone.inMenu && controlMicrophoneButton.value) ||
    (l.pip.inMenu && controlPipButton.value) ||
    (l.quality.inMenu && subcontrol.value && subcontrolQualityButton.value) ||
    (l.streamingMode.inMenu && subcontrol.value && subcontrolStreamingModeButton.value) ||
    (l.activityMode.inMenu && subcontrol.value && subcontrolActivityModeButton.value) ||
    (l.ptz.inMenu && subcontrol.value && subcontrolPtzButton.value && hasPtz.value)
  );
});

// Quality Button reflects the user's choice (not the adaptive-resolved live value).
const displayResolution = computed(() => selectedSourceRole.value);

function onCardClick() {
  if (tapsForRedirect.value) {
    router.push(routerLink.value!);
  } else if (tapsForExpand.value) {
    toggleExpand();
  }
}

function toggleFullscreen() {
  cameraStream.toggleFullscreen();
}

function goBack() {
  const back = router.options.history.state.back;
  if (typeof back === 'string' && back.startsWith('/camview')) {
    router.back();
  } else {
    router.push('/home');
  }
}

function getCurrentActivityMode() {
  if (activityMode.value === 'always-on') return t('components.player.activity_mode_always_on');
  if (activityMode.value === 'standby') return t('components.player.activity_mode_standby');
  return t('components.player.activity_mode_activity');
}

function getCurrentStreamingMode() {
  if (activeMode.value === 'mse') return t('components.player.streaming_mode_mse');
  if (activeMode.value === 'webrtc' || activeMode.value === 'webrtc/tcp') return t('components.player.streaming_mode_webrtc');
  if (activeMode.value === 'webcodecs') return t('components.player.streaming_mode_webcodecs');
  return t('components.player.streaming_mode_unknown');
}

function getCurrentResolution() {
  if (displayResolution.value === 'high-resolution') return t('components.player.source_role_high');
  if (displayResolution.value === 'mid-resolution') return t('components.player.source_role_mid');
  if (displayResolution.value === 'low-resolution') return t('components.player.source_role_low');
  return t('components.player.source_role_unknown');
}

function getMaxPan(zoom: number) {
  if (!playerContainerRef.value || zoom <= 1) return { x: 0, y: 0 };

  const containerRect = playerContainerRef.value.getBoundingClientRect();
  const { width: videoWidth, height: videoHeight } = videoContentSize.value;

  // Pan limits based on video content size, not container size.
  // This prevents panning into the black letterbox areas.
  const scaledVideoWidth = videoWidth * zoom;
  const scaledVideoHeight = videoHeight * zoom;
  const maxPanX = Math.max(0, (scaledVideoWidth - containerRect.width) / 2);
  const maxPanY = Math.max(0, (scaledVideoHeight - containerRect.height) / 2);

  return { x: maxPanX, y: maxPanY };
}

function constrainPan(pan: { x: number; y: number }, zoom: number) {
  const maxPan = getMaxPan(zoom);
  return {
    x: Math.max(-maxPan.x, Math.min(maxPan.x, pan.x)),
    y: Math.max(-maxPan.y, Math.min(maxPan.y, pan.y)),
  };
}

function constrainPanValues(pan: { x: number; y: number }, zoom: number) {
  const maxPan = getMaxPan(zoom);
  return {
    x: Math.max(-maxPan.x, Math.min(maxPan.x, pan.x)),
    y: Math.max(-maxPan.y, Math.min(maxPan.y, pan.y)),
  };
}

function onZoomPan(event: ZoomableEvent) {
  if (!playerContainerRef.value || isConstraining.value) return;

  const maxZoom = effectiveMaxZoom.value;
  // Snap to 1 when very close — prevents zoom getting stuck at e.g. 1.0001
  let clampedZoom = Math.max(1, Math.min(event.zoom, maxZoom));
  if (clampedZoom < 1.02) clampedZoom = 1;
  const currentPan = { x: event.pan.x, y: event.pan.y };
  const previousZoom = lastZoom.value;

  // Zoom was clamped — force sync back to VueZoomable to stop feedback loop
  const wasClamped = Math.abs(event.zoom - clampedZoom) > 0.001;

  if (clampedZoom <= 1) {
    lastZoom.value = 1;
    if (panValue.value.x !== 0 || panValue.value.y !== 0 || zoomValue.value !== 1) {
      isConstraining.value = true;
      panValue.value = { x: 0, y: 0 };
      zoomValue.value = 1;
      requestAnimationFrame(() => setTimeout(() => (isConstraining.value = false), 150));
    }
    return;
  }

  const isZoomingOut = clampedZoom < previousZoom;
  if (isZoomingOut && previousZoom > 1) {
    const scale = (clampedZoom - 1) / (previousZoom - 1);
    currentPan.x = panValue.value.x * scale;
    currentPan.y = panValue.value.y * scale;
  }

  lastZoom.value = clampedZoom;

  // Always constrain pan to video content bounds — prevents "rubber band" effect
  const constrained = constrainPan(currentPan, clampedZoom);

  if (wasClamped) {
    isConstraining.value = true;
    zoomValue.value = clampedZoom;
    panValue.value = constrained;
    requestAnimationFrame(() => setTimeout(() => (isConstraining.value = false), 100));
  } else {
    panValue.value = constrained;
  }
}

function toggleExpand() {
  if (!expandableCard.value) return;
  const next = !isExpanded.value;
  if (props.expanded === undefined) internalExpanded.value = next;
  emit('expand', next);
}

function onResizeStart(e: MouseEvent) {
  if (!resizable.value) return;
  isResizing.value = true;
  resizeStartY.value = e.clientY;
  resizeStartZoom.value = zoomValue.value;
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
}

function onResizeTouchStart(e: TouchEvent) {
  if (!resizable.value) return;
  isResizing.value = true;
  resizeStartY.value = e.touches[0].clientY;
  resizeStartZoom.value = zoomValue.value;
  document.addEventListener('touchmove', onResizeTouchMove, { passive: false });
  document.addEventListener('touchend', onResizeTouchEnd);
}

function deltaToZoom(delta: number) {
  const baseHeight = baseVideoHeight.value;
  if (!baseHeight) return resizeStartZoom.value;
  const zoomDelta = delta / baseHeight;
  return Math.max(1, Math.min(effectiveMaxZoom.value, resizeStartZoom.value + zoomDelta));
}

function onResizeMove(e: MouseEvent) {
  if (!isResizing.value) return;
  const delta = e.clientY - resizeStartY.value;
  const newZoom = deltaToZoom(delta);
  zoomValue.value = newZoom;
  lastZoom.value = newZoom;
}

function onResizeTouchMove(e: TouchEvent) {
  if (!isResizing.value) return;
  e.preventDefault();
  const delta = e.touches[0].clientY - resizeStartY.value;
  const newZoom = deltaToZoom(delta);
  zoomValue.value = newZoom;
  lastZoom.value = newZoom;
}

function onResizeEnd() {
  isResizing.value = false;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
}

function onResizeTouchEnd() {
  isResizing.value = false;
  document.removeEventListener('touchmove', onResizeTouchMove);
  document.removeEventListener('touchend', onResizeTouchEnd);
}

function getTouchDistance(touches: TouchList) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(touches: TouchList) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

function onContentTouchStart(e: TouchEvent) {
  if (!resizable.value) return;
  hasPanMoved.value = false;

  if (e.touches.length === 2) {
    isPanning.value = false;
    isPinching.value = true;
    pinchStartDistance.value = getTouchDistance(e.touches);
    pinchStartZoom.value = zoomValue.value;
    pinchStartPan.value = { ...panValue.value };
    pinchCenter.value = getTouchCenter(e.touches);
    return;
  }

  if (e.touches.length === 1 && zoomValue.value > 1) {
    isPanning.value = true;
    panStartPos.value = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    panStartValue.value = { ...panValue.value };
  }
}

function onContentTouchMove(e: TouchEvent) {
  if (!resizable.value) return;

  if (isPinching.value && e.touches.length === 2) {
    e.preventDefault();
    const currentDistance = getTouchDistance(e.touches);
    const scale = currentDistance / pinchStartDistance.value;
    const newZoom = Math.max(1, Math.min(effectiveMaxZoom.value, pinchStartZoom.value * scale));

    if (newZoom > zoomValue.value) isZoomingIn.value = true;

    if (playerContainerRef.value) {
      const containerRect = playerContainerRef.value.getBoundingClientRect();
      const center = getTouchCenter(e.touches);
      const containerCenterX = containerRect.left + containerRect.width / 2;
      const containerCenterY = containerRect.top + containerRect.height / 2;
      const offsetX = center.x - containerCenterX;
      const offsetY = center.y - containerCenterY;
      const zoomRatio = newZoom / pinchStartZoom.value;
      const newPan = {
        x: pinchStartPan.value.x - offsetX * (zoomRatio - 1),
        y: pinchStartPan.value.y - offsetY * (zoomRatio - 1),
      };

      zoomValue.value = newZoom;
      lastZoom.value = newZoom;
      panValue.value = constrainPanValues(newPan, newZoom);
    } else {
      zoomValue.value = newZoom;
      lastZoom.value = newZoom;
    }
    return;
  }

  if (isPanning.value && e.touches.length === 1) {
    const deltaX = e.touches[0].clientX - panStartPos.value.x;
    const deltaY = e.touches[0].clientY - panStartPos.value.y;
    const moveThreshold = 10;
    if (Math.abs(deltaX) > moveThreshold || Math.abs(deltaY) > moveThreshold) {
      hasPanMoved.value = true;
    }
    const newPan = { x: panStartValue.value.x + deltaX, y: panStartValue.value.y + deltaY };
    panValue.value = constrainPanValues(newPan, zoomValue.value);
  }
}

function onContentTouchEnd(e: TouchEvent) {
  if (e.touches.length === 1 && isPinching.value) {
    isPinching.value = false;
    isZoomingIn.value = false;
    if (zoomValue.value > 1) {
      isPanning.value = true;
      hasPanMoved.value = false;
      panStartPos.value = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartValue.value = { ...panValue.value };
    }
    return;
  }

  if (e.touches.length === 0 && e.changedTouches.length === 1 && !hasPanMoved.value && !isPinching.value) {
    const touch = e.changedTouches[0];
    const now = Date.now();
    const tapPos = { x: touch.clientX, y: touch.clientY };
    const timeDiff = now - lastTapTime.value;
    const distDiff = Math.sqrt(Math.pow(tapPos.x - lastTapPos.value.x, 2) + Math.pow(tapPos.y - lastTapPos.value.y, 2));

    if (timeDiff < DOUBLE_TAP_DELAY && distDiff < DOUBLE_TAP_DISTANCE) {
      const syntheticEvent = { clientX: tapPos.x, clientY: tapPos.y, preventDefault: () => {}, stopPropagation: () => {} } as MouseEvent;
      onDoubleClickZoom(syntheticEvent);
      lastTapTime.value = 0;
      lastTapPos.value = { x: 0, y: 0 };
    } else {
      lastTapTime.value = now;
      lastTapPos.value = tapPos;
    }
  }

  isPanning.value = false;
  hasPanMoved.value = false;
  isPinching.value = false;
  isZoomingIn.value = false;
}

function onContentMouseDown(e: MouseEvent) {
  if (!resizable.value || zoomValue.value <= 1) return;

  document.removeEventListener('mousemove', onContentMouseMove);
  document.removeEventListener('mouseup', onContentMouseUp);

  isPanning.value = true;
  panStartPos.value = { x: e.clientX, y: e.clientY };
  panStartValue.value = { ...panValue.value };

  document.addEventListener('mousemove', onContentMouseMove);
  document.addEventListener('mouseup', onContentMouseUp);
}

function onContentMouseMove(e: MouseEvent) {
  if (!isPanning.value) return;
  const deltaX = e.clientX - panStartPos.value.x;
  const deltaY = e.clientY - panStartPos.value.y;
  const newPan = { x: panStartValue.value.x + deltaX, y: panStartValue.value.y + deltaY };
  panValue.value = constrainPanValues(newPan, zoomValue.value);
}

function onContentMouseUp() {
  isPanning.value = false;
  document.removeEventListener('mousemove', onContentMouseMove);
  document.removeEventListener('mouseup', onContentMouseUp);
}

function onContentWheel(e: WheelEvent) {
  if (!resizable.value) return;
  e.preventDefault();
  const zoomDelta = -e.deltaY * 0.002;
  let newZoom = Math.max(1, Math.min(effectiveMaxZoom.value, zoomValue.value + zoomDelta));
  if (newZoom < 1.02) newZoom = 1;
  if (newZoom === zoomValue.value) return;

  const oldZoom = zoomValue.value;
  if (newZoom <= 1) {
    zoomValue.value = 1;
    panValue.value = { x: 0, y: 0 };
  } else if (newZoom < oldZoom && oldZoom > 1) {
    // Proportionally shrink pan when zooming out — prevents stale offset
    const scale = (newZoom - 1) / (oldZoom - 1);
    const scaledPan = { x: panValue.value.x * scale, y: panValue.value.y * scale };
    zoomValue.value = newZoom;
    panValue.value = constrainPanValues(scaledPan, newZoom);
  } else {
    zoomValue.value = newZoom;
  }
  lastZoom.value = zoomValue.value;
}

function onDoubleClickZoom(event: MouseEvent) {
  if (!doubleClickZoom.value) return;
  if ((!resizable.value && !isHoveredZoom.value) || timelineState.value || showPtz.value || inStandby.value || isDisabled.value) return;

  event.preventDefault();
  event.stopPropagation();
  // Reset constraining first so a fast second double-click can interrupt the previous one
  isConstraining.value = true;

  const isZoomedIn = zoomValue.value > 1.01;

  if (isZoomedIn) {
    zoomValue.value = 1;
    panValue.value = { x: 0, y: 0 };
    lastZoom.value = 1;
  } else {
    if (!playerContainerRef.value) return;

    if (resizable.value) isZoomingIn.value = true;

    const containerRect = playerContainerRef.value.getBoundingClientRect();
    const clickX = event.clientX - containerRect.left;
    const clickY = event.clientY - containerRect.top;
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    const maxZoom = effectiveMaxZoom.value;
    const offsetX = (centerX - clickX) * (maxZoom - 1);
    const offsetY = (centerY - clickY) * (maxZoom - 1);

    zoomValue.value = maxZoom;
    lastZoom.value = maxZoom;

    if (resizable.value) {
      const maxPanX = Math.max(0, (containerRect.width * maxZoom - containerRect.width) / 2);
      const maxPanY = 0;
      panValue.value = {
        x: Math.max(-maxPanX, Math.min(maxPanX, offsetX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, offsetY)),
      };
    } else {
      const maxPan = getMaxPan(maxZoom);
      panValue.value = {
        x: Math.max(-maxPan.x, Math.min(maxPan.x, offsetX)),
        y: Math.max(-maxPan.y, Math.min(maxPan.y, offsetY)),
      };
    }
  }

  setTimeout(() => {
    isConstraining.value = false;
    isZoomingIn.value = false;
  }, 200);
}

function handleActivity(detections: Detection[]) {
  cameraStream.reportActivity(Boolean(detections?.length));
}

function handleDetectionIndicator(detections: Detection[]) {
  if (detections?.length) {
    hasActiveDetection.value = true;
    startDetectionIndicatorTimeout();
  }
}

function resumeStream() {
  if (!isDisabled.value) cameraStream.resumeFromStandby();
}

async function captureScreenshot() {
  const dataURL = cameraStream.captureScreenshot();
  if (!dataURL) return;
  const filename = `${cameraName.value.replace(/ /g, '_').toLowerCase()}_${new Date().toISOString()}.png`;
  await download({ dataUrl: dataURL, filename, mimeType: 'image/png' });
}

function clearCanvas() {
  detectionCanvasRef.value?.clear();
}

function drawCanvas(source: string, detections: Detection[]) {
  if (!streamFinishedLoading.value || nvrPlaybackVisible.value) return;
  detectionCanvasRef.value?.draw(source, detections);
}

function toggleBbox(state?: boolean) {
  bboxEnabled.value = state ?? !bboxEnabled.value;
}

function toggleZones(state?: boolean) {
  zoneState.value = state ?? !zoneState.value;
}

function toggleMute(state?: boolean) {
  muted.value = state !== undefined ? state : !muted.value;
  emit('muteChange', muted.value);
}

async function toggleMicrophone(state?: boolean, enableSpeaker = false) {
  if (!streamHasBackchannel.value) return;

  micActive.value = state !== undefined ? state : !micActive.value;

  if (micActive.value) {
    try {
      userMediaStream.value = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = userMediaStream.value.getAudioTracks()[0];
      muted.value = !enableSpeaker;
      await cameraStream.setMicrophone(track);
      startIntercomService();
    } catch (error: any) {
      log.warn(cameraName.value, error);
      micActive.value = false;
    }
  } else {
    userMediaStream.value?.getTracks().forEach((track) => track.stop());
    userMediaStream.value = undefined;
    await cameraStream.setMicrophone(null);
    stopIntercomService();
  }
}

function toggleActivityMode(state?: CameraActivityMode) {
  activityMode.value = state ? state : activityMode.value === 'always-on' ? 'standby' : activityMode.value === 'standby' ? 'activity' : 'always-on';
}

async function toggleSourceRole(state?: StreamingRole) {
  isUserChangingResolution = true;

  try {
    if (state) {
      sourceRole.value = state;
      await cameraStream.setResolution(state);
      return;
    }

    const availableRoles: StreamingRole[] = [];
    if (cameraDevice.value?.lowResolutionSource.value) availableRoles.push('low-resolution');
    if (cameraDevice.value?.midResolutionSource.value) availableRoles.push('mid-resolution');
    if (cameraDevice.value?.highResolutionSource.value) availableRoles.push('high-resolution');

    if (availableRoles.length === 0) return;

    // Cycle from what's currently *displayed* (live or NVR), not from live-only
    // `activeResolution` — otherwise toggling in the event-dialog would skip
    // steps because live was never active there.
    const currentRole = displayResolution.value;
    const currentIndex = availableRoles.indexOf(currentRole);
    const nextIndex = (currentIndex + 1) % availableRoles.length;
    const nextRole = availableRoles[nextIndex];

    sourceRole.value = nextRole;
    await cameraStream.setResolution(nextRole);
  } finally {
    setTimeout(() => (isUserChangingResolution = false), 2000);
  }
}

async function toggleStreamingMode(state?: VideoStreamingMode) {
  const currentMode = activeMode.value;
  const mode = state ? state : currentMode === 'mse' ? 'webrtc' : 'mse';
  await cameraStream.setMode(mode);
  streamingMode.value = mode;
}

function togglePictureInPicture() {
  cameraStream.togglePip();
}

function togglePlay() {
  if (nvrMode.value !== 'idle') {
    if (nvrMode.value === 'play') {
      nvr.value?.pause();
    } else if (nvrMode.value === 'pause') {
      nvr.value?.resume();
    } else if (nvrMode.value === 'scrub') {
      nvr.value?.play(nvrCurrentTimestamp.value);
    }
    return;
  }

  if (!cameraStream.paused.value) {
    cameraStream.pause();
  } else {
    cameraStream.play();
  }
}

function toggleFs() {
  toggleFullscreen();
}

function toggleShortcuts(visible?: boolean) {
  shortcutsVisible.value = visible !== undefined ? visible : !shortcutsVisible.value;
  if (!shortcutsVisible.value) shortcutsEditMode.value = false;
}

function exitShortcutsEditMode() {
  if (shortcutsEditMode.value) {
    shortcutsVisible.value = true;
    shortcutsEditMode.value = false;
  }
}

function togglePtz() {
  ptzState.value = !ptzState.value;
}

function toggleTimeline() {
  timelineState.value = !timelineState.value;
  if (!timelineState.value) trimMode.value = false;
}

function toggleRewind() {
  if (!nvr.value) return;
  if (nvrMode.value === 'idle') {
    // Live mode: start playback at now - 30s
    const nowUs = Date.now() * 1000;
    nvr.value.play(nowUs - 30_000_000);
    return;
  }
  nvr.value.seek(nvr.value.currentTimestamp.value - 30_000_000);
}

function toggleFastForward() {
  if (!nvr.value || nvrMode.value === 'idle') return;
  nvr.value.seek(nvr.value.currentTimestamp.value + 30_000_000);
}

function timelineScroll(scrolling: boolean) {
  timelineScrolling.value = scrolling;
}

function openSpeedFromMore(event: Event) {
  morePopoverRef.value?.hide();
  nextTick(() => speedPopoverRef.value?.toggle(event));
}

function openShareDialog() {
  const id = cameraDevice.value?.id;
  if (!id) return;

  const sources = (cameraDevice.value?.sources.value ?? []).filter((s) => s.role !== 'snapshot').map((s) => ({ _id: s._id, name: s.name, role: s.role }));

  dialog.openComponentDialog<ShareFormProps>(ShareForm, {
    data: {
      title: t('shares.create_share'),
      confirmText: t('shares.create'),
      contentProps: {
        cameraId: id,
        cameraName: cameraName.value,
        sources,
      },
    },
    dialogSize: {
      desktop: { width: '450px' },
    },
  });
}

watch(
  playerContainerRef,
  (el) => {
    cameraStream.fullscreenElement.value = el ?? undefined;
  },
  { immediate: true },
);

watch(muted, (val) => cameraStream.setMuted(val), { immediate: true });

// Bind the controller's container ref to the shared stream container (reactive — handles controller changes)
watch(
  [nvr, () => cameraStream.containerElement.value],
  ([controller, el], [oldController]) => {
    // Clear old controller's container when switching controllers (e.g. swap in PiP)
    if (oldController && oldController !== controller && oldController.containerRef.value === el) {
      oldController.containerRef.value = null;
    }
    if (controller && el) controller.containerRef.value = el;
  },
  { immediate: true, flush: 'post' },
);

// Sync card muted state → NVR playback (card starts muted=true)
watch(
  [nvr, muted],
  ([controller, val]) => {
    if (controller) controller.muted.value = val;
  },
  { immediate: true },
);

// Stop live stream when NVR playback becomes active, restart when idle.
// stop() closes the WebSocket to go2rtc (no wasted bandwidth during playback).
// The canvas/worker is managed by canvasManager and survives stop() — NVR playback
// reuses it via ensureWorker().
watch(
  nvrPlaybackVisible,
  (active) => {
    if (isUnmounting) return;
    if (active) {
      cameraStream.stop();
    } else {
      cameraStream.start();
    }
  },
  { flush: 'sync' },
);

watch([sourceRole, activeResolution], ([requested, resolved]) => {
  if (isUserChangingResolution) return;
  if (requested && resolved && requested !== resolved) {
    sourceRole.value = resolved;
  }
});

// For NVR playback: update native dimensions from canvas when first frame arrives.
watch(
  [() => nvrPlaybackVisible.value, nvrCurrentTimestamp],
  ([visible]) => {
    if (!visible) return;
    const container = cameraStream.containerElement.value;
    if (!container) return;
    const canvas = container.querySelector('canvas');
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      if (cameraStream.nativeWidth.value !== canvas.width || cameraStream.nativeHeight.value !== canvas.height) {
        cameraStream.nativeWidth.value = canvas.width;
        cameraStream.nativeHeight.value = canvas.height;
      }
    }
  },
  { flush: 'post' },
);

watch(reconnecting, async (state) => {
  if (state) await toggleMicrophone(false, false);
});

watch(micButtonDisabled, async (disabled) => {
  if (disabled && micActive.value) await toggleMicrophone(false, false);
});

watch(streamFinishedLoading, (state) => {
  if (!state) clearCanvas();
  emit('streamFinishedLoading', state);
});

watch(activityMode, (mode) => {
  if (mode) cameraStream.setActivityMode(mode);
});

watch(
  () => motionSensor.value?.properties.detections,
  (detections) => {
    if (cameraObj.value?.detectionZones.length === 0) return;
    const detectionsArray = (detections ?? []) as FaceDetection[];
    handleActivity(detectionsArray);
    handleDetectionIndicator(detectionsArray);
    drawCanvas('motion', detectionsArray);
  },
  { deep: true },
);

watch(
  () => objectSensor.value?.properties.detections,
  (detections) => {
    if (cameraObj.value?.detectionZones.length === 0) return;
    const detectionsArray = (detections ?? []) as TrackedDetection[];
    handleActivity(detectionsArray);
    handleDetectionIndicator(detectionsArray);
    drawCanvas('object', detectionsArray);
  },
  { deep: true },
);

watch(
  () => faceSensor.value?.properties.detections,
  (detections) => {
    drawCanvas('face', (detections ?? []) as FaceDetection[]);
  },
  { deep: true },
);

watch(
  () => licensePlateSensor.value?.properties.detections,
  (detections) => {
    drawCanvas('license_plate', (detections ?? []) as Detection[]);
  },
  { deep: true },
);

watch(classifierSensors, (sensors) => {
  classifierWatchers.forEach((unwatch) => unwatch());
  classifierWatchers = sensors.map((sensor) =>
    watch(
      () => sensor.properties.detections,
      (detections) => {
        drawCanvas('classifier', (detections ?? []) as Detection[]);
      },
      { deep: true },
    ),
  );
});

watch(mdBreakpoint, () => {
  if (mdBreakpoint.value) timelineState.value = false;
});

watch(resizable, () => {
  zoomValue.value = 1;
  panValue.value = { x: 0, y: 0 };
  lastZoom.value = 1;
  isPanning.value = false;
  isResizing.value = false;
  isConstraining.value = false;
  isZoomingIn.value = false;

  document.removeEventListener('mousemove', onContentMouseMove);
  document.removeEventListener('mouseup', onContentMouseUp);
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  document.removeEventListener('touchmove', onResizeTouchMove);
  document.removeEventListener('touchend', onResizeTouchEnd);
});

watch(
  () => [isHoveredZoom.value, timelineState.value, showPtz.value, inStandby.value, isDisabled.value],
  ([hovered, timeline, ptz, standby, disabled]) => {
    if (isPanning.value || isResizing.value || isMousePressed.value) return;
    const shouldDisable = resizable.value ? timeline || ptz || standby || disabled : !hovered || timeline || ptz || standby || disabled;
    if (shouldDisable && (zoomValue.value !== 1 || panValue.value.x !== 0 || panValue.value.y !== 0)) {
      isConstraining.value = true;
      zoomValue.value = 1;
      panValue.value = { x: 0, y: 0 };
      lastZoom.value = 1;
      setTimeout(() => (isConstraining.value = false), 200);
    }
  },
);

watch(zoomValue, (zoom, oldZoom) => {
  if (isConstraining.value) return;
  if (zoom <= 1) {
    panValue.value = { x: 0, y: 0 };
  } else if (zoom < oldZoom) {
    panValue.value = constrainPanValues(panValue.value, zoom);
  }
});

watch(streamStatus, (status) => {
  if (status === 'connecting' || status === 'reconnecting') {
    isAdapting.value = true;
  } else if (status === 'connected') {
    isAdapting.value = false;
  }
});

watch(
  () => cameraStream.error.value,
  (error) => {
    if (error) log.error(cameraName.value, error);
  },
);

watch(isDisabled, (disabled, wasDisabled) => {
  if (wasDisabled && !disabled) {
    cameraStream.stream.value?.restart();
  } else if (!wasDisabled && disabled) {
    cameraStream.stop();
  }
});

useEventListener(window, 'blur', () => {
  if (isPanning.value) {
    isPanning.value = false;
    document.removeEventListener('mousemove', onContentMouseMove);
    document.removeEventListener('mouseup', onContentMouseUp);
  }
  if (isResizing.value) {
    isResizing.value = false;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
    document.removeEventListener('touchmove', onResizeTouchMove);
    document.removeEventListener('touchend', onResizeTouchEnd);
  }
});

onKeyStroke('Escape', () => exitShortcutsEditMode());

onBeforeMount(() => {
  cameraIsInRouter.value = router.currentRoute.value.path.includes(cameraName.value);
  if (typeof cameraInfo.value === 'string') {
    camerasQuery.toggleQueryActivator('getCameraQuery', true);
  }
});

onMounted(() => {
  setTimeout(() => (initialHover.value = false), 1500);
});

onBeforeUnmount(() => {
  isUnmounting = true;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  document.removeEventListener('touchmove', onResizeTouchMove);
  document.removeEventListener('touchend', onResizeTouchEnd);
  document.removeEventListener('mousemove', onContentMouseMove);
  document.removeEventListener('mouseup', onContentMouseUp);

  userMediaStream.value?.getTracks().forEach((track) => track.stop());
  userMediaStream.value = undefined;

  classifierWatchers.forEach((unwatch) => unwatch());
  classifierWatchers = [];
});

defineExpose({
  activeResolution,
  showControl,
  micActive,
  streamHasIntercom,
  micButtonDisabled,
  isFullscreen: cameraStream.isFullscreen,
  togglePlay,
  toggleSourceRole,
  togglePictureInPicture,
  toggleActivityMode,
  toggleStreamingMode,
  toggleFs,
  toggleMute,
  toggleMicrophone,
  toggleShortcuts,
  togglePtz,
  toggleFastForward,
  toggleRewind,
  toggleBbox,
  toggleZones,
  toggleTimeline,
  timelineState,
  timelineScroll,
  captureScreenshot,
  trimMode,
});
</script>

<style>
.timeline-overlay {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.7) 50%, rgba(0, 0, 0, 1) 100%) !important;
}

.more-menu-popover.p-popover {
  background: rgba(15, 15, 15, 0.92) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 10px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
  overflow: hidden;
  padding: 0 !important;
}

.more-menu-popover .p-popover-content {
  padding: 4px !important;
}

.more-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  width: 100%;
  text-align: left;
  transition: background 0.15s ease;
}

.more-menu-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.more-menu-item:disabled {
  opacity: 0.35;
  cursor: default;
}

.more-menu-item-active {
  color: var(--p-primary-color, #3b82f6);
}

.ar-box {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  /* aspect-ratio set via inline style */
}

#video-container[data-cui-fullscreen='fit'] {
  --cui-fs-vw: calc(100dvw - env(safe-area-inset-left) - env(safe-area-inset-right));
  --cui-fs-vh: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  width: min(var(--cui-fs-vw), calc(var(--cui-fs-vh) * var(--cam-ar-w) / var(--cam-ar-h))) !important;
  height: min(var(--cui-fs-vh), calc(var(--cui-fs-vw) * var(--cam-ar-h) / var(--cam-ar-w))) !important;
  max-width: none !important;
  max-height: none !important;
  aspect-ratio: auto !important;
  transition: none !important;
  overflow: hidden !important;
}

#video-container[data-cui-fullscreen='fit'] .ar-box {
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  aspect-ratio: auto;
}
</style>

<style scoped>
.control-bar-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.6) 60%, rgba(0, 0, 0, 0.8) 100%);
}

.ai-description-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 6;
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.75rem 1rem 1.25rem;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.65) 55%, transparent 100%);
  pointer-events: none;
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
}

.control-bar-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  flex-shrink: 0;
  border-radius: 6px !important;
  transition: background 0.15s ease !important;
}

.control-bar-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12) !important;
}

.control-bar-tiny .control-bar-gradient {
  height: 56px;
}

.control-bar-tiny .control-bar-btn {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  border-radius: 4px !important;
}

.control-bar-tiny .control-bar-btn :deep(svg) {
  width: 14px !important;
  height: 14px !important;
}

.control-bar-tiny > .relative {
  padding-left: 0.5rem !important;
  padding-right: 0.5rem !important;
  padding-bottom: 0.5rem !important;
  padding-top: 1.5rem !important;
}

.active {
  background: var(--p-button-text-contrast-active-background) !important;
  border-color: transparent !important;
  color: var(--p-button-text-contrast-color) !important;
}

.camera-card-info-box {
  background: #df2a4cc7;
  border: 1px solid #331419;
  padding: 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.9rem;
}

.zoom-constraining:not(.resizable-mode) :deep(> *) {
  transition: transform 0.15s ease-out !important;
}

#video-container.resizable-mode,
#video-container.resizable-mode *,
#video-container.resizable-mode :deep(*) {
  transition: none !important;
}

#video-container.edit-mode::before {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 0 2px rgba(223, 42, 76, 0.9);
  pointer-events: none;
  z-index: 10;
}

#video-container.detection-detected::before {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 10px 2px var(--primary-500);
  pointer-events: none;
  z-index: 10;
}

.zoom-minimap {
  position: absolute;
  bottom: 10px;
  right: 10px;
  width: 80px;
  aspect-ratio: v-bind(cameraAspectRatio);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  z-index: 6;
  pointer-events: none;
  overflow: hidden;
  transition: bottom 0.2s ease;
}

.zoom-minimap-raised {
  bottom: 50px;
}

.zoom-minimap-viewport {
  position: absolute;
  border: 1.5px solid rgba(255, 255, 255, 0.7);
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.12);
}

.nvr-spinner :deep(circle) {
  stroke: #0ea5e9 !important;
}
</style>
