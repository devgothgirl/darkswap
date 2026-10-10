import { CautionBanner, CautionBannerTitle } from '@workspace/darkswap-design-system/components/ui/caution-banner';

export function TestnetWarning() {
  return <CautionBanner tone="caution" data-testid="banner-testnet">
    <CautionBannerTitle>Local-development preview. Development proving keys, which could be used to forge proofs. Do not deposit real funds. Not deployed on any public network. Not audited.</CautionBannerTitle>
  </CautionBanner>;
}