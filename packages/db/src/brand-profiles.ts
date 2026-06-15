import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BrandGlossary,
  BrandProfileId,
  BrandTypography,
  UnitPreference,
  UserId,
  WorkspaceId,
} from '@arther/types';

/**
 * G0.4 Brand Profiles repository — thin, typed calls over the user-JWT client
 * (RLS active; the 0004 write policy is owner/admin, matching canDo
 * 'workspace.manage'). Brand Profiles are a single-table Settings surface, so no
 * RPC is needed; the two multi-row operations (the workspace-default toggle and
 * archiving the current default) are sequenced so the
 * `brand_profiles_one_default_idx` partial unique index is never violated —
 * defaults are cleared *before* a new one is set, so the intermediate state is
 * zero-default (allowed), never two-default (rejected).
 */

export interface BrandProfileRow {
  id: BrandProfileId;
  name: string;
  is_workspace_default: boolean;
  logo_url: string | null;
  primary_colour: string | null;
  typography: BrandTypography;
  voice_descriptors: string[];
  tone_notes: string | null;
  glossary: BrandGlossary;
  unit_preference: UnitPreference;
  archived_at: string | null;
  /** How many Document Types name this profile as their default (spec §7.1). */
  referenced_by: number;
}

export interface BrandProfileInput {
  name: string;
  logoUrl: string | null;
  primaryColour: string | null;
  typography: BrandTypography;
  voiceDescriptors: string[];
  toneNotes: string | null;
  glossary: BrandGlossary;
  unitPreference: UnitPreference;
}

const COLUMNS =
  'id, name, is_workspace_default, logo_url, primary_colour, typography, voice_descriptors, tone_notes, glossary, unit_preference, archived_at';

function toRow(raw: Record<string, unknown>, referencedBy: number): BrandProfileRow {
  return {
    id: raw.id as BrandProfileId,
    name: raw.name as string,
    is_workspace_default: Boolean(raw.is_workspace_default),
    logo_url: (raw.logo_url as string | null) ?? null,
    primary_colour: (raw.primary_colour as string | null) ?? null,
    typography: (raw.typography as BrandTypography) ?? {},
    voice_descriptors: (raw.voice_descriptors as string[]) ?? [],
    tone_notes: (raw.tone_notes as string | null) ?? null,
    glossary: (raw.glossary as BrandGlossary) ?? { preferred_terms: {}, prohibited_terms: [] },
    unit_preference: raw.unit_preference as UnitPreference,
    archived_at: (raw.archived_at as string | null) ?? null,
    referenced_by: referencedBy,
  };
}

