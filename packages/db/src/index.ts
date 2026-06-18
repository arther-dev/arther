export { createServiceClient, createUserClient } from './client';
export { DbRuleError, rpcError } from './errors';
export { runReviewReminders } from './review-reminders';
export {
  dispatchNotification,
  getNotificationFeed,
  listNotificationPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  membershipUserIds,
  setNotificationPreference,
  workspaceMemberUserIds,
  type NotificationFeed,
  type StoredNotificationPreference,
} from './notifications';
export {
  addCommentReply,
  carryForwardComments,
  createCommentThread,
  getCommentThreadMeta,
  listCommentThreads,
  listRevisionCommenterIds,
  listThreadParticipantIds,
  orphanBlockThreads,
  orphanStaleTextAnchors,
  reopenCommentThread,
  resolveCommentThread,
  type CommentThreadMeta,
  type CommentThreadView,
  type CommentView,
} from './comments';
export {
  createDocumentType,
  createSection,
  deleteSection,
  forkDocumentType,
  getDocumentType,
  listDocumentTypes,
  reorderSections,
  setDocumentTypeArchived,
  updateDocumentType,
  updateSection,
  type DocumentTypeDetail,
  type DocumentTypeRow,
  type DocumentTypeSectionRow,
} from './document-types';
export {
  assignApprovalRole,
  createApprovalRole,
  deleteApprovalRole,
  listApprovalRoles,
  unassignApprovalRole,
  updateApprovalRole,
  type ApprovalRoleAssignmentRow,
  type ApprovalRoleRow,
} from './approval-roles';
export {
  addComponentToProduct,
  addFieldComment,
  clearComponentOverride,
  createComponent,
  createProduct,
  createRelease,
  createSpecField,
  deleteRelease,
  getActiveWorkspace,
  getSpecField,
  listArchived,
  listArchivedFields,
  listComponents,
  listFieldComments,
  listFieldsForComponents,
  listFieldsForProduct,
  listFieldVersions,
  listOverridesForProduct,
  listProductComponents,
  listProducts,
  listReferenceEdges,
  listReleases,
  listReleasesForProduct,
  listUnits,
  listUsersByIds,
  membershipLookupFor,
  moveSpecFieldOrder,
  setArchived,
  setComponentOverride,
  updateFieldValue,
  type ActiveWorkspace,
  type ArchivedRow,
  type ComponentRow,
  type FieldCommentRow,
  type FieldVersionRow,
  type OverrideRow,
  type ProductComponentEdge,
  type ProductRow,
  type ReleaseRow,
  type SpecFieldRow,
  type UnitRow,
} from './spec';
export {
  deleteBriefFragment,
  getEntityBrief,
  listBriefKeyUsage,
  upsertBriefFragment,
  type BriefFragmentRow,
  type BriefKeyUsage,
  type EntityBrief,
} from './briefs';
export {
  addBriefReference,
  addPlaceholderReference,
  addSpecReference,
  createDocument,
  deleteBlock,
  getDocument,
  getRevision,
  insertBlocks,
  listDocumentsForProduct,
  listSpecReferences,
  listStaleSpecReferences,
  loadDocumentTree,
  loadRevisionBlocks,
  reorderBlocks,
  saveBlockContent,
  setDocumentArchived,
  updateBlock,
  type BlockRow,
  type BlockSaveOutcome,
  type BlockSpecReferenceRow,
  type DocumentRevisionRow,
  type DocumentRow,
  type DocumentTree,
  type StaleSpecReference,
} from './documents';
export {
  createDocumentRevision,
  transitionDocumentRevision,
  type TransitionOutcome,
} from './document-lifecycle';
export {
  listApprovalRecords,
  overrideApproval,
  recordApproval,
  type ApprovalRecordRow,
} from './approvals';
export {
  loadEditContextForBlock,
  loadEditContextForRevision,
  type EditContext,
} from './edit-authz';
export { recordAuditEvent, type AuditEvent } from './audit';
export {
  archiveDocumentSnapshots,
  listSnapshotsForDocument,
  publishDocument,
  restoreLatestSnapshot,
  type PublishedSnapshotRow,
} from './snapshots';
export {
  getGatedPortalDocument,
  getPortalDocument,
  getPortalWorkspace,
  listPortalPublishedDocuments,
  listSitemapEntries,
  resolvePortalDocumentRef,
  searchPortalDocuments,
  type PortalDocument,
  type PortalDocumentListing,
  type PortalDocumentRef,
  type PortalSearchHit,
  type PortalWorkspace,
  type SitemapEntry,
} from './portal';
export {
  issueMagicLink,
  listDocumentMagicLinks,
  logMagicLinkAccess,
  revokeMagicLink,
  setDocumentAccess,
  validateMagicLink,
  type IssuedMagicLink,
  type MagicLinkSummary,
  type ValidatedMagicLink,
} from './magic-links';
export {
  createGenerationRun,
  getGenerationRun,
  listGenerationRunsForProduct,
  setGenerationRunStatus,
  setGenerationSectionStatus,
  type GenerationRunRow,
  type GenerationRunSectionRow,
  type GenerationRunWithSections,
} from './generation-runs';
export { listPreflightFields } from './generation-preflight';
export { commitGeneration, type GenerationCommitBlock } from './generation-commit';
export { loadGenerationFields, type GenerationFieldRow } from './generation-context';
export {
  listStaleReferencesForDocument,
  listStaleBriefReferencesForDocument,
  type StaleReference,
  type StaleBriefReference,
} from './staleness';
export { getFieldChangeImpact } from './field-impact';
export {
  applyBlockRegeneration,
  loadBlockRegenContext,
  type BlockRegenContext,
} from './block-regeneration';
export { resolveSpecFields } from './spec-table-resolve';
export { getSpecCoverageForProduct } from './coverage';
export {
  searchWorkspace,
  type ComponentHit,
  type DocumentHit,
  type SpecFieldHit,
  type WorkspaceSearchResults,
} from './search';
export {
  listPlaceholdersForFragment,
  clearPlaceholder,
  type PlaceholderForFill,
} from './placeholders';
export {
  createLibraryItem,
  getLibraryItem,
  listLibraryItems,
  renameLibraryItem,
  setLibraryItemArchived,
  type LibraryItemDetail,
  type LibraryItemRow,
  type LibraryItemVersionRow,
} from './library';
export {
  expandSnippetsForPublish,
  insertSnippetEmbed,
  type InsertedSnippetEmbed,
  type InsertSnippetEmbedError,
} from './snippet-embeds';
export {
  recordAnalyticsEvent,
  recordPortalEvent,
  type AnalyticsEvent,
  type AnalyticsEventType,
  type PortalAnalyticsEvent,
  type PortalAnalyticsEventType,
} from './analytics';
export {
  resolveDomainOwnersForDocument,
  type ResolvedCategoryOwner,
} from './domain-ownership';
export {
  propagateFieldChange,
  propagateImportBatch,
  type BatchPropagationSummary,
  type PropagationSummary,
} from './propagation';
export {
  assertWorkspaceScope,
  MissingWorkspaceScopeError,
  scopedServiceQuery,
  type WorkspaceScope,
} from './guard';
export {
  commitImportSession,
  createImportSession,
  getImportSession,
  listImportSessions,
  loadCurrentSpecState,
  updateImportSession,
  type ImportInterpretation,
  type ImportSessionRow,
  type ImportSessionStatus,
} from './import-sessions';
export {
  archiveBrandProfile,
  createBrandProfile,
  getBrandProfile,
  listArchivedBrandProfiles,
  listBrandProfiles,
  restoreBrandProfile,
  setDefaultBrandProfile,
  updateBrandProfile,
  type BrandProfileInput,
  type BrandProfileRow,
} from './brand-profiles';
export {
  createQualityStandard,
  deleteQualityStandard,
  getQualityStandard,
  listQualityStandards,
  updateQualityStandard,
  type QualityStandardInput,
  type QualityStandardRow,
} from './quality-standards';
export {
  acceptInvitation,
  cancelWorkspaceDeletion,
  createInvitation,
  getInvitation,
  getPendingWorkspaceDeletion,
  listInvitations,
  listMembers,
  removeMember,
  requestWorkspaceDeletion,
  revokeInvitation,
  transferOwnership,
  updateMemberRole,
  updateWorkspaceLogo,
  updateWorkspaceName,
  type InvitationLookup,
  type InvitationRow,
  type MemberRow,
  type PendingWorkspaceDeletion,
} from './workspace';
