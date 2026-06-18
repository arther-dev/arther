-- ============================================================================
-- Arther — Migration 0023: Snippet embed-count maintenance (R.2)
-- Keep library_items.embed_count exact as snippet_embeds rows come and go —
-- including cascade deletes when a placing block is removed (the embed FK is
-- ON DELETE CASCADE on block_id, so an embed can disappear without app code
-- running). The count gates the /snippets surface and the "archive instead of
-- delete" decision, so a trigger keeps it correct regardless of the path that
-- created or removed the embed. Idempotent floor at zero.
-- Depends on: 0009.
-- ============================================================================

create or replace function public.bump_library_item_embed_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.library_items
      set embed_count = embed_count + 1
      where id = new.library_item_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.library_items
      set embed_count = greatest(embed_count - 1, 0)
      where id = old.library_item_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger snippet_embeds_count_ins after insert on public.snippet_embeds
  for each row execute function public.bump_library_item_embed_count();
create trigger snippet_embeds_count_del after delete on public.snippet_embeds
  for each row execute function public.bump_library_item_embed_count();
