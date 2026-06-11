export { createServiceClient, createUserClient } from './client';
export {
  createProduct,
  createSpecField,
  getActiveWorkspace,
  listFieldsForProduct,
  listFieldVersions,
  listProducts,
  listUnits,
  membershipLookupFor,
  updateFieldValue,
  type ActiveWorkspace,
  type FieldVersionRow,
  type ProductRow,
  type SpecFieldRow,
  type UnitRow,
} from './spec';
export {
  assertWorkspaceScope,
  MissingWorkspaceScopeError,
  scopedServiceQuery,
  type WorkspaceScope,
} from './guard';
