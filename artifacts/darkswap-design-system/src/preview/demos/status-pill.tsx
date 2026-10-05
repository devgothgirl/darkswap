import { Check, Lock, ShieldAlert, X } from 'lucide-react';
import { StatusPill } from '../../components/ui/status-pill';
import { Guidelines, Row } from '../parts';

export function StatusPillDemo() {
  return (
    <div className="space-y-4">
      <section className="space-y-5 rounded-xl border bg-card p-6">
        <Row label="Tones">
          <StatusPill tone="neutral">Neutral</StatusPill>
          <StatusPill tone="brand">Brand</StatusPill>
          <StatusPill tone="accent">Accent</StatusPill>
          <StatusPill tone="outline">Outline</StatusPill>
          <StatusPill tone="caution">Caution</StatusPill>
          <StatusPill tone="danger">Danger</StatusPill>
        </Row>

        <Row label="Sizes">
          <StatusPill tone="brand" size="sm">
            Small
          </StatusPill>
          <StatusPill tone="brand">Default</StatusPill>
        </Row>

        <Row label="With a state dot">
          <StatusPill tone="neutral" dot>
            Draft
          </StatusPill>
          <StatusPill tone="accent" dot pulse>
            In progress
          </StatusPill>
          <StatusPill tone="caution" dot>
            Needs review
          </StatusPill>
        </Row>

        <Row label="With an icon">
          <StatusPill tone="brand">
            <Lock />
            Private
          </StatusPill>
          <StatusPill tone="brand">
            <Check />
            Complete
          </StatusPill>
          <StatusPill tone="caution">
            <ShieldAlert />
            Flagged
          </StatusPill>
          <StatusPill tone="danger">
            <X />
            Failed
          </StatusPill>
        </Row>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Guidelines
        </h2>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Read a completed state as the brand violet with a check. This system has no green, so completion is carried by the mark and the word, not by hue.',
            },
            {
              kind: 'do',
              text: 'Keep the label to one or two words and let the surrounding row supply the detail.',
            },
            {
              kind: 'dont',
              text: 'Do not use the danger tone for a slow or pending state. Red is for a failure or a refusal, and spending it early leaves nothing for the real one.',
            },
            {
              kind: 'dont',
              text: 'Do not stack more than two pills on a row. Past two they stop being a status and become decoration.',
            },
          ]}
        />
      </section>
    </div>
  );
}
