import { Info, ShieldAlert, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  CautionBanner,
  CautionBannerActions,
  CautionBannerDescription,
  CautionBannerTitle,
} from '../../components/ui/caution-banner';
import { Guidelines, Stack } from '../parts';

export function CautionBannerDemo() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-6">
        <Stack label="Tones">
          <div className="max-w-xl space-y-3">
            <CautionBanner tone="neutral" icon={<Info />}>
              <CautionBannerTitle>Quotes expire</CautionBannerTitle>
              <CautionBannerDescription>
                A quote is held for a short window. Reopening this step asks for
                a fresh one.
              </CautionBannerDescription>
            </CautionBanner>

            <CautionBanner tone="brand" icon={<Sparkles />}>
              <CautionBannerTitle>New in this release</CautionBannerTitle>
              <CautionBannerDescription>
                Side-by-side options now show the fee and the estimated time
                before you commit.
              </CautionBannerDescription>
            </CautionBanner>

            <CautionBanner tone="caution" icon={<TriangleAlert />}>
              <CautionBannerTitle>Check the destination</CautionBannerTitle>
              <CautionBannerDescription>
                The destination is on a different network from the asset you
                selected. Confirm it before continuing.
              </CautionBannerDescription>
            </CautionBanner>

            <CautionBanner tone="danger" icon={<ShieldAlert />}>
              <CautionBannerTitle>This step cannot continue</CautionBannerTitle>
              <CautionBannerDescription>
                The amount is above the limit for this route. Lower it or pick a
                different option.
              </CautionBannerDescription>
            </CautionBanner>
          </div>
        </Stack>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <Stack label="With actions, and text only">
          <div className="max-w-xl space-y-3">
            <CautionBanner tone="caution" icon={<TriangleAlert />}>
              <CautionBannerTitle>Unverified destination</CautionBannerTitle>
              <CautionBannerDescription>
                This address has no prior activity on the selected network.
              </CautionBannerDescription>
              <CautionBannerActions>
                <Button size="sm" variant="outline">
                  Review details
                </Button>
                <Button size="sm" variant="ghost">
                  Dismiss
                </Button>
              </CautionBannerActions>
            </CautionBanner>

            <CautionBanner tone="neutral">
              <CautionBannerDescription>
                Network fees are paid in the source asset and are not included
                in the figure above.
              </CautionBannerDescription>
            </CautionBanner>
          </div>
        </Stack>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Guidelines
        </h2>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Place the banner beside the field or action it qualifies, inside the flow. A caution at the top of the page is read once and then forgotten.',
            },
            {
              kind: 'do',
              text: 'Write the title as the thing to check and the description as what to do about it.',
            },
            {
              kind: 'dont',
              text: 'Do not rely on the icon. It is decorative and hidden from assistive technology; the words carry the warning.',
            },
            {
              kind: 'dont',
              text: 'Do not leave more than one caution visible at a time. Two warnings of equal weight cancel each other out.',
            },
          ]}
        />
      </section>
    </div>
  );
}
