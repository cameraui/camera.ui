export function useRouteMeta() {
  const route = useRoute();

  const ui = computed(() => route.meta.ui);

  return {
    ui,

    showNavbar: computed(() => Boolean(toValue(ui.value?.showNavbar))),
    showTopbar: computed(() => Boolean(toValue(ui.value?.showTopbar))),
    showBottombar: computed(() => Boolean(toValue(ui.value?.showBottombar))),
    showRouterLoading: computed(() => Boolean(toValue(ui.value?.showRouterLoading))),
    showRouterLoadingSub: computed(() => Boolean(toValue(ui.value?.showRouterLoadingSub))),
    minifiedTopbar: computed(() => Boolean(toValue(ui.value?.minifiedTopbar))),

    background: computed(() => toValue(ui.value?.background) as string | undefined),

    padding: computed(() => Boolean(toValue(ui.value?.containerSettings?.padding))),
    paddingTop: computed(() => toValue(ui.value?.containerSettings?.paddingTop) as boolean | undefined),
    paddingBottom: computed(() => toValue(ui.value?.containerSettings?.paddingBottom) as boolean | undefined),
    paddingLeft: computed(() => toValue(ui.value?.containerSettings?.paddingLeft) as boolean | undefined),
    paddingRight: computed(() => toValue(ui.value?.containerSettings?.paddingRight) as boolean | undefined),
    showTitle: computed(() => Boolean(toValue(ui.value?.containerSettings?.showTitle))),
    fullwidth: computed(() => Boolean(toValue(ui.value?.containerSettings?.fullwidth))),
    disableScroll: computed(() => Boolean(toValue(ui.value?.containerSettings?.disableScroll))),
    ignoreSafeAreaBottom: computed(() => Boolean(toValue(ui.value?.containerSettings?.ignoreSafeAreaBottom))),
    noExtraPadding: computed(() => Boolean(toValue(ui.value?.containerSettings?.noExtraPadding))),
    allowOverflowX: computed(() => Boolean(toValue(ui.value?.containerSettings?.allowOverflowX))),
  };
}
