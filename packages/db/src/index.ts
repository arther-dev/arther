export { createServiceClient, createUserClient } from './client';
export {
  assertWorkspaceScope,
  MissingWorkspaceScopeError,
  scopedServiceQuery,
  type WorkspaceScope,
} from './guard';
