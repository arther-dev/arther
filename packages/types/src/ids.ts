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

const uuid = z.string().uuid();
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
