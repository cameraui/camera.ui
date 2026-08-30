import { ZIndex } from '@primeuix/utils/zindex';
import Popover from 'primevue/popover';
import Portal from 'primevue/portal';
import Tooltip from 'primevue/tooltip';
import { createBlock, createCommentVNode, openBlock, renderSlot, Teleport } from 'vue';

export function redirectOverlays(host: Element): void {
  redirectPortals(host);
  redirectTooltips(host);
  acceptShadowClicks();
}

function redirectPortals(host: Element): void {
  (Portal as { render?: unknown }).render = (
    ctx: { $slots: Record<string, unknown> },
    _cache: unknown,
    props: { appendTo: string | Element },
    _setup: unknown,
    data: { mounted: boolean },
    options: { inline: boolean },
  ) => {
    if (options.inline) return renderSlot(ctx.$slots as never, 'default', { key: 0 });
    if (!data.mounted) return createCommentVNode('', true);
    return (
      openBlock(),
      createBlock(Teleport, { key: 1, to: props.appendTo === 'body' ? host : props.appendTo }, [renderSlot(ctx.$slots as never, 'default')], 8, ['to'])
    );
  };
}

interface TooltipInstance {
  remove(el: HTMLElement): void;
  getTooltipElement(el: HTMLElement): HTMLElement | null;
  $haPatched?: boolean;
}

type TooltipHost = HTMLElement & { _$instances?: { tooltip?: TooltipInstance }; $_ptooltipId?: string | null };

function redirectTooltips(host: Element): void {
  const directive = Tooltip as unknown as { created?: (el: TooltipHost, ...rest: unknown[]) => void };
  const created = directive.created;
  directive.created = function (this: unknown, el: TooltipHost, ...rest: unknown[]): void {
    created?.call(this, el, ...rest);
    const instance = el._$instances?.tooltip;
    if (!instance || instance.$haPatched) return;
    instance.$haPatched = true;
    instance.remove = function (this: TooltipInstance, target: TooltipHost | null): void {
      if (!target) return;
      const tooltipElement = this.getTooltipElement(target);
      if (tooltipElement?.parentElement) {
        ZIndex.clear(tooltipElement);
        tooltipElement.remove();
      }
      target.$_ptooltipId = null;
    };
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof HTMLElement && node.classList.contains('p-tooltip')) host.appendChild(node);
      }
    }
  });
  observer.observe(document.body, { childList: true });
}

function acceptShadowClicks(): void {
  const methods = (Popover as unknown as { methods: { isTargetClicked(event: Event): boolean } }).methods;
  methods.isTargetClicked = function (this: { eventTarget?: Element | null }, event: Event): boolean {
    const target = this.eventTarget;
    if (!target) return false;
    return target === event.target || target.contains(event.target as Node) || event.composedPath().includes(target);
  };
}
