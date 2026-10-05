import { Guidelines } from '../parts';

const MARK = `${import.meta.env.BASE_URL}logo-mark.png`;
const WORDMARK = `${import.meta.env.BASE_URL}logo-wordmark.png`;

const RAMP = [
  { hex: '#c789fc', note: 'Upper gradient stop' },
  { hex: '#a161fc', note: 'Dominant mark violet' },
  { hex: '#884bfc', note: 'Primary action colour' },
  { hex: '#7443d0', note: 'Lower gradient stop' },
] as const;

export function LogoDemo() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Primary mark
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div
            className="flex size-40 items-center justify-center rounded-xl border"
            style={{ backgroundColor: '#07060d' }}
          >
            <img
              src={MARK}
              alt="DarkSwap logo mark"
              className="size-28 object-contain"
            />
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              The supplied file, unaltered. It is a transparent PNG, so it sits
              on any sufficiently dark surface without a plate.
            </p>
            <p>
              The mark is the source of this system&rsquo;s violet. Everything
              from the primary action colour to the focus ring and the chart
              series is read off its gradient.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Horizontal lockup
        </h2>
        <div
          className="mt-4 flex items-center justify-center rounded-xl border p-6"
          style={{ backgroundColor: '#06060e' }}
        >
          <img
            src={WORDMARK}
            alt="DarkSwap wordmark lockup"
            className="w-full max-w-md object-contain"
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Use the lockup where there is horizontal room and the product needs
          naming. Use the mark alone in a header, an avatar, or anywhere under
          roughly 48px, where the wordmark would stop being legible.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          The gradient the palette comes from
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RAMP.map((stop) => (
            <div key={stop.hex} className="space-y-2">
              <div
                className="h-16 rounded-lg border"
                style={{ backgroundColor: stop.hex }}
              />
              <p className="font-mono text-xs">{stop.hex}</p>
              <p className="text-xs text-muted-foreground">{stop.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Clear space and minimum size
        </h2>
        <div className="mt-4 flex flex-wrap items-end gap-6">
          {[24, 32, 48, 64].map((size) => (
            <div key={size} className="space-y-2 text-center">
              <div
                className="flex items-center justify-center rounded-lg border p-3"
                style={{ backgroundColor: '#07060d' }}
              >
                <img
                  src={MARK}
                  alt=""
                  style={{ width: size, height: size }}
                  className="object-contain"
                />
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {size}px
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Keep clear space of at least a quarter of the mark&rsquo;s height on
          every side. Below 24px the inner detail closes up — use a solid violet
          dot instead.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Guidelines
        </h2>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use the supplied files exactly as they are. The mark is retained in the package under docs/references/logos/.',
            },
            {
              kind: 'do',
              text: 'Place the mark on the near-black page or on a dark raised surface, which is what its gradient was drawn against.',
            },
            {
              kind: 'dont',
              text: 'Do not redraw, recolour, outline, rotate, or add effects to the mark, and never rebuild it from the gradient stops above.',
            },
            {
              kind: 'dont',
              text: 'Do not place the transparent mark on a light or busy surface. Use a dark plate behind it instead.',
            },
          ]}
        />
      </section>
    </div>
  );
}
