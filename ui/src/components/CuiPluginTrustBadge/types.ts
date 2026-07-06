import OfficialIcon from '~icons/mdi/check-decagram';
import CommunityIcon from '~icons/mdi/account-group';
import VerifiedIcon from '~icons/mdi/shield-check';

import type { Component } from 'vue';

export type PluginTrust = 'official' | 'verified' | 'community';

export interface CuiPluginTrustBadgeProps {
  trust?: PluginTrust;
  showLabel?: boolean;
}

export interface TrustMeta {
  icon: Component;
  labelKey: string;
  descriptionKey: string;
  class: string;
}

export const PLUGIN_TRUST_META: Record<PluginTrust, TrustMeta> = {
  official: {
    icon: OfficialIcon,
    labelKey: 'components.plugin_search.trust_official',
    descriptionKey: 'components.plugin_search.trust_official_description',
    class: 'cui-trust-official',
  },
  verified: {
    icon: VerifiedIcon,
    labelKey: 'components.plugin_search.trust_verified',
    descriptionKey: 'components.plugin_search.trust_verified_description',
    class: 'cui-trust-verified',
  },
  community: {
    icon: CommunityIcon,
    labelKey: 'components.plugin_search.trust_community',
    descriptionKey: 'components.plugin_search.trust_community_description',
    class: 'cui-trust-community',
  },
};
