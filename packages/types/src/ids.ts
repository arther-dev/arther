import { z } from 'zod';

/**
 * Branded UUID ids. Brands are compile-time only — at runtime these are plain
 * UUID strings, matching the gen_random_uuid() PKs in the migrations.
 */
declare const brand: unique symbol;
export type Branded<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Branded<string, 'UserId'>;
export type WorkspaceId = Branded<string, 'WorkspaceId'>;
export type MembershipId = Branded<string, 'MembershipId'>;
export type InvitationId = Branded<string, 'InvitationId'>;
export type ProductId = Branded<string, 'ProductId'>;
export type ComponentId = Branded<string, 'ComponentId'>;
export type SpecFieldId = Branded<string, 'SpecFieldId'>;
export type FieldVersionId = Branded<string, 'FieldVersionId'>;
export type UnitId = Branded<string, 'UnitId'>;
export type ReleaseId = Branded<string, 'ReleaseId'>;
export type DocumentId = Branded<string, 'DocumentId'>;
export type ProductBriefId = Branded<string, 'ProductBriefId'>;
export type BriefFragmentId = Branded<string, 'BriefFragmentId'>;
export type BrandProfileId = Branded<string, 'BrandProfileId'>;
export type QualityStandardId = Branded<string, 'QualityStandardId'>;
export type DocumentTypeId = Branded<string, 'DocumentTypeId'>;
export type DocumentTypeSectionId = Branded<string, 'DocumentTypeSectionId'>;
export type ApprovalRoleId = Branded<string, 'ApprovalRoleId'>;
export type ApprovalRoleAssignmentId = Branded<string, 'ApprovalRoleAssignmentId'>;
export type DocumentRevisionId = Branded<string, 'DocumentRevisionId'>;
export type PublishedSnapshotId = Branded<string, 'PublishedSnapshotId'>;
export type BlockId = Branded<string, 'BlockId'>;
export type BlockSpecReferenceId = Branded<string, 'BlockSpecReferenceId'>;
export type BlockBriefReferenceId = Branded<string, 'BlockBriefReferenceId'>;
export type PlaceholderBriefReferenceId = Branded<string, 'PlaceholderBriefReferenceId'>;
export type GenerationRunId = Branded<string, 'GenerationRunId'>;
export type GenerationRunSectionId = Branded<string, 'GenerationRunSectionId'>;
export type LibraryItemId = Branded<string, 'LibraryItemId'>;
export type LibraryItemVersionId = Branded<string, 'LibraryItemVersionId'>;
export type SnippetEmbedId = Branded<string, 'SnippetEmbedId'>;
export type VariantId = Branded<string, 'VariantId'>;
export type VariantDeltaId = Branded<string, 'VariantDeltaId'>;

const uuid = z.string().uuid();
export const variantIdSchema = uuid.transform((v) => v as VariantId);
export const variantDeltaIdSchema = uuid.transform((v) => v as VariantDeltaId);
export const userIdSchema = uuid.transform((v) => v as UserId);
export const workspaceIdSchema = uuid.transform((v) => v as WorkspaceId);
export const membershipIdSchema = uuid.transform((v) => v as MembershipId);
export const invitationIdSchema = uuid.transform((v) => v as InvitationId);
export const productIdSchema = uuid.transform((v) => v as ProductId);
export const componentIdSchema = uuid.transform((v) => v as ComponentId);
export const specFieldIdSchema = uuid.transform((v) => v as SpecFieldId);
export const fieldVersionIdSchema = uuid.transform((v) => v as FieldVersionId);
export const unitIdSchema = uuid.transform((v) => v as UnitId);
export const releaseIdSchema = uuid.transform((v) => v as ReleaseId);
export const documentIdSchema = uuid.transform((v) => v as DocumentId);
export const productBriefIdSchema = uuid.transform((v) => v as ProductBriefId);
export const briefFragmentIdSchema = uuid.transform((v) => v as BriefFragmentId);
export const brandProfileIdSchema = uuid.transform((v) => v as BrandProfileId);
export const qualityStandardIdSchema = uuid.transform((v) => v as QualityStandardId);
export const documentTypeIdSchema = uuid.transform((v) => v as DocumentTypeId);
export const documentTypeSectionIdSchema = uuid.transform((v) => v as DocumentTypeSectionId);
export const approvalRoleIdSchema = uuid.transform((v) => v as ApprovalRoleId);
export const approvalRoleAssignmentIdSchema = uuid.transform(
  (v) => v as ApprovalRoleAssignmentId,
);
export const documentRevisionIdSchema = uuid.transform((v) => v as DocumentRevisionId);
export const publishedSnapshotIdSchema = uuid.transform((v) => v as PublishedSnapshotId);
export const blockIdSchema = uuid.transform((v) => v as BlockId);
export const blockSpecReferenceIdSchema = uuid.transform((v) => v as BlockSpecReferenceId);
export const blockBriefReferenceIdSchema = uuid.transform((v) => v as BlockBriefReferenceId);
export const placeholderBriefReferenceIdSchema = uuid.transform(
  (v) => v as PlaceholderBriefReferenceId,
);
export const generationRunIdSchema = uuid.transform((v) => v as GenerationRunId);
export const generationRunSectionIdSchema = uuid.transform((v) => v as GenerationRunSectionId);
export const libraryItemIdSchema = uuid.transform((v) => v as LibraryItemId);
export const snippetEmbedIdSchema = uuid.transform((v) => v as SnippetEmbedId);
