import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Guidelines } from './parts';

type SwatchSpec = {
  name: string;
  className: string;
  role: string;
};

const CORE_SWATCHES: SwatchSpec[] = [
  {
    name: 'Primary',
    className: 'bg-primary',
    role: 'The mark’s violet. Primary actions, links, selected states.',
  },
  {
    name: 'Secondary',
    className: 'bg-secondary',
    role: 'Violet-tinted panel. Secondary buttons, inset rows, inactive tabs.',
  },
  {
    name: 'Accent',
    className: 'bg-accent',
    role: 'Brighter violet tint. Hover, focus, and selected surfaces.',
  },
];

const SURFACE_SWATCHES: SwatchSpec[] = [
  {
    name: 'Background',
    className: 'border bg-background',
    role: 'The page. Near-black in dark.',
  },
  { name: 'Card', className: 'border bg-card', role: 'Raised surfaces.' },
  {
    name: 'Popover',
    className: 'border bg-popover',
    role: 'Menus, dropdowns, tooltips.',
  },
  { name: 'Muted', className: 'bg-muted', role: 'Quiet fills and input wells.' },
  {
    name: 'Sidebar',
    className: 'border bg-sidebar',
    role: 'Navigation chrome.',
  },
];

const TEXT_SWATCHES: SwatchSpec[] = [
  { name: 'Foreground', className: 'bg-foreground', role: 'Body and headings.' },
  {
    name: 'Muted foreground',
    className: 'bg-muted-foreground',
    role: 'Labels, captions, secondary values.',
  },
  {
    name: 'Primary foreground',
    className: 'border bg-primary-foreground',
    role: 'Text on a primary fill.',
  },
  {
    name: 'Secondary foreground',
    className: 'bg-secondary-foreground',
    role: 'Text on a secondary fill.',
  },
  {
    name: 'Accent foreground',
    className: 'bg-accent-foreground',
    role: 'Text on an accent fill.',
  },
];

const EDGE_SWATCHES: SwatchSpec[] = [
  { name: 'Border', className: 'bg-border', role: 'Hairlines and dividers.' },
  { name: 'Input', className: 'bg-input', role: 'Field edges.' },
  { name: 'Ring', className: 'bg-ring', role: 'Focus indicator.' },
  {
    name: 'Destructive',
    className: 'bg-destructive',
    role: 'Failure, refusal, irreversible actions.',
  },
  {
    name: 'Destructive foreground',
    className: 'border bg-destructive-foreground',
    role: 'Text on a destructive fill.',
  },
];

const CHART_SWATCHES: SwatchSpec[] = [
  { name: 'Chart 1', className: 'bg-chart-1', role: 'Primary series.' },
  { name: 'Chart 2', className: 'bg-chart-2', role: 'Second series.' },
  { name: 'Chart 3', className: 'bg-chart-3', role: 'Third series.' },
  { name: 'Chart 4', className: 'bg-chart-4', role: 'Fourth series.' },
  { name: 'Chart 5', className: 'bg-chart-5', role: 'Fifth series.' },
];

const SIDEBAR_SWATCHES: SwatchSpec[] = [
  {
    name: 'Sidebar foreground',
    className: 'bg-sidebar-foreground',
    role: 'Navigation text.',
  },
  {
    name: 'Sidebar border',
    className: 'bg-sidebar-border',
    role: 'Navigation hairlines.',
  },
  {
    name: 'Sidebar primary',
    className: 'bg-sidebar-primary',
    role: 'Active navigation item.',
  },
  {
    name: 'Sidebar accent',
    className: 'bg-sidebar-accent',
    role: 'Hovered navigation item.',
  },
  {
    name: 'Sidebar ring',
    className: 'bg-sidebar-ring',
    role: 'Navigation focus indicator.',
  },
];

const TYPE_SCALE = [
  { label: 'Display', className: 'text-4xl font-extrabold tracking-tight' },
  { label: 'Heading', className: 'text-2xl font-bold tracking-tight' },
  { label: 'Subheading', className: 'text-lg font-semibold' },
  { label: 'Body', className: 'text-base' },
  { label: 'Label', className: 'text-sm font-medium' },
  { label: 'Caption', className: 'text-xs text-muted-foreground' },
  { label: 'Numeric', className: 'font-mono text-xl font-semibold tabular-nums' },
] as const;

