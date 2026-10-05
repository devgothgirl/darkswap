import { ChevronDown } from 'lucide-react';
import {
  AssetRow,
  AssetRowAmount,
  AssetRowAvatar,
  AssetRowSubtext,
  AssetRowText,
  AssetRowTrailing,
} from '../../components/ui/asset-row';
import { Guidelines, Stack } from '../parts';

export function AssetRowDemo() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-6">
        <Stack label="Selectable list — asset plus network identity">
          <div className="grid max-w-md gap-2">
            <AssetRow asChild selected>
              <button type="button">
                <AssetRowAvatar fallback="AA" network="N1" />
                <AssetRowText symbol="AAA" network="Network One" />
                <AssetRowTrailing>
                  <AssetRowAmount>12.4081</AssetRowAmount>
                  <AssetRowSubtext>≈ 1,204.18</AssetRowSubtext>
                </AssetRowTrailing>
              </button>
            </AssetRow>

            <AssetRow asChild>
              <button type="button">
                <AssetRowAvatar fallback="AA" network="N2" />
                <AssetRowText symbol="AAA" network="Network Two" />
                <AssetRowTrailing>
                  <AssetRowAmount>0.0000</AssetRowAmount>
                  <AssetRowSubtext>No balance</AssetRowSubtext>
                </AssetRowTrailing>
              </button>
            </AssetRow>

            <AssetRow asChild>
              <button type="button">
                <AssetRowAvatar fallback="BB" network="N1" />
                <AssetRowText symbol="BBB" network="Network One" />
                <AssetRowTrailing>
                  <AssetRowAmount>842.00</AssetRowAmount>
                  <AssetRowSubtext>≈ 842.00</AssetRowSubtext>
                </AssetRowTrailing>
              </button>
            </AssetRow>

            <AssetRow asChild disabled>
              <button type="button">
                <AssetRowAvatar fallback="CC" network="N3" />
                <AssetRowText symbol="CCC" network="Network Three" />
                <AssetRowTrailing>
                  <AssetRowSubtext>Not routable</AssetRowSubtext>
                </AssetRowTrailing>
              </button>
            </AssetRow>
          </div>
        </Stack>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <Stack label="As a select trigger">
          <div className="max-w-56">
            <AssetRow asChild>
              <button type="button" aria-label="Change asset">
                <AssetRowAvatar fallback="AA" network="N1" />
                <AssetRowText symbol="AAA" network="Network One" />
                <AssetRowTrailing>
                  <ChevronDown />
                </AssetRowTrailing>
              </button>
            </AssetRow>
          </div>
        </Stack>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <Stack label="Static row — not interactive">
          <div className="max-w-md">
            <AssetRow className="hover:bg-secondary">
              <AssetRowAvatar fallback="AA" network="N1" />
              <AssetRowText symbol="AAA" network="Network One" />
              <AssetRowTrailing>
                <AssetRowAmount>12.4081</AssetRowAmount>
              </AssetRowTrailing>
            </AssetRow>
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
              text: 'Always show the network alongside the symbol, in both the avatar sigil and the label. The same symbol exists on several networks and the difference is not recoverable later.',
            },
            {
              kind: 'do',
              text: 'Keep balances in the mono family with tabular figures so the right edge of a list lines up.',
            },
            {
              kind: 'dont',
              text: 'Do not drop a row that cannot be routed. Disable it and say why in the trailing slot.',
            },
            {
              kind: 'dont',
              text: 'Do not invent artwork for an asset. Pass the real mark or let the initials fallback stand.',
            },
          ]}
        />
      </section>
    </div>
  );
}
