'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createCanDo } from '@arther/authz';
import {
  createGenerationRun,
  createServiceClient,
  getActiveWorkspace,
  getDocumentType,
  membershipLookupFor,
} from '@arther/db';
import { type DocumentTypeId, type ProductId, type UserId } from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

export interface GenerateFormState {
  error?: string;
}

const schema = z.object({
  productId: z.string().uuid(),
  documentTypeId: z.string().uuid(),
  brandProfileId: z.string().uuid().optional().or(z.literal('')),
});

/**
 * G2.1 — confirm pre-flight and queue generation. The author is authorized via
 * canDo('doc.generate') (editor-gated), then the run is written through the
 * SERVICE client (generation_runs is service-role-only, G1.4) with a section
 * scaffold mirroring the Document Type. The durable processor that turns a
 * queued run into a Draft lands at G2.2; until then the run stays `queued`.
 */
export async function createGenerationRunAction(
  _prev: GenerateFormState,
  formData: FormData,
): Promise<GenerateFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Pick a product and a Document Type.' };

  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet — create one first.' };

  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, 'doc.generate', { workspaceId: workspace.id }))) {
    return { error: 'Viewers can’t generate documents — ask for an Editor seat.' };
  }

  const type = await getDocumentType(supabase, parsed.data.documentTypeId as DocumentTypeId);
  if (!type || type.archived_at) return { error: 'That Document Type is unavailable.' };
  if (type.sections.length === 0) {
    return { error: 'That Document Type has no sections to generate yet.' };
  }

  let runId: string;
  try {
    const service = createServiceClient();
    const { run } = await createGenerationRun(
      service,
      { workspaceId: workspace.id },
      {
        productId: parsed.data.productId as ProductId,
        documentTypeId: parsed.data.documentTypeId as DocumentTypeId,
        brandProfileId: parsed.data.brandProfileId || undefined,
        kind: 'document',
        sections: type.sections.map((section) => ({
          name: section.name,
          documentTypeSectionId: section.id,
          displayOrder: section.display_order,
        })),
        requestedBy: user.id as UserId,
      },
    );
    runId = run.id;
  } catch {
    return { error: 'Could not queue generation.' };
  }

  redirect(
    `/specs/generate?product=${parsed.data.productId}&type=${parsed.data.documentTypeId}&run=${runId}`,
  );
}
