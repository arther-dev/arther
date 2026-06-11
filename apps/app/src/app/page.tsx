import { Button, Divider, Skeleton, StatusPill } from '@arther/ui';

const surfaces = ['canvas', 'surface', 'panel', 'raised', 'active', 'inset'] as const;
const statuses = ['live', 'stale', 'review', 'draft', 'unpublished'] as const;

/**
 * Placeholder home: a token swatch sheet proving the DS wiring (tokens.css →
 * ui atoms → Tailwind theme) end-to-end. Replaced by the Dashboard in M1/F4.
 */
export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-10">
      <header className="flex flex-col gap-2">
        <h1 style={{ font: 'var(--type-h1)' }}>Arther</h1>
        <p className="text-secondary">
          Phase 1 scaffold — design tokens, atoms, and theme wiring. See{' '}
          <span className="text-link">IMPLEMENTATION_PLAN.md</span> for the roadmap.
        </p>
      </header>

      <Divider />

      <section className="flex flex-col gap-3">
        <h2 style={{ font: 'var(--type-h2)' }}>Surface ramp</h2>
        <div className="flex gap-2">
          {surfaces.map((name) => (
            <div
              key={name}
              className="flex h-20 flex-1 items-end rounded-md border border-strong p-2"
              style={{ background: `var(--bg-${name})` }}
            >
              <span className="text-tertiary" style={{ font: 'var(--type-caption)' }}>
                {name}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 style={{ font: 'var(--type-h2)' }}>Status</h2>
        <div className="flex gap-2">
          {statuses.map((status) => (
            <StatusPill key={status} status={status}>
              {status}
            </StatusPill>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 style={{ font: 'var(--type-h2)' }}>Buttons</h2>
        <div className="flex items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 style={{ font: 'var(--type-h2)' }}>Skeleton</h2>
        <div className="flex flex-col gap-2">
          <Skeleton style={{ height: 16, width: '60%' }} />
          <Skeleton style={{ height: 16, width: '80%' }} />
          <Skeleton style={{ height: 16, width: '40%' }} />
        </div>
      </section>
    </main>
  );
}
