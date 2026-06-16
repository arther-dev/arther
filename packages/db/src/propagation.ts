import type { SupabaseClient } from '@supabase/supabase-js';
import {
  coalesceReviewSections,
  formatFieldValue,
  planFieldPropagation,
  type BlockId,
  type DocumentId,
  type DocumentRevisionId,
  type FieldType,
  type FieldValue,
  type PropagationBlock,
  type ReviewContribution,
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

/**
 * G6.2b — batch propagation for an import commit. One pass for the whole session:
 * a single staleness sweep over every changed field, then per document the stale
 * fields are propagated together and their prose-review sections are **coalesced
 * per (section, assignee)** — so a re-import that moves a dozen values touching
 * one section becomes one review item listing a dozen diffs, not a dozen items.
 * Each affected assignee gets **one digest** dashboard action per document rather
 * than one per field. The structured auto-update (token rewrite + anchor advance)
 * is identical to the single-field path; only the review/notification fan-out is
 * coalesced. Best-effort, behind the import commit; moves onto the durable runner
 * with G1.2. (Cross-document, per-assignee digest delivery is the Feature 6
 * notification system's job — this coalesces the dashboard items it reads.)
 */
export interface BatchPropagationSummary extends PropagationSummary {
  fieldsChanged: number;
  digestsCreated: number;
}

export async function propagateImportBatch(
  service: SupabaseClient,
  scope: WorkspaceScope,
  input: { fieldIds: SpecFieldId[]; changedBy: UserId },
): Promise<BatchPropagationSummary> {
  return scopedServiceQuery(scope, async ({ workspaceId }) => {
    const { changedBy } = input;
    const fieldIds = [...new Set(input.fieldIds)];
    const empty: BatchPropagationSummary = {
      fieldsChanged: 0,
      documentsTouched: 0,
      blocksUpdated: 0,
      reviewItemsCreated: 0,
      digestsCreated: 0,
    };
    if (fieldIds.length === 0) return empty;

    // The changed fields + their current value snapshots.
    const { data: fields, error: fieldsErr } = await service
      .from('spec_fields')
      .select('id, name, category, type, value, unit_id, component_id, current_version_id')
      .in('id', fieldIds)
      .eq('workspace_id', workspaceId);
    if (fieldsErr) throw new Error(`propagateImportBatch.fields: ${fieldsErr.message}`);
    const fieldById = new Map((fields ?? []).map((f) => [f.id as string, f]));

    // Single staleness sweep across every changed field; group by document → field.
    const { data: staleRefs, error: refsErr } = await service
      .from('block_spec_references')
      .select('id, block_id, document_id, field_id, field_version_id')
      .in('field_id', fieldIds)
      .eq('workspace_id', workspaceId);
    if (refsErr) throw new Error(`propagateImportBatch.refs: ${refsErr.message}`);

    type FieldStale = { refIds: string[]; blockIds: Set<string> };
    const byDocument = new Map<string, Map<string, FieldStale>>();
    const staleFieldIds = new Set<string>();
    for (const r of staleRefs ?? []) {
      const field = fieldById.get(r.field_id as string);
      const currentVersionId = field?.current_version_id as string | null | undefined;
      if (!currentVersionId || r.field_version_id === currentVersionId) continue; // current → not stale
      staleFieldIds.add(r.field_id as string);
      const docId = r.document_id as string;
      const perField = byDocument.get(docId) ?? new Map<string, FieldStale>();
      const entry = perField.get(r.field_id as string) ?? { refIds: [], blockIds: new Set<string>() };
      entry.refIds.push(r.id as string);
      entry.blockIds.add(r.block_id as string);
      perField.set(r.field_id as string, entry);
      byDocument.set(docId, perField);
    }
    if (staleFieldIds.size === 0) return { ...empty, fieldsChanged: 0 };

    // Display values for the change records: latest two versions per stale field.
    const { data: units } = await service
      .from('units')
      .select('id, symbol')
      .eq('workspace_id', workspaceId);
    const unitSymbol = new Map((units ?? []).map((u) => [u.id as string, u.symbol as string]));

    const { data: versionRows } = await service
      .from('field_versions')
      .select('id, field_id, value, diff, changed_at')
      .in('field_id', [...staleFieldIds])
      .eq('workspace_id', workspaceId)
      .order('changed_at', { ascending: false });
    const versionsByField = new Map<string, { id: string; value: FieldValue | null; diff: { before?: FieldValue | null } }[]>();
    for (const v of versionRows ?? []) {
      const list = versionsByField.get(v.field_id as string) ?? [];
      list.push({ id: v.id as string, value: v.value as FieldValue | null, diff: (v.diff ?? {}) as { before?: FieldValue | null } });
      versionsByField.set(v.field_id as string, list);
    }

    const componentIds = [...staleFieldIds]
      .map((id) => fieldById.get(id)?.component_id as string | null)
      .filter((c): c is string => Boolean(c));
    const componentName = new Map<string, string>();
    if (componentIds.length > 0) {
      const { data: components } = await service
        .from('components')
        .select('id, name')
        .in('id', componentIds)
        .eq('workspace_id', workspaceId);
      for (const c of components ?? []) componentName.set(c.id as string, c.name as string);
    }

    // One field_change_diffs row per stale field; review items link to these.
    const diffIdByField = new Map<string, string>();
    const displayByField = new Map<string, { oldDisplay: string; newDisplay: string }>();
    for (const fieldId of staleFieldIds) {
      const field = fieldById.get(fieldId)!;
      const type = field.type as FieldType;
      const sym = field.unit_id ? unitSymbol.get(field.unit_id as string) : undefined;
      const versions = versionsByField.get(fieldId) ?? [];
      const current = versions[0];
      const previous = versions[1];
      const oldValue = previous?.value ?? current?.diff.before ?? null;
      const newDisplay = formatFieldValue(type, field.value as FieldValue | null, sym);
      const oldDisplay = formatFieldValue(type, oldValue, sym);
      displayByField.set(fieldId, { oldDisplay, newDisplay });

      const { data: diffRow, error: diffErr } = await service
        .from('field_change_diffs')
        .insert({
          workspace_id: workspaceId,
          field_id: fieldId,
          field_name: field.name,
          component_id: field.component_id,
          component_name: field.component_id ? (componentName.get(field.component_id as string) ?? null) : null,
          old_version_id: previous?.id ?? null,
          new_version_id: field.current_version_id,
          old_display_value: oldDisplay,
          new_display_value: newDisplay,
          changed_by: changedBy,
        })
        .select('id')
        .single();
      if (diffErr) throw new Error(`propagateImportBatch.diff: ${diffErr.message}`);
      diffIdByField.set(fieldId, diffRow.id as string);
    }

    let blocksUpdated = 0;
    let reviewItemsCreated = 0;
    let digestsCreated = 0;
    let documentsTouched = 0;

    for (const [documentId, perField] of byDocument) {
      const { data: doc, error: docErr } = await service
        .from('documents')
        .select('title, current_revision_id')
        .eq('id', documentId)
        .eq('workspace_id', workspaceId)
        .single();
      if (docErr) throw new Error(`propagateImportBatch.doc: ${docErr.message}`);
      const revisionId = doc.current_revision_id as string | null;
      if (!revisionId) continue;
      documentsTouched += 1;

      const { count: snapshotCount } = await service
        .from('published_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', documentId)
        .is('archived_at', null);
      const published = (snapshotCount ?? 0) > 0;

      // Resolve owners for every category this document's changed fields touch.
      const categories = [...new Set([...perField.keys()].map((fid) => fieldById.get(fid)?.category as string))];
      const owners = published
        ? await resolveDomainOwnersForDocument(service, documentId as DocumentId, categories)
        : null;

      const rows = await loadRevisionBlocks(service, revisionId as DocumentRevisionId);
      const blocks: PropagationBlock[] = rows.map((b) => ({ id: b.id, type: b.type, content: b.content }));

      const contributions: ReviewContribution[] = [];
      for (const [fieldId, { refIds, blockIds }] of perField) {
        const field = fieldById.get(fieldId)!;
        const category = field.category as string;
        const { newDisplay } = displayByField.get(fieldId)!;
        const plan = planFieldPropagation({
          blocks,
          staleBlockIds: blockIds,
          fieldId,
          category,
          replacement: { fieldVersionId: field.current_version_id as string, displayValue: newDisplay },
          published,
          ownerForCategory: owners?.get(category)?.ownerUserId ?? null,
          defaultSection: doc.title as string,
        });

        for (const update of plan.blockUpdates) {
          await updateBlock(service, update.blockId as BlockId, {
            content: update.content,
            textContent: update.textContent,
            userId: changedBy,
          });
          blocksUpdated += 1;
        }
        const { error: advanceErr } = await service
          .from('block_spec_references')
          .update({ field_version_id: field.current_version_id })
          .in('id', refIds)
          .eq('workspace_id', workspaceId);
        if (advanceErr) throw new Error(`propagateImportBatch.advance: ${advanceErr.message}`);

        contributions.push({ diffId: diffIdByField.get(fieldId)!, sections: plan.reviewSections });
      }

      // Coalesce per (section, assignee) → one review item each; digest per owner.
      const coalesced = coalesceReviewSections(contributions);
      const firstItemByOwner = new Map<string, string>();
      const sectionsByOwner = new Map<string, number>();
      for (const section of coalesced) {
        const { data: item, error: itemErr } = await service
          .from('section_review_items')
          .insert({
            workspace_id: workspaceId,
            document_id: documentId,
            section_name: section.sectionName,
            field_category: section.category,
            assigned_to: section.ownerUserId,
            field_change_diffs: section.diffIds,
            affected_block_ids: section.blockIds,
          })
          .select('id')
          .single();
        if (itemErr) throw new Error(`propagateImportBatch.reviewItem: ${itemErr.message}`);
        reviewItemsCreated += 1;
        if (section.ownerUserId) {
          if (!firstItemByOwner.has(section.ownerUserId)) firstItemByOwner.set(section.ownerUserId, item.id as string);
          sectionsByOwner.set(section.ownerUserId, (sectionsByOwner.get(section.ownerUserId) ?? 0) + 1);
        }
      }

      // One digest dashboard action per assignee for this document.
      for (const [ownerUserId, sectionCount] of sectionsByOwner) {
        const { error: actionErr } = await service.from('dashboard_action_items').insert({
          workspace_id: workspaceId,
          type: 'section_review',
          assigned_to: ownerUserId,
          reference_id: firstItemByOwner.get(ownerUserId)!,
          title: `Review ${sectionCount} section${sectionCount === 1 ? '' : 's'} — spec values changed on import`,
          context: doc.title as string,
          document_id: documentId,
        });
        if (actionErr) throw new Error(`propagateImportBatch.digest: ${actionErr.message}`);
        digestsCreated += 1;
      }

      if (published) {
        const { data: existing } = await service
          .from('document_review_states')
          .select('triggered_by_field_ids')
          .eq('document_id', documentId)
          .maybeSingle();
        const triggered = new Set<string>([
          ...((existing?.triggered_by_field_ids as string[] | null) ?? []),
          ...perField.keys(),
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
        if (stateErr) throw new Error(`propagateImportBatch.state: ${stateErr.message}`);
      }
    }

    return { fieldsChanged: staleFieldIds.size, documentsTouched, blocksUpdated, reviewItemsCreated, digestsCreated };
  });
}
