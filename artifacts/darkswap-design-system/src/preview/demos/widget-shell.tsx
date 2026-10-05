import { ArrowDown, Settings2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  WidgetShell,
  WidgetShellActions,
  WidgetShellBody,
  WidgetShellDivider,
  WidgetShellFooter,
  WidgetShellHeader,
  WidgetShellNote,
  WidgetShellTab,
  WidgetShellTabs,
} from '../../components/ui/widget-shell';
import { Guidelines, Stack } from '../parts';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

export function WidgetShellDemo() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-6">
        <Stack label="Default — tab bar, settings slot, stacked fields">
          <WidgetShell>
            <WidgetShellHeader>
              <WidgetShellTabs>
                <WidgetShellTab active>Exchange</WidgetShellTab>
                <WidgetShellTab>Send</WidgetShellTab>
                <WidgetShellTab>Request</WidgetShellTab>
              </WidgetShellTabs>
              <WidgetShellActions>
                <Button variant="ghost" size="icon" aria-label="Preferences">
                  <Settings2 />
                </Button>
              </WidgetShellActions>
            </WidgetShellHeader>
            <WidgetShellBody>
              <Field label="You pay" value="1.00" />
              <WidgetShellDivider>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-full"
                  aria-label="Reverse direction"
                >
                  <ArrowDown />
                </Button>
              </WidgetShellDivider>
              <Field label="You receive" value="248.19" />
            </WidgetShellBody>
            <WidgetShellFooter>
              <Button className="w-full">Review</Button>
              <WidgetShellNote>
                Quotes refresh while this panel is open.
              </WidgetShellNote>
            </WidgetShellFooter>
          </WidgetShell>
        </Stack>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <Stack label="Single step — no tabs, plain divider">
          <WidgetShell className="max-w-sm">
            <WidgetShellHeader>
              <p className="px-1 text-sm font-semibold">Confirm</p>
            </WidgetShellHeader>
            <WidgetShellBody>
              <Field label="Amount" value="248.19" />
              <WidgetShellDivider />
              <dl className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <dt>Rate</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    1 : 248.19
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Estimated time</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    ~4 min
                  </dd>
                </div>
              </dl>
            </WidgetShellBody>
            <WidgetShellFooter>
              <Button className="w-full">Confirm</Button>
            </WidgetShellFooter>
          </WidgetShell>
        </Stack>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <Stack label="Disabled tab">
          <WidgetShell className="max-w-sm">
            <WidgetShellHeader>
              <WidgetShellTabs>
                <WidgetShellTab active>Exchange</WidgetShellTab>
                <WidgetShellTab disabled>Batch</WidgetShellTab>
              </WidgetShellTabs>
            </WidgetShellHeader>
            <WidgetShellBody>
              <p className="text-sm text-muted-foreground">
                A tab that is not available stays visible and disabled rather
                than disappearing, so the set of capabilities reads the same
                every time.
              </p>
            </WidgetShellBody>
          </WidgetShell>
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
              text: 'Keep one shell per flow and switch its contents with the tab bar. A second competing panel on the same page splits attention.',
            },
            {
              kind: 'do',
              text: 'Put the primary action in the footer, full width, with any summary line directly beneath it.',
            },
            {
              kind: 'dont',
              text: 'Do not let the shell stretch past its max width. A transactional panel reads as a focused object, not a page section.',
            },
            {
              kind: 'dont',
              text: 'Do not hide a tab that is unavailable — disable it so the flow keeps a stable shape.',
            },
          ]}
        />
      </section>
    </div>
  );
}
