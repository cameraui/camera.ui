import ProgressSpinner from 'primevue/progressspinner';

const DefaultLoading = defineComponent({
  render() {
    return h('div', { class: 'flex items-center justify-center w-full h-full min-h-[100px]' }, [
      h(ProgressSpinner, { class: 'w-[24px] h-[24px] m-0', strokeWidth: '5' }),
    ]);
  },
});

export function asyncComponent(loader: () => Promise<any>, options?: { delay?: number }): Component {
  return defineAsyncComponent({
    loader,
    loadingComponent: DefaultLoading,
    delay: options?.delay ?? 150,
  });
}
