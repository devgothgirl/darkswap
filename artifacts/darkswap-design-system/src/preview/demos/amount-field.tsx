import { ChevronDown } from 'lucide-react';
import {
  AmountField,
  AmountFieldAsset,
  AmountFieldFooter,
  AmountFieldHeader,
  AmountFieldHint,
  AmountFieldInput,
  AmountFieldLabel,
  AmountFieldMessage,
  AmountFieldRow,
  AmountFieldSecondary,
  AmountFieldShortcut,
  AmountFieldShortcuts,
} from '../../components/ui/amount-field';
import {
  AssetRow,
  AssetRowAvatar,
  AssetRowText,
  AssetRowTrailing,
} from '../../components/ui/asset-row';
import { Guidelines, Stack } from '../parts';

function AssetTrigger() {
  return (
    <AssetRow asChild className="w-auto py-1.5">
      <button type="button" aria-label="Change asset">
        <AssetRowAvatar fallback="AA" network="N1" />
        <AssetRowText symbol="AAA" network="Network One" />
        <AssetRowTrailing>
          <ChevronDown />
        </AssetRowTrailing>
      </button>
    </AssetRow>
  );
}

export function AmountFieldDemo() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-6">
        <Stack label="Input side — shortcuts, asset slot, converted line">
          <div className="max-w-md">
            <AmountField>
              <AmountFieldHeader>
                <AmountFieldLabel htmlFor="amount-from">You pay</AmountFieldLabel>
                <AmountFieldShortcuts>
                  <AmountFieldShortcut>25%</AmountFieldShortcut>
                  <AmountFieldShortcut active>50%</AmountFieldShortcut>
                  <AmountFieldShortcut>75%</AmountFieldShortcut>
                  <AmountFieldShortcut>Max</AmountFieldShortcut>
                </AmountFieldShortcuts>
              </AmountFieldHeader>
              <AmountFieldRow>
                <AmountFieldInput id="amount-from" defaultValue="6.2040" />
                <AmountFieldAsset>
                  <AssetTrigger />
                </AmountFieldAsset>
              </AmountFieldRow>
              <AmountFieldFooter>
                <AmountFieldSecondary>≈ $602.09</AmountFieldSecondary>
                <AmountFieldHint>Balance 12.4081</AmountFieldHint>
              </AmountFieldFooter>
            </AmountField>
          </div>
        </Stack>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <Stack label="Quoted side — read-only, no shortcuts">
          <div className="max-w-md">
            <AmountField>
              <AmountFieldHeader>
                <AmountFieldLabel htmlFor="amount-to">
                  You receive
                </AmountFieldLabel>
              </AmountFieldHeader>
              <AmountFieldRow>
                <AmountFieldInput id="amount-to" readOnly value="248.1902" />
                <AmountFieldAsset>
                  <AssetTrigger />
                </AmountFieldAsset>
              </AmountFieldRow>
              <AmountFieldFooter>
                <AmountFieldSecondary>≈ $601.22</AmountFieldSecondary>
                <AmountFieldHint>Quote, not a guarantee</AmountFieldHint>
              </AmountFieldFooter>
            </AmountField>
          </div>
        </Stack>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <Stack label="Empty, invalid, and disabled">
          <div className="grid gap-3 lg:grid-cols-2">
            <AmountField>
              <AmountFieldHeader>
                <AmountFieldLabel htmlFor="amount-empty">Amount</AmountFieldLabel>
              </AmountFieldHeader>
              <AmountFieldRow>
                <AmountFieldInput id="amount-empty" />
              </AmountFieldRow>
              <AmountFieldFooter>
                <AmountFieldSecondary>≈ $0.00</AmountFieldSecondary>
              </AmountFieldFooter>
            </AmountField>

            <AmountField invalid>
              <AmountFieldHeader>
                <AmountFieldLabel htmlFor="amount-invalid">
                  Amount
                </AmountFieldLabel>
                <AmountFieldShortcuts>
                  <AmountFieldShortcut>Max</AmountFieldShortcut>
                </AmountFieldShortcuts>
              </AmountFieldHeader>
              <AmountFieldRow>
                <AmountFieldInput
                  id="amount-invalid"
                  defaultValue="98.0000"
                  aria-invalid
                  aria-describedby="amount-invalid-message"
                />
              </AmountFieldRow>
              <AmountFieldFooter>
                <AmountFieldHint>Balance 12.4081</AmountFieldHint>
              </AmountFieldFooter>
              <AmountFieldMessage id="amount-invalid-message">
                More than the available balance.
              </AmountFieldMessage>
            </AmountField>

            <AmountField disabled>
              <AmountFieldHeader>
                <AmountFieldLabel htmlFor="amount-disabled">
                  Amount
                </AmountFieldLabel>
              </AmountFieldHeader>
              <AmountFieldRow>
                <AmountFieldInput id="amount-disabled" disabled value="0.0" />
              </AmountFieldRow>
              <AmountFieldFooter>
                <AmountFieldHint>Select an asset first</AmountFieldHint>
              </AmountFieldFooter>
            </AmountField>
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
              text: 'Keep the converted value visible at all times, including at zero. A figure that appears only once the field is valid reads as a glitch.',
            },
            {
              kind: 'do',
              text: 'Label the last shortcut "Max" rather than "100%" — it is the one people reach for deliberately.',
            },
            {
              kind: 'dont',
              text: 'Do not put percentage shortcuts on a quoted output field. Shortcuts imply the number is yours to set.',
            },
            {
              kind: 'dont',
              text: 'Do not rely on the red border alone for an invalid amount. Say what is wrong in AmountFieldMessage.',
            },
          ]}
        />
      </section>
    </div>
  );
}