const SPACING_SCALE = [
  { label: '1', className: 'w-1' },
  { label: '2', className: 'w-2' },
  { label: '3', className: 'w-3' },
  { label: '4', className: 'w-4' },
  { label: '6', className: 'w-6' },
  { label: '8', className: 'w-8' },
  { label: '12', className: 'w-12' },
  { label: '16', className: 'w-16' },
  { label: '24', className: 'w-24' },
] as const;

function Swatch({ name, className, role }: SwatchSpec) {
  return (
    <div className="space-y-2">
      <div className={`h-16 rounded-lg ${className}`} />
      <p className="text-sm font-medium leading-tight">{name}</p>
      <p className="text-xs leading-snug text-muted-foreground">{role}</p>
    </div>
  );
}

function SwatchGroup({
  title,
  description,
  swatches,
}: {
  title: string;
  description: string;
  swatches: SwatchSpec[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {swatches.map((swatch) => (
          <Swatch key={swatch.name} {...swatch} />
        ))}
      </div>
    </section>
  );
}

export function OverviewPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5 text-card-foreground">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Core palette
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {CORE_SWATCHES.map((swatch) => (
            <Swatch key={swatch.name} {...swatch} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 text-card-foreground">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Typography
          </h2>
          <div className="mt-4 space-y-3">
            {TYPE_SCALE.slice(0, 5).map((entry) => (
              <p key={entry.label} className={entry.className}>
                {entry.label}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 text-card-foreground">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            In use
          </h2>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Create workspace</CardTitle>
              <CardDescription>
                Components composed from the tokens above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="overview-name">Workspace name</Label>
                <Input id="overview-name" placeholder="Enter a name" />
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked id="overview-notify" />
                <Label htmlFor="overview-notify">Email notifications</Label>
                <Badge className="ml-auto">New</Badge>
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button>Save</Button>
              <Button variant="outline">Cancel</Button>
            </CardFooter>
          </Card>
        </section>
      </div>

      <section className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Components
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Badge>Badge</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 text-card-foreground">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          How this system behaves
        </h2>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Design dark first. Dark is the brand-true theme and the default; the light companion is derived from the same violet ramp and is a courtesy, not a second brand.',
            },
            {
              kind: 'do',
              text: 'Let the violet do the emphasis. On near-black, one saturated action per view is louder than five.',
            },
            {
              kind: 'do',
              text: 'Set figures — amounts, rates, balances, addresses — in the mono family with tabular figures so columns line up and digits stop shifting as they update.',
            },
            {
              kind: 'dont',
              text: 'Do not introduce a lime or yellow-green accent. The earlier site leaned on one; it appears nowhere in the brand art and is not a role here.',
            },
            {
              kind: 'dont',
              text: 'Do not name a third-party execution provider in any component, example, or guideline. Provider names belong in the product’s own documentation.',
            },
            {
              kind: 'dont',
              text: 'Do not hard-code a hex value in a consuming app. Every colour in this system is a role, and roles are what flip between themes.',
            },
          ]}
        />
      </section>
    </div>
  );
}

export function ColorsPage() {
  return (
    <div className="space-y-8 rounded-xl border bg-card p-6 text-card-foreground">
      <SwatchGroup
        title="Core"
        description="Read off the logo mark’s gradient. Primary is the action colour; secondary and accent are the violet-tinted surfaces around it."
        swatches={CORE_SWATCHES}
      />
      <SwatchGroup
        title="Surfaces"
        description="The stack from page to popover. In dark these run near-black to violet-tinted, never grey."
        swatches={SURFACE_SWATCHES}
      />
      <SwatchGroup
        title="Text"
        description="Every text role is paired with the surface it sits on and clears WCAG AA at body size in both themes. Brand violet is the exception: it is a fill colour, so violet text uses the lighter lavender held in the ring role."
        swatches={TEXT_SWATCHES}
      />
      <SwatchGroup
        title="Edges and state"
        description="Hairlines, field edges, the focus ring, and the one red this system spends on genuine failure."
        swatches={EDGE_SWATCHES}
      />
      <SwatchGroup
        title="Charts"
        description="Five series that stay inside the violet range, spreading into magenta and periwinkle for separation rather than leaving the family."
        swatches={CHART_SWATCHES}
      />
      <SwatchGroup
        title="Navigation"
        description="The sidebar runs a shade darker than the page so navigation recedes behind content."
        swatches={SIDEBAR_SWATCHES}
      />

      <section className="space-y-4 border-t pt-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Guidelines
        </h2>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Separate surfaces with a step in the stack — page, card, popover — rather than with a heavier border. On near-black, a border reads louder than it looks.',
            },
            {
              kind: 'do',
              text: 'Reserve destructive for failure, refusal, and irreversible actions. A pending or slow state is not red.',
            },
            {
              kind: 'dont',
              text: 'Do not use a chart colour as a UI accent. The series exist to be told apart from each other, not to compete with the primary.',
            },
            {
              kind: 'dont',
              text: 'Do not add a green for success. This system has no green: a finished state is the brand violet with a check mark.',
            },
          ]}
        />
      </section>
    </div>
  );
}

