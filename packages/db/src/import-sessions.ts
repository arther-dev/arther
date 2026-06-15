import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductId, UserId, WorkspaceId } from '@arther/types';
import { rpcError } from './errors';
import type {
  CurrentSpecState,
  ExistingField,
  ImportDecisions,
  ImportWarning,
  InterpretedImport,
  NormalizedImport,
  PlannedMutation,
} from '@arther/spec-import';

/**
 * F7.7 — import sessions: the dry-run state machine persisted server-side
 * (upload → interpreting → proposed → committed/failed/discarded) so a
 * refresh never loses the proposal and committed decisions stay auditable.
 * RLS: members read, editors create/update, nobody deletes (audit trail).
 */

export type ImportSessionStatus =
  | 'uploaded'
  | 'interpreting'
  | 'proposed'
  | 'committing'
  | 'committed'
  | 'discarded'
  | 'failed';

/** What interpretation stored: the raw model output + its normalisation. */
export interface ImportInterpretation {
  interpreted: InterpretedImport;
  normalized: NormalizedImport;
  warnings: ImportWarning[];
}

export interface ImportSessionRow {
  id: string;
  workspace_id: WorkspaceId;
  target_product_id: ProductId | null;
  status: ImportSessionStatus;
  source_filename: string | null;
  file_storage_key: string | null;
  interpreted_structure: ImportInterpretation | null;
  proposed_mutations: PlannedMutation[];
  decisions: ImportDecisions | Record<string, never>;
  error: string | null;
  committed_at: string | null;
  created_by: UserId | null;
  created_at: string;
}

const SESSION_COLUMNS =
  'id, workspace_id, target_product_id, status, source_filename, file_storage_key, interpreted_structure, proposed_mutations, decisions, error, committed_at, created_by, created_at';

export async function createImportSession(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    targetProductId?: ProductId;
    filename: string;
    storageKey?: string;
    createdBy: UserId;
  },
): Promise<string> {
  const { data, error } = await client
    .from('import_sessions')
    .insert({
      workspace_id: input.workspaceId,
      target_product_id: input.targetProductId ?? null,
      status: 'uploaded',
      source_filename: input.filename,
      file_storage_key: input.storageKey ?? null,
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createImportSession: ${error.message}`);
  return data.id as string;
}

export async function getImportSession(
  client: SupabaseClient,
  id: string,
): Promise<ImportSessionRow | null> {
  const { data, error } = await client
    .from('import_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getImportSession: ${error.message}`);
  return (data as ImportSessionRow | null) ?? null;
}

/** Recent sessions for the upload screen's history list, newest first. */
export async function listImportSessions(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
  limit = 10,
): Promise<ImportSessionRow[]> {
  const { data, error } = await client
    .from('import_sessions')
    .select(SESSION_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listImportSessions: ${error.message}`);
  return (data ?? []) as ImportSessionRow[];
}

export async function updateImportSession(
  client: SupabaseClient,
  id: string,
  patch: {
    status?: ImportSessionStatus;
    interpretation?: ImportInterpretation;
    proposedMutations?: PlannedMutation[];
    decisions?: ImportDecisions;
    error?: string | null;
    userId: UserId;
  },
): Promise<void> {
  const row: Record<string, unknown> = { updated_by: patch.userId };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.interpretation !== undefined) row.interpreted_structure = patch.interpretation;
  if (patch.proposedMutations !== undefined) row.proposed_mutations = patch.proposedMutations;
  if (patch.decisions !== undefined) row.decisions = patch.decisions;
  if (patch.error !== undefined) row.error = patch.error;
  const { error } = await client.from('import_sessions').update(row).eq('id', id);
  if (error) throw new Error(`updateImportSession: ${error.message}`);
}

/** F7.6 — the 0015 RPC: applies the stored plan atomically, returns the product. */
export async function commitImportSession(
  client: SupabaseClient,
  sessionId: string,
): Promise<ProductId> {
  const { data, error } = await client.rpc('commit_import_session', {
    p_session_id: sessionId,
  });
  if (error) throw rpcError('commitImportSession', error);
  return data as ProductId;
}

/**
 * The reconciler's view of what already exists: the target product (re-import)
 * with its fields, plus every workspace component whose name the incoming
 * payload mentions — with fields and an attached-to-target flag.
 */
export async function loadCurrentSpecState(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    targetProductId: ProductId | null;
    componentNames: string[];
  },
): Promise<CurrentSpecState> {
  let product: CurrentSpecState['product'] = null;
  if (input.targetProductId) {
    const { data, error } = await client
      .from('products')
      .select('id, name')
      .eq('id', input.targetProductId)
      .maybeSingle();
    if (error) throw new Error(`loadCurrentSpecState: ${error.message}`);
    if (data) {
      const { data: fields, error: fieldsError } = await client
        .from('spec_fields')
        .select('id, name, type, value')
        .eq('product_id', data.id)
        .is('archived_at', null);
      if (fieldsError) throw new Error(`loadCurrentSpecState: ${fieldsError.message}`);
      product = {
        id: data.id as string,
        name: data.name as string,
        fields: (fields ?? []) as ExistingField[],
      };
    }
  }

  const wanted = new Set(input.componentNames.map((n) => n.trim().toLowerCase()));
  const { data: components, error: componentsError } = await client
    .from('components')
    .select('id, name')
    .eq('workspace_id', input.workspaceId)
    .is('archived_at', null);
  if (componentsError) throw new Error(`loadCurrentSpecState: ${componentsError.message}`);
  const relevant = (components ?? []).filter((c) =>
    wanted.has((c.name as string).trim().toLowerCase()),
  );

  const attached = new Set<string>();
  if (input.targetProductId) {
    const { data: edges, error: edgesError } = await client
      .from('product_components')
      .select('component_id')
      .eq('product_id', input.targetProductId);
    if (edgesError) throw new Error(`loadCurrentSpecState: ${edgesError.message}`);
    for (const e of edges ?? []) attached.add(e.component_id as string);
  }

  const fieldsByComponent = new Map<string, ExistingField[]>();
  if (relevant.length > 0) {
    const { data: fields, error: fieldsError } = await client
      .from('spec_fields')
      .select('id, name, type, value, component_id')
      .in(
        'component_id',
        relevant.map((c) => c.id as string),
      )
      .is('archived_at', null);
    if (fieldsError) throw new Error(`loadCurrentSpecState: ${fieldsError.message}`);
    for (const f of (fields ?? []) as Array<ExistingField & { component_id: string }>) {
      const list = fieldsByComponent.get(f.component_id) ?? [];
      list.push(f);
      fieldsByComponent.set(f.component_id, list);
    }
  }

  return {
    product,
    components: relevant.map((c) => ({
      id: c.id as string,
      name: c.name as string,
      attached: attached.has(c.id as string),
      fields: fieldsByComponent.get(c.id as string) ?? [],
    })),
  };
}
