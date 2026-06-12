import Link from 'next/link';
import {
  getActiveWorkspace,
  listComponents,
  listFieldsForComponents,
  listUnits,
} from '@arther/db';
import type { ComponentId } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { AddFieldForm } from '../AddFieldForm';
import { NewComponentForm } from '../ComponentForms';
import { CATEGORIES, FieldGrid, SpecsRail } from '../shared';

/**
 * Component Library (F6.2 slice): independent, reusable components — the
 * Figma component/instance mental model. A component used by N products has
 * N edges and ONE field history; editing here edits it everywhere.
 */
export default async function LibraryPage() {
  const supabase = await getSupabaseServer();

  if (!supabase) {
    return (
      <AppShell rail={<SpecsRail active="library" />}>
        <EmptyState
          title="Component Library"
          description="Independent, reusable components live here — one field history shared by every product that uses them."
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) {
    return (
      <AppShell rail={<SpecsRail active="library" />}>
        <EmptyState
          title="Create your workspace first"
          description="The Component Library lives inside a workspace."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/welcome">
              Create workspace
            </Link>
          }
        />
      </AppShell>
    );
  }

  const [components, units] = await Promise.all([
    listComponents(supabase, workspace.id),
    listUnits(supabase, workspace.id),
  ]);
  const componentFields = await listFieldsForComponents(
    supabase,
    components.map((c) => c.id as ComponentId),
  );

  return (
    <AppShell rail={<SpecsRail active="library" />}>
      <div className="specs-content">
        <h1 className="specs-title">Component Library</h1>
        {components.length === 0 ? (
          <p className="specs-grid__meta">
            No components yet — create the first one below. Components are independent of
            products; attach them from a product’s Specs view.
          </p>
        ) : null}
        {components.map((component) => (
          <section key={component.id} className="specs-section">
            <h2 className="specs-section__title">
              {component.name}{' '}
              <span className="specs-grid__meta">
                {component.type}
                {component.usage_count > 0
                  ? ` · used in ${component.usage_count} product${component.usage_count > 1 ? 's' : ''}`
                  : ' · not used yet'}
              </span>
            </h2>
            <FieldGrid
              fields={componentFields.get(component.id) ?? []}
              units={units}
              components={components}
            />
            <AddFieldForm ownerKind="component" ownerId={component.id} categories={CATEGORIES} />
          </section>
        ))}
        <NewComponentForm />
      </div>
    </AppShell>
  );
}
