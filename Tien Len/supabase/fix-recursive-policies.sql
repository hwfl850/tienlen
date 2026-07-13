-- Repair migration: run this once if Supabase reports
-- "infinite recursion detected in policy for relation room_members" (or game_players).
-- It is safe after either a full or partially completed schema setup.

create or replace function public.is_room_member(target_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_members where room_id = target_room_id and user_id = auth.uid());
$$;
create or replace function public.is_game_player(target_game_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_players where game_id = target_game_id and user_id = auth.uid());
$$;
create or replace function public.can_view_shared_avatar(target_avatar_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.room_members requester
    join public.room_members owner on owner.room_id = requester.room_id
    where requester.user_id = auth.uid() and owner.avatar_path = target_avatar_path
  ) or exists (
    select 1 from public.game_players requester
    join public.game_players owner on owner.game_id = requester.game_id
    where requester.user_id = auth.uid() and owner.avatar_path = target_avatar_path
  );
$$;
revoke all on function public.is_room_member(uuid), public.is_game_player(uuid), public.can_view_shared_avatar(text) from public;
grant execute on function public.is_room_member(uuid), public.is_game_player(uuid), public.can_view_shared_avatar(text) to authenticated;

drop policy if exists "see public waiting rooms or own rooms" on public.rooms;
drop policy if exists "room members can see their seats" on public.room_members;
drop policy if exists "players can see games at their table" on public.games;
drop policy if exists "players can see public opponents" on public.game_players;
drop policy if exists "table peers may view a shared avatar" on storage.objects;

create policy "see public waiting rooms or own rooms" on public.rooms for select to authenticated using (
  (visibility = 'public' and status = 'waiting') or public.is_room_member(id)
);
create policy "room members can see their seats" on public.room_members for select to authenticated using (public.is_room_member(room_id));
create policy "players can see games at their table" on public.games for select to authenticated using (public.is_room_member(room_id));
create policy "players can see public opponents" on public.game_players for select to authenticated using (public.is_game_player(game_id));
create policy "table peers may view a shared avatar" on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and (owner_id::text = auth.uid()::text or public.can_view_shared_avatar(storage.objects.name))
);
