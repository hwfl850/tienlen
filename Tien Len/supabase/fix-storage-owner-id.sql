-- Repair migration for the initial schema run on projects where storage.objects.owner_id is text.
-- Run this once in Supabase Dashboard → SQL Editor, then continue with the rest of setup.

drop policy if exists "avatar owner uploads one file" on storage.objects;
drop policy if exists "avatar owner updates own file" on storage.objects;
drop policy if exists "avatar owner deletes own file" on storage.objects;
drop policy if exists "table peers may view a shared avatar" on storage.objects;

create policy "avatar owner uploads one file" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.webp'
);
create policy "avatar owner updates own file" on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and owner_id::text = auth.uid()::text
) with check (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.webp');
create policy "avatar owner deletes own file" on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and owner_id::text = auth.uid()::text
);
create policy "table peers may view a shared avatar" on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and (
    owner_id::text = auth.uid()::text or exists (
      select 1 from public.room_members requester
      join public.room_members owner on owner.room_id = requester.room_id
      where requester.user_id = auth.uid() and owner.avatar_path = storage.objects.name
    ) or exists (
      select 1 from public.game_players requester
      join public.game_players owner on owner.game_id = requester.game_id
      where requester.user_id = auth.uid() and owner.avatar_path = storage.objects.name
    )
  )
);

-- The original run stops before this statement, so enable lobby/game updates too.
do $$
begin
  alter publication supabase_realtime add table public.rooms, public.room_members, public.games;
exception when duplicate_object then null;
end $$;
