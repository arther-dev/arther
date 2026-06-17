-- ============================================================================
-- Arther — Migration 0022: Comment carry-forward marker (C2.4)
-- When a new revision is forked from a published snapshot, its unresolved
-- comment threads are copied onto the new revision (collaboration spec §7.3),
-- re-anchored to the corresponding (remapped) block. This column flags such a
-- thread as inherited and points back at the source thread in the prior
-- revision, so reviewers can tell carried-forward feedback from fresh feedback.
-- NULL = native to its revision. On delete of the source it nulls (history-safe;
-- the inherited thread survives the prior revision being pruned).
-- Depends on: 0001-0008.
-- ============================================================================

alter table public.comment_threads
  add column inherited_from_thread_id uuid references public.comment_threads(id) on delete set null;

create index comment_threads_inherited_idx
  on public.comment_threads (inherited_from_thread_id);
