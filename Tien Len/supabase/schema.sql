-- Lantern Table / Tien Len
-- Run this once in Supabase Dashboard → SQL Editor. Then deploy the Edge Function.
-- This design deliberately never stores a human player's hand in a public row.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (display_name ~ '^[A-Za-z0-9 _-]{2,24}$'),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 24), ''), 'Player'));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  name text not null check (char_length(name) between 2 and 40),
  visibility text not null check (visibility in ('public', 'private')),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_path text,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  status text not null default 'playing' check (status in ('playing', 'finished')),
  current_player_key text not null,
  leader_player_key text not null,
  opening boolean not null default true,
  pile jsonb not null default '[]'::jsonb,
  last_play jsonb,
  winner_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists one_live_game_per_room on public.games(room_id) where status = 'playing';

create table if not exists public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  player_key text not null,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_path text,
  seat smallint not null check (seat between 0 and 3),
  is_bot boolean not null default false,
  hand_count smallint not null default 13 check (hand_count between 0 and 13),
  passed boolean not null default false,
  primary key (game_id, player_key),
  unique (game_id, seat)
);

-- Only the player named by player_key can read this table. Bots are never exposed.
create table if not exists public.game_hands (
  game_id uuid not null references public.games(id) on delete cascade,
  player_key text not null,
  cards jsonb not null default '[]'::jsonb,
  primary key (game_id, player_key)
);

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_hands enable row level security;

-- SECURITY DEFINER helpers avoid self-referencing RLS policies. They reveal only a
-- boolean about the caller's own membership, never any profile/game data.
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

-- Profiles contain private identity data. Other players only receive a display snapshot
-- from room_members/game_players while they share a table.
create policy "profile owner reads own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profile owner updates own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "see public waiting rooms or own rooms" on public.rooms for select to authenticated using (
  (visibility = 'public' and status = 'waiting') or public.is_room_member(id)
);
create policy "room members can see their seats" on public.room_members for select to authenticated using (
  public.is_room_member(room_id)
);
create policy "players can see games at their table" on public.games for select to authenticated using (
  public.is_room_member(room_id)
);
create policy "players can see public opponents" on public.game_players for select to authenticated using (
  public.is_game_player(game_id)
);
create policy "a player can read only their own hand" on public.game_hands for select to authenticated using (player_key = auth.uid()::text);

-- No browser role gets INSERT/UPDATE/DELETE policies for rooms, games, players, or hands.
-- The service-role Edge Function is the sole writer and validates every transition.

-- Directory is intentionally limited to waiting public rooms and exposes only lobby-safe data.
create or replace view public.room_directory with (security_invoker = false) as
select r.id, r.name, r.created_at,
       count(m.user_id)::int as member_count,
       max(m.display_name) filter (where m.user_id = r.owner_id) as owner_name
from public.rooms r
left join public.room_members m on m.room_id = r.id
where r.visibility = 'public' and r.status = 'waiting'
group by r.id;
grant select on public.room_directory to authenticated;

-- Private avatar storage. Create the bucket in Storage as *private* (not public):
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1000000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 1000000;

create policy "avatar owner uploads one file" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.webp'
);
create policy "avatar owner updates own file" on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and owner_id::text = auth.uid()::text
) with check (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.webp');
create policy "avatar owner deletes own file" on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and owner_id::text = auth.uid()::text
);
-- A temporary signed URL may be made only by the owner or someone sharing a room/game
-- with the avatar owner. Objects remain private; there is no public bucket URL.
create policy "table peers may view a shared avatar" on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and (
    owner_id::text = auth.uid()::text or public.can_view_shared_avatar(storage.objects.name)
  )
);

-- Realtime is an optional convenience; RLS still applies to every REST query.
alter publication supabase_realtime add table public.rooms, public.room_members, public.games;
