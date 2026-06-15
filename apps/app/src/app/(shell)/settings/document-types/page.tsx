import Link from 'next/link';
import {
  getActiveWorkspace,
  getDocumentType,
  listDocumentTypes,
  type DocumentTypeDetail,
} from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import { documentTypeIdSchema } from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import {
  AddSectionDisclosure,
  ArchiveButton,
  CreateDocumentTypeForm,
  ForkButton,
  RenameDocumentTypeForm,
  SectionRowControls,
} from './DocumentTypeForms';

/**
 * Document Types — the generation-schema admin surface (G0.1/G0.2, generator
 * spec §3.4). Built-ins (workspace_id null) are forkable, not editable; a
 * workspace fork or scratch-built type is edited here with bounded structural
 * editing (§7 Q2): rename, archive, and per-section data contracts (category
 * map, brief keys, brief-required, default block types). Admin-only (Settings
 * surface); a `?type=<id>` opens the detail editor for one workspace type.
 */
export default async function DocumentTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Document types"
          description="Generation schemas — what a datasheet or installation manual contains — live here once the environment is provisioned."
        />
      </AppShell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace || !user) {
    return (
      <AppShell>
        <EmptyState
          title="Create your workspace first"
          description="Document types live inside a workspace — set yours up and come back."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/welcome">
              Create workspace
            </Link>
          }
        />
      </AppShell>
    );
  }

  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const { type: typeParam } = await searchParams;
  const selectedId = typeParam ? documentTypeIdSchema.safeParse(typeParam).data : undefined;

  const types = await listDocumentTypes(supabase, workspace.id);
  const builtIns = types.filter((t) => t.built_in);
  const workspaceTypes = types.filter((t) => !t.built_in);

  let detail: DocumentTypeDetail | null = null;
  if (selectedId) detail = await getDocumentType(supabase, selectedId);

  // The detail editor only applies to editable workspace types; built-ins fork.
  if (detail && !detail.built_in && detail.workspace_id === workspace.id) {
    return (
      <AppShell>
        <div className="specs-content">
          <p className="specs-grid__meta">
            <Link href="/settings/document-types">← All document types</Link>
          </p>
          <h1 className="specs-title">{detail.name}</h1>
          {detail.archived_at ? (
            <p className="specs-grid__meta" role="status">
              Archived — new documents can’t use this type. Existing documents are untouched.
            </p>
          ) : null}

          {canManage ? (
            <section className="specs-section">
              <h2 className="specs-section__title">Definition</h2>
              <RenameDocumentTypeForm
                id={detail.id}
                name={detail.name}
                description={detail.description}
              />
              <div className="specs-form--row">
                <ArchiveButton id={detail.id} archived={Boolean(detail.archived_at)} />
              </div>
            </section>
          ) : null}

          <section className="specs-section">
            <h2 className="specs-section__title">Sections ({detail.sections.length})</h2>
            <p className="specs-grid__meta">
              Each section maps spec-field categories and brief-fragment keys to the block types the
              generator produces. Order is the document order.
            </p>
            {detail.sections.length === 0 ? (
              <p className="specs-grid__meta">No sections yet — add the first one below.</p>
            ) : (
              <ol className="specs-form" aria-label="Sections">
                {detail.sections.map((s, i) => (
                  <li key={s.id} className="specs-section">
                    <h3 className="specs-section__title">
                      {i + 1}. {s.name}
                      {s.brief_required ? (
                        <span className="specs-release__tag">brief required</span>
                      ) : null}
                    </h3>
                    <p className="specs-grid__meta">
                      Categories: {s.spec_field_categories.join(', ') || '—'} · Brief keys:{' '}
                      {s.brief_fragment_keys.join(', ') || '—'}
                    </p>
                    <p className="specs-grid__meta">
                      Blocks: {s.default_block_types.join(', ') || '—'}
                    </p>
                    {canManage ? (
                      <SectionRowControls
                        documentTypeId={detail.id}
                        section={s}
                        isFirst={i === 0}
                        isLast={i === detail.sections.length - 1}
                      />
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
            {canManage ? <AddSectionDisclosure documentTypeId={detail.id} /> : null}
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href="/settings">← Workspace settings</Link>
        </p>
        <h1 className="specs-title">Document types</h1>
        <p className="specs-grid__meta">
          A document type is a generation schema — what a good datasheet or installation manual
          contains, and which spec data feeds each section. Fork a built-in to customise it, or
          build one from scratch.
        </p>

        <section className="specs-section">
          <h2 className="specs-section__title">Your document types</h2>
          {workspaceTypes.length === 0 ? (
            <p className="specs-grid__meta">
              None yet — fork a built-in below or create one from scratch.
            </p>
          ) : (
            <ul className="specs-form" aria-label="Workspace document types">
              {workspaceTypes.map((t) => (
                <li key={t.id} className="specs-release">
                  <Link href={`/settings/document-types?type=${t.id}`}>{t.name}</Link>
                  <span className="specs-grid__meta">
                    {t.section_count} section{t.section_count === 1 ? '' : 's'}
                  </span>
                  {t.archived_at ? <span className="specs-release__tag">archived</span> : null}
                </li>
              ))}
            </ul>
          )}
          {canManage ? <CreateDocumentTypeForm /> : null}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Built-in types</h2>
          <p className="specs-grid__meta">
            Maintained by Arther and improved over time — fork one to get an editable workspace copy
            (the original stays canonical).
          </p>
          <ul className="specs-form" aria-label="Built-in document types">
            {builtIns.map((t) => (
              <li key={t.id} className="specs-release">
                <span>{t.name}</span>
                {t.description ? <span className="specs-grid__meta">{t.description}</span> : null}
                <span className="specs-grid__meta">
                  {t.section_count} section{t.section_count === 1 ? '' : 's'}
                </span>
                {canManage ? <ForkButton sourceId={t.id} /> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