export function FontsPage() {
  return (
    <div className="space-y-8 rounded-xl border bg-card p-6 text-card-foreground">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Families
        </h2>
        <div className="mt-4 space-y-6">
          <div>
            <p className="font-sans text-4xl font-extrabold tracking-tight">
              Private swaps. No spotlight.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Sans — Inter.</span>{' '}
              UI, body, and display. The launch banner’s headline is a heavier
              grotesque that was never supplied as a font file, so Inter stands
              in for it; set display type at 800–900 to carry that weight. This
              is a deliberate substitution, not the banner’s own face.
            </p>
          </div>
          <div>
            <p className="font-mono text-3xl font-semibold tabular-nums">
              248.1902 — 0.21%
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                Mono — JetBrains Mono.
              </span>{' '}
              Every figure: amounts, rates, fees, balances, addresses. Tabular
              figures keep columns aligned and stop digits from shifting as
              values update.
            </p>
          </div>
          <div>
            <p className="font-serif text-3xl">Long-form editorial copy</p>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                Serif — Source Serif 4.
              </span>{' '}
              The brand art uses no serif. This role is filled deliberately for
              long reading only; product surfaces stay on the sans.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Type scale
        </h2>
        {TYPE_SCALE.map((entry) => (
          <div key={entry.label} className="grid gap-2 sm:grid-cols-[110px_1fr]">
            <span className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {entry.label}
            </span>
            <p className={entry.className}>
              {entry.label === 'Numeric'
                ? '1,248.1902'
                : 'Route it quietly, settle it exactly.'}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-4 border-t pt-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Guidelines
        </h2>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Set headings bold and conventional. Weight and size carry the hierarchy; stretched or letter-spaced display lettering hurts readability.',
            },
            {
              kind: 'do',
              text: 'Use the mono family for anything a reader might compare, copy, or verify digit by digit.',
            },
            {
              kind: 'dont',
              text: 'Do not set body copy in the serif. It is here for long-form reading, and a product surface is not that.',
            },
            {
              kind: 'dont',
              text: 'Do not claim the banner’s original headline face anywhere. Inter is the recorded stand-in until a licensed file arrives.',
            },
          ]}
        />
      </section>
    </div>
  );
}

export function LayoutPage() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-6 text-card-foreground">
          <h2 className="font-semibold">Spacing</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A 0.25rem base step. Dense transactional panels sit at 2–3; page
            sections at 6–12.
          </p>
          <div className="mt-6 space-y-3">
            {SPACING_SCALE.map((space) => (
              <div key={space.label} className="flex items-center gap-4">
                <span className="w-8 font-mono text-xs tabular-nums text-muted-foreground">
                  {space.label}
                </span>
                <div
                  className={`h-3 rounded-full bg-primary ${space.className}`}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-6 text-card-foreground">
          <h2 className="font-semibold">Radius</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A 0.75rem base, matching the softly rounded cards in the brand art.
            Small for chips and inputs, large for cards, extra large for the
            widget shell.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            {[
              { label: 'Small', className: 'rounded-sm' },
              { label: 'Medium', className: 'rounded-md' },
              { label: 'Large', className: 'rounded-lg' },
              { label: 'Extra large', className: 'rounded-xl' },
            ].map((radius) => (
              <div
                key={radius.label}
                className={`flex h-24 items-end border bg-muted p-3 ${radius.className}`}
              >
                <span className="text-xs font-medium">{radius.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-card p-6 text-card-foreground">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Guidelines
        </h2>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Keep a transactional panel tight — 3 inside the shell, 2 between stacked fields — so the whole decision fits in one view.',
            },
            {
              kind: 'do',
              text: 'Nest radii downward: an extra-large shell holds large cards, which hold medium fields, which hold small chips.',
            },
            {
              kind: 'dont',
              text: 'Do not mix radius steps at the same level. Two different corner treatments side by side read as two different systems.',
            },
            {
              kind: 'dont',
              text: 'Do not pad a dense panel like a marketing section. Space that helps a landing page slows a swap down.',
            },
          ]}
        />
      </section>
    </div>
  );
}
