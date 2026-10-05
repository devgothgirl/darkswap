import { CautionBanner, CautionBannerTitle } from '@workspace/darkswap-design-system/components/ui/caution-banner';

export function TestnetWarning() {
  return <CautionBanner tone="caution" data-testid="banner-testnet">
    <CautionBannerTitle>Testnet. Development proving keys. Do not deposit real funds.</CautionBannerTitle>
  </CautionBanner>;
}