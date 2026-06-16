import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatFieldValue,
  planFieldPropagation,
  type BlockId,
  type DocumentId,
  type DocumentRevisionId,
  type FieldType,
  type FieldValue,
  type PropagationBlock,
  type SpecFieldId,
  type UserId,
} from '@arther/types';
import { scopedServiceQuery, type WorkspaceScope } from './guard';
import { loadRevisionBlocks, updateBlock } from './documents';
import { resolveDomainOwnersForDocument } from './domain-ownership';

/**
 * G6.2 — two-speed propagation (Smart Spec Tracking, architecture §5.2). After a
 * field value advances (a new `field_versions` row + moved `current_version_id`),
 * every document that cites the field is brought up to date in its WORKING COPY:
 *
 *   • inline spec tokens get the new value snapshot (both speeds);
 *   • the stale `block_spec_references` anchors advance to the current version,
 *     so spec tables/charts (live views) and the G6.1 staleness banner clear;
 *   • for PUBLISHED documents, stale PROSE sections become `section_review_items`
 *     routed to the resolved domain owner (G6.3) + a `dashboard_action_items`
 *     row, and the document flips to `needs_review`. Draft documents get the
 *     silent auto-update only (spec §4, line 486).
 *
 * Published snapshots are never touched — propagation writes only to `blocks` in
 * the current revision (invariant 5 / G6.7). Runs under the service role with an
 * explicit workspace scope (guardrail 1); the heavy classification + token
 * rewrite is the pure `@arther/types` engine. Single-field path — bulk re-imports
 * batch through their own `propagate-batch` (G6.2b, deferred).
 *
 * Inline today (like generation), behind the field-save action; it moves onto the
 * Trigger.dev durable runner once that is provisioned (G1.2).
 */
export interface PropagationSummary {
  documentsTouched: number;
  blocksUpdated: number;
  reviewItemsCreated: number;
}

const NONE: PropagationSummary = { documentsTouched: 0, blocksUpdated: 0, reviewItemsCreated: 0 };

export async function propagateFieldChange(
  service: SupabaseClient,
  scope: WorkspaceScope,
  input: { fieldId: SpecFieldId; changedBy: UserId },
): Promise<PropagationSummary> {
  return scopedServiceQuery(scope, async ({ workspaceId }) => {
    const { fieldId, changedBy } = input;

    // The field + its current value snapshot.
    const { data: field, error: fieldErr } = await service
      .from('spec_fields')
      .select('name, category, type, value, unit_id, component_id, current_version_id')
      .eq('id', fieldId)
      .eq('workspace_id', workspaceId)
      .single();
    if (fieldErr) throw new Error(`propagateFieldChange.field: ${fieldErr.message}`);
    const currentVersionId = field.current_version_id as string | null;
    if (!currentVersionId) return NONE; // no value yet → nothing cites a version

    // The blocks whose anchored version is no longer current — grouped by document.
    const { data: staleRefs, error: refsErr } = await service
      .from('block_spec_references')
      .select('id, block_id, document_id')
      .eq('workspace_id', workspaceId)
      .eq('field_id', fieldId)
      .neq('field_version_id', currentVersionId);
    if (refsErr) throw new Error(`propagateFieldChange.refs: ${refsErr.message}`);
    if (!staleRefs || staleRefs.length === 0) return NONE;

    const byDocument = new Map<string, { refIds: string[]; blockIds: Set<string> }>();
    for (const r of staleRefs) {
      const docId = r.document_id as string;
      const entry = byDocument.get(docId) ?? { refIds: [], blockIds: new Set<string>() };
      entry.refIds.push(r.id as string);
      entry.blockIds.add(r.block_id as string);
      byDocument.set(docId, entry);
    }

    // Old/new display values for the change record (the "what changed" panel).
    const { data: units } = await service
      .from('units')
      .select('id, symbol')
      .eq('workspace_id', workspaceId);
    const unitSymbol = new Map((units ?? []).map((u) => [u.id as string, u.symbol as string]));
    const sym = field.unit_id ? unitSymbol.get(field.unit_id as string) : undefined;
    const type = field.type as FieldType;

    const { data: versions } = await service
      .from('field_versions')
      .select('id, value, diff')
      .eq('field_id', fieldId)
      .eq('workspace_id', workspaceId)
      .order('changed_at', { ascending: false })
      .limit(2);
    const current = versions?.[0];
    const previous = versions?.[1];
    const diff = (current?.diff ?? {}) as { before?: FieldValue | null };
    const oldValue = (previous?.value as FieldValue | null) ?? diff.before ?? null;
    const newDisplay = formatFieldValue(type, field.value as FieldValue | null, sym);
    const oldDisplay = formatFieldValue(type, oldValue, sym);

    let componentName: string | null = null;
    if (field.component_id) {
      const { data: component } = await service
        .from('components')
        .select('name')
        .eq('id', field.component_id as string)
        .single();
      componentName = (component?.name as string | null) ?? null;
    }

    // The change record — one per propagated field change; review items link to it.
    const { data: diffRow, error: diffErr } = await service
      .from('field_change_diffs')
      .insert({
        workspace_id: workspaceId,
        field_id: fieldId,
        field_name: field.name,
        component_id: field.component_id,
        component_name: componentName,
        old_version_id: previous?.id ?? null,
        new_version_id: currentVersionId,
        old_display_value: oldDisplay,
        new_display_value: newDisplay,
        changed_by: changedBy,
      })
      .select('id')
      .single();
    if (diffErr) throw new Error(`propagateFieldChange.diff: ${diffErr.message}`);
    const diffId = diffRow.id as string;

    const replacement = { fieldVersionId: currentVersionId, displayValue: newDisplay };
    const category = field.category as string;
    let blocksUpdated = 0;
    let reviewItemsCreated = 0;

    for (const [documentId, { refIds, blockIds }] of byDocument) {
      const { data: doc, error: docErr } = await service
        .from('documents')
        .select('title, current_revision_id')
        .eq('id', documentId)
        .eq('workspace_id', workspaceId)
        .single();
      if (docErr) throw new Error(`propagateFieldChange.doc: ${docErr.message}`);
      const revisionId = doc.current_revision_id as string | null;
      if (!revisionId) continue; // no working copy yet

      // "Needs review" applies to published documents only (spec §3.2).
      const { count: snapshotCount } = await service
        .from('published_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', documentId)
        .is('archived_at', null);
      const published = (snapshotCount ?? 0) > 0;

      const owners = published
        ? await resolveDomainOwnersForDocument(service, documentId as DocumentId, [category])
        : null;
      const ownerForCategory = owners?.get(category)?.ownerUserId ?? null;

      const rows = await loadRevisionBlocks(service, revisionId as DocumentRevisionId);
      const blocks: PropagationBlock[] = rows.map((b) => ({ id: b.id, type: b.type, content: b.content }));

      const plan = planFieldPropagation({
        blocks,
        staleBlockIds: blockIds,
        fieldId,
        category,
        replacement,
        published,
        ownerForCategory,
        defaultSection: doc.title as string,
      });

      // Structured auto-update: rewrite the inline tokens in the working copy …
      for (const update of plan.blockUpdates) {
        await updateBlock(service, update.blockId as BlockId, {
          content: update.content,
          textContent: update.textContent,
          userId: changedBy,
        });
        blocksUpdated += 1;
      }
      // … and advance every stale anchor (covers spec tables/charts with no inline token).
      const { error: advanceErr } = await service
        .from('block_spec_references')
        .update({ field_version_id: currentVersionId })
        .in('id', refIds)
        .eq('workspace_id', workspaceId);
      if (advanceErr) throw new Error(`propagateFieldChange.advance: ${advanceErr.message}`);

      // Prose path (published only): flag sections + raise dashboard items + needs_review.
      for (const section of plan.reviewSections) {
        const { data: item, error: itemErr } = await service
          .from('section_review_items')
          .insert({
            workspace_id: workspaceId,
            document_id: documentId,
            section_name: section.sectionName,
            field_category: section.category,
            assigned_to: section.ownerUserId,
            field_change_diffs: [diffId],
            affected_block_ids: section.blockIds,
          })
          .select('id')
          .single();
        if (itemErr) throw new Error(`propagateFieldChange.reviewItem: ${itemErr.message}`);
        reviewItemsCreated += 1;

        if (section.ownerUserId) {
          const { error: actionErr } = await service.from('dashboard_action_items').insert({
            workspace_id: workspaceId,
            type: 'section_review',
            assigned_to: section.ownerUserId,
            reference_id: item.id,
            title: `Review "${section.sectionName}" — ${field.name} changed`,
            context: `${oldDisplay} → ${newDisplay}`,
            document_id: documentId,
          });
          if (actionErr) throw new Error(`propagateFieldChange.action: ${actionErr.message}`);
        }
      }

      if (published) {
        const { data: existing } = await service
          .from('document_review_states')
          .select('triggered_by_field_ids')
          .eq('document_id', documentId)
          .maybeSingle();
        const triggered = new Set<string>([
          ...((existing?.triggered_by_field_ids as string[] | null) ?? []),
          fieldId,
        ]);
        const { error: stateErr } = await service.from('document_review_states').upsert(
          {
            workspace_id: workspaceId,
            document_id: documentId,
            state: 'needs_review',
            triggered_at: new Date().toISOString(),
            triggered_by_field_ids: [...triggered],
          },
          { onConflict: 'document_id' },
        );
        if (stateErr) throw new Error(`propagateFieldChange.state: ${stateErr.message}`);
      }
    }

    return { documentsTouched: byDocument.size, blocksUpdated, reviewItemsCreated };
  });
}
