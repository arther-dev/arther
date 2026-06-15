import Link from 'next/link';
import {
  getActiveWorkspace,
  getEntityBrief,
  listArchived,
  listArchivedFields,
  listBriefKeyUsage,
  listComponents,
  listFieldsForComponents,
  listUnits,
  listUsersByIds,
} from '@arther/db';
import {
  briefFragmentKeySchema,
  componentIdSchema,
  type ComponentId,
  type SpecFieldId,
  type UserId,
} from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { AddFieldForm } from '../AddFieldForm';
import { BriefPanel } from '../BriefPanel';
import { NewComponentForm } from '../ComponentForms';
import { ArchiveToggle } from '../DetailForms';
import { FieldDetail } from '../FieldDetail';
import { CATEGORIES, FieldGrid, SpecsRail } from '../shared';

/**
 * Component Library (F6.2 slice): independent, reusable components — the
 * Figma component/instance mental model. A component used by N products has
 * N edges and ONE field history; editing here edits it everywhere.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ field?: string; component?: string; tab?: string; fragment?: string }>;
}) {
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

  const { field, component, tab, fragment } = await searchParams;
  const [components, units, archivedComponents] = await Promise.all([
    listComponents(supabase, workspace.id),
    listUnits(supabase, workspace.id),
    listArchived(supabase, 'components', workspace.id),
  ]);

  // G0.6: a component's Product Brief opens full-canvas, the same surface as a
  // product's. F8.5 — a malformed ?component= degrades to the library list.
  const briefComponentId = tab === 'brief' && component ? componentIdSchema.safeParse(component).data : undefined;
  const briefComponent = briefComponentId
    ? components.find((c) => c.id === briefComponentId)
    : undefined;
  if (briefComponent) {
    const brief = await getEntityBrief(supabase, 'component', briefComponent.id);
    const briefUsage = await listBriefKeyUsage(supabase, workspace.id);
    const expandedKey = fragment ? briefFragmentKeySchema.safeParse(fragment).data : undefined;
    const editorIds = brief.fragments.map((f) => f.updated_by).filter(Boolean) as UserId[];
    const editors = await listUsersByIds(supabase, editorIds);
    const editorNames = new Map<string, string>(
      [...editors.entries()].map(([id, u]) => [id, u.name ?? u.email]),
    );
    return (
      <AppShell rail={<SpecsRail active="library" />}>
        <div className="specs-content">
          <header className="specs-form--row">
            <Link className="ui-btn ui-btn--ghost" href="/specs/library">
              ← Component Library
            </Link>
            <h1 className="specs-title">{briefComponent.name}</h1>
            <span className="specs-grid__meta">
              Shared brief — appears in every product that references this component.
            </span>
          </header>
          <BriefPanel
            entityType="component"
            entityId={briefComponent.id}
            fragments={brief.fragments}
            keyUsage={briefUsage}
            expandedKey={expandedKey}
            basePath={`/specs/library?component=${briefComponent.id}&tab=brief`}
            editorNames={editorNames}
          />
        </div>
      </AppShell>
    );
  }
  const componentFields = await listFieldsForComponents(
    supabase,
    components.map((c) => c.id as ComponentId),
  );
  const archivedFields = await listArchivedFields(supabase, {
    componentIds: components.map((c) => c.id as ComponentId),
  });
  const archivedFieldsFor = (id: ComponentId) =>
    archivedFields.filter((f) => f.component_id === id);

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
            <header className="specs-form--row">
              <h2 className="specs-section__title">
                {component.name}{' '}
                <span className="specs-grid__meta">
                  {component.type}
                  {component.usage_count > 0
                    ? ` · used in ${component.usage_count} product${component.usage_count > 1 ? 's' : ''}`
                    : ' · not used yet'}
                </span>
              </h2>
              <Link
                className="ui-btn ui-btn--ghost"
                href={`/specs/library?component=${component.id}&tab=brief`}
              >
                Product Brief
              </Link>
              <ArchiveToggle
                entity="components"
                id={component.id}
                archived={false}
                label={component.name}
              />
            </header>
            <FieldGrid
              fields={componentFields.get(component.id) ?? []}
              units={units}
              components={components}
              detailBase="/specs/library?"
            />
            <AddFieldForm ownerKind="component" ownerId={component.id} categories={CATEGORIES} />
            {archivedFieldsFor(component.id as ComponentId).length > 0 ? (
              <details className="specs-grid__meta">
                <summary>
                  {archivedFieldsFor(component.id as ComponentId).length} archived field(s)
                </summary>
                <ul className="specs-form" aria-label={`${component.name} archived fields`}>
                  {archivedFieldsFor(component.id as ComponentId).map((f) => (
                    <li key={f.id} className="specs-form--row">
                      {f.name}
                      <ArchiveToggle entity="spec_fields" id={f.id} archived label={f.name} />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ))}
        <NewComponentForm />

        {field ? (
          <FieldDetail
            supabase={supabase}
            fieldId={field as SpecFieldId}
            units={units}
            components={components}
            closeHref="/specs/library"
          />
        ) : null}

        {archivedComponents.length > 0 ? (
          <details className="specs-grid__meta">
            <summary>
              {archivedComponents.length} archived component
              {archivedComponents.length > 1 ? 's' : ''}
            </summary>
            <ul className="specs-form" aria-label="Archived components">
              {archivedComponents.map((c) => (
                <li key={c.id} className="specs-form--row">
                  {c.name}
                  <ArchiveToggle entity="components" id={c.id} archived label={c.name} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </AppShell>
  );
}
