import { Check } from 'lucide-react';
import {
  RouteCard,
  RouteCardAmount,
  RouteCardHeader,
  RouteCardIndicator,
  RouteCardMeta,
  RouteCardMetaItem,
  RouteCardSubtext,
  RouteCardTitle,
} from '../../components/ui/route-card';
import { StatusPill } from '../../components/ui/status-pill';
import { Guidelines, Stack } from '../parts';

export function RouteCardDemo() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-6">
        <Stack label="Comparable options, one selected">
          <div className="grid max-w-xl gap-2">
            <RouteCard asChild selected>
              <button type="button">
                <RouteCardHeader>
                  <RouteCardTitle>Shielded route</RouteCardTitle>
                  <StatusPill tone="brand" size="sm">
                    Best rate
                  </StatusPill>
                  <RouteCardIndicator>
                    <Check />
                  </RouteCardIndicator>
                </RouteCardHeader>
                <div>
                  <RouteCardAmount>248.1902</RouteCardAmount>
                  <RouteCardSubtext>≈ 248.02 after fees</RouteCardSubtext>
                </div>
                <RouteCardMeta>
                  <RouteCardMetaItem label="Fee">0.21%</RouteCardMetaItem>
                  <RouteCardMetaItem label="Time">~4 min</RouteCardMetaItem>
                  <RouteCardMetaItem label="Steps">2</RouteCardMetaItem>
                </RouteCardMeta>
              </button>
            </RouteCard>

            <RouteCard asChild>
              <button type="button">
                <RouteCardHeader>
                  <RouteCardTitle>Direct route</RouteCardTitle>
                  <StatusPill tone="neutral" size="sm">
                    Fastest
                  </StatusPill>
                </RouteCardHeader>
                <div>
                  <RouteCardAmount>247.6140</RouteCardAmount>
                  <RouteCardSubtext>≈ 247.44 after fees</RouteCardSubtext>
                </div>
                <RouteCardMeta>
                  <RouteCardMetaItem label="Fee">0.35%</RouteCardMetaItem>
                  <RouteCardMetaItem label="Time">~1 min</RouteCardMetaItem>
                  <RouteCardMetaItem label="Steps">1</RouteCardMetaItem>
                </RouteCardMeta>
              </button>
            </RouteCard>

            <RouteCard asChild disabled>
              <button type="button">
                <RouteCardHeader>
                  <RouteCardTitle>Pooled route</RouteCardTitle>
                  <StatusPill tone="caution" size="sm">
                    Unavailable
                  </StatusPill>
                </RouteCardHeader>
                <div>
                  <RouteCardAmount>—</RouteCardAmount>
                  <RouteCardSubtext>No quote for this pair</RouteCardSubtext>
                </div>
              </button>
            </RouteCard>
          </div>
        </Stack>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <Stack label="Compact — figure and one qualifier">
          <div className="grid max-w-xl gap-2 sm:grid-cols-2">
            <RouteCard asChild>
              <button type="button">
                <RouteCardTitle>Option A</RouteCardTitle>
                <RouteCardAmount>1.0421</RouteCardAmount>
                <RouteCardMeta>
                  <RouteCardMetaItem label="Time">~2 min</RouteCardMetaItem>
                </RouteCardMeta>
              </button>
            </RouteCard>
            <RouteCard asChild>
              <button type="button">
                <RouteCardTitle>Option B</RouteCardTitle>
                <RouteCardAmount>1.0398</RouteCardAmount>
                <RouteCardMeta>
                  <RouteCardMetaItem label="Time">~9 min</RouteCardMetaItem>
                </RouteCardMeta>
              </button>
            </RouteCard>
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
              text: 'Put the figure the options are compared on in RouteCardAmount, and keep the same metadata labels across every card in a list so the eye can scan down one column.',
            },
            {
              kind: 'do',
              text: 'Pair the selected border with the indicator. Selection must survive a reader who cannot see the violet tint.',
            },
            {
              kind: 'dont',
              text: 'Do not rank cards with colour. One brand-toned pill on the recommended option is enough; more pills and the ranking disappears.',
            },
            {
              kind: 'dont',
              text: 'Do not name an execution provider on the card. Describe the route by what it does; provider names belong in the product docs.',
            },
          ]}
        />
      </section>
    </div>
  );
}