/** Live (non-archived) profiles for the workspace, default first, with reference counts. */
export async function listBrandProfiles(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<BrandProfileRow[]> {
  const { data, error } = await client
    .from('brand_profiles')
    .select(COLUMNS)
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('is_workspace_default', { ascending: false })
    .order('name');
  if (error) throw new Error(`listBrandProfiles: ${error.message}`);

  const counts = await defaultReferenceCounts(client, workspaceId);
  return (data ?? []).map((raw) =>
    toRow(raw as Record<string, unknown>, counts.get((raw as { id: string }).id) ?? 0),
  );
}

export async function listArchivedBrandProfiles(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<BrandProfileRow[]> {
  const { data, error } = await client
    .from('brand_profiles')
    .select(COLUMNS)
    .eq('workspace_id', workspaceId)
    .not('archived_at', 'is', null)
    .order('name');
  if (error) throw new Error(`listArchivedBrandProfiles: ${error.message}`);
  return (data ?? []).map((raw) => toRow(raw as Record<string, unknown>, 0));
}

export async function getBrandProfile(
  client: SupabaseClient,
  id: BrandProfileId,
): Promise<BrandProfileRow | null> {
  const { data, error } = await client
    .from('brand_profiles')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getBrandProfile: ${error.message}`);
  return data ? toRow(data as Record<string, unknown>, 0) : null;
}

/** Map of brand_profile_id → number of Document Types defaulting to it (live types only). */
async function defaultReferenceCounts(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<Map<string, number>> {
  const { data, error } = await client
    .from('document_types')
    .select('default_brand_profile_id')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .not('default_brand_profile_id', 'is', null);
  if (error) throw new Error(`defaultReferenceCounts: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const id = (row as { default_brand_profile_id: string }).default_brand_profile_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function columnsFor(input: BrandProfileInput) {
  return {
    name: input.name,
    logo_url: input.logoUrl,
    primary_colour: input.primaryColour,
    typography: input.typography,
    voice_descriptors: input.voiceDescriptors,
    tone_notes: input.toneNotes,
    glossary: input.glossary,
    unit_preference: input.unitPreference,
  };
}

/**
 * Create a profile. The first profile in a workspace becomes the workspace
 * default automatically (spec §7.3: a workspace can never have zero profiles,
 * and the first created is the default).
 */
export async function createBrandProfile(
  client: SupabaseClient,
  input: BrandProfileInput & { workspaceId: WorkspaceId; createdBy: UserId },
): Promise<BrandProfileId> {
  const { count, error: countError } = await client
    .from('brand_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', input.workspaceId)
    .is('archived_at', null);
  if (countError) throw new Error(`createBrandProfile: ${countError.message}`);
  const isFirst = (count ?? 0) === 0;

  const { data, error } = await client
    .from('brand_profiles')
    .insert({
      workspace_id: input.workspaceId,
      is_workspace_default: isFirst,
      created_by: input.createdBy,
      updated_by: input.createdBy,
      ...columnsFor(input),
    })
    .select('id')
    .single();
  if (error) throw new Error(`createBrandProfile: ${error.message}`);
  return data.id as BrandProfileId;
}

export async function updateBrandProfile(
  client: SupabaseClient,
  input: BrandProfileInput & { id: BrandProfileId; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('brand_profiles')
    .update({ updated_by: input.updatedBy, ...columnsFor(input) })
    .eq('id', input.id);
  if (error) throw new Error(`updateBrandProfile: ${error.message}`);
}

/**
 * Make `id` the workspace default. Clears any existing default first so the
 * partial unique index never sees two simultaneous defaults; a re-default of the
 * already-default profile is a no-op the index tolerates.
 */
export async function setDefaultBrandProfile(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; id: BrandProfileId; updatedBy: UserId },
): Promise<void> {
  const cleared = await client
    .from('brand_profiles')
    .update({ is_workspace_default: false, updated_by: input.updatedBy })
    .eq('workspace_id', input.workspaceId)
    .eq('is_workspace_default', true)
    .neq('id', input.id);
  if (cleared.error) throw new Error(`setDefaultBrandProfile: ${cleared.error.message}`);

  const set = await client
    .from('brand_profiles')
    .update({ is_workspace_default: true, updated_by: input.updatedBy })
    .eq('id', input.id);
  if (set.error) throw new Error(`setDefaultBrandProfile: ${set.error.message}`);
}

/**
 * Archive a profile. Refuses to archive the last live profile (a workspace can
 * never have zero — spec §7.3). When archiving the current default while others
 * remain, promotes the next profile (alphabetical) to default first so the
 * workspace is never left default-less.
 */
export async function archiveBrandProfile(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; id: BrandProfileId; archivedBy: UserId },
): Promise<{ blocked?: 'last-profile' }> {
  const live = await listBrandProfiles(client, input.workspaceId);
  const target = live.find((p) => p.id === input.id);
  if (!target) return {};
  if (live.length <= 1) return { blocked: 'last-profile' };

  if (target.is_workspace_default) {
    const next = live.find((p) => p.id !== input.id);
    if (next)
      await setDefaultBrandProfile(client, {
        workspaceId: input.workspaceId,
        id: next.id,
        updatedBy: input.archivedBy,
      });
  }

  const { error } = await client
    .from('brand_profiles')
    .update({
      archived_at: new Date().toISOString(),
      archived_by: input.archivedBy,
      is_workspace_default: false,
      updated_by: input.archivedBy,
    })
    .eq('id', input.id);
  if (error) throw new Error(`archiveBrandProfile: ${error.message}`);
  return {};
}

export async function restoreBrandProfile(
  client: SupabaseClient,
  input: { id: BrandProfileId; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('brand_profiles')
    .update({ archived_at: null, archived_by: null, updated_by: input.updatedBy })
    .eq('id', input.id);
  if (error) throw new Error(`restoreBrandProfile: ${error.message}`);
}
