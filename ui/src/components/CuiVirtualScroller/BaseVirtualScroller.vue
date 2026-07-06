<script lang="ts">
/**
 *
 * CuiVirtualScroller is a performant approach to handle huge data efficiently.
 *
 * [Live Demo](https://www.primevue.org/virtualscroller/)
 *
 */

// @ts-nocheck

import BaseComponent from '@primevue/core/basecomponent';
import VirtualScrollerStyle from 'primevue/virtualscroller/style';

export default {
  name: 'BaseVirtualScroller',
  extends: BaseComponent,
  provide() {
    return {
      $pcVirtualScroller: this,
      $parentInstance: this,
    };
  },
  props: {
    id: {
      type: String,
      default: null,
    },
    style: null,
    class: null,
    items: {
      type: Array,
      default: null,
    },
    itemSize: {
      type: [Number, Array],
      default: 0,
    },
    scrollHeight: null,
    scrollWidth: null,
    orientation: {
      type: String,
      default: 'vertical',
    },
    rtl: {
      type: Boolean,
      default: false,
    },
    numToleratedItems: {
      type: Number,
      default: null,
    },
    delay: {
      type: Number,
      default: 0,
    },
    resizeDelay: {
      type: Number,
      default: 10,
    },
    lazy: {
      type: Boolean,
      default: false,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    loaderDisabled: {
      type: Boolean,
      default: false,
    },
    columns: {
      type: Array,
      default: null,
    },
    loading: {
      type: Boolean,
      default: false,
    },
    showSpacer: {
      type: Boolean,
      default: true,
    },
    showLoader: {
      type: Boolean,
      default: false,
    },
    tabindex: {
      type: Number,
      default: 0,
    },
    inline: {
      type: Boolean,
      default: false,
    },
    step: {
      type: Number,
      default: 0,
    },
    appendOnly: {
      type: Boolean,
      default: false,
    },
    autoSize: {
      type: Boolean,
      default: false,
    },
    /**
     * Optional key resolver for the rendered items. Accepts:
     *   - a string: uses `item[key]` as the Vue :key
     *   - a function: `(item, index) => string | number`
     * Falls back to the index when the item has no resolvable key.
     * Use this to keep slot VNodes stable across scroll-induced range
     * shifts — without it, PrimeVue keys rendered items by position, which
     * causes every visible item's slot content to remount whenever the
     * render window slides by one.
     */
    itemKey: {
      type: [String, Function],
      default: null,
    },
  },
  style: VirtualScrollerStyle,
  beforeMount() {
    VirtualScrollerStyle.loadCSS({ nonce: this.$primevueConfig?.csp?.nonce });
  },
};
</script>
