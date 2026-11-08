-- Moger-mulluk online leaderboard (spec §12.7). Run this once in the
-- Supabase SQL editor for your project; there is no migration runner in
-- this repository (CLAUDE.md rule 12: no backend code, no server).

create table scores (
  id           bigint generated always as identity primary key,
  player_id    uuid not null default auth.uid(),
  nickname     text not null check (char_length(nickname) between 2 and 16),
  vehicle      text not null check (vehicle in ('car', 'motorcycle')),
  score        int  not null check (score between 0 and 5000),
  duration_ms  int  not null check (duration_ms between 45000 and 200000),
  seed         bigint not null,
  game_version text not null,
  created_at   timestamptz not null default now()
);
create index on scores (vehicle, score desc);

alter table scores enable row level security;
create policy "anyone can read" on scores
  for select using (true);
create policy "players insert own rows" on scores
  for insert to authenticated with check (player_id = auth.uid());
-- no update or delete policies

-- clients may only write these columns; id, player_id and created_at come from defaults
revoke insert, update, delete on scores from anon, authenticated;
grant insert (nickname, vehicle, score, duration_ms, seed, game_version)
  on scores to authenticated;

-- at most one score per player every 30 seconds
create function enforce_score_rate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from scores
             where player_id = new.player_id
               and created_at > now() - interval '30 seconds') then
    raise exception 'rate_limited';
  end if;
  return new;
end $$;

create trigger scores_rate before insert on scores
  for each row execute function enforce_score_rate();

create view leaderboard with (security_invoker = true) as
  select distinct on (player_id, vehicle)
         player_id, nickname, vehicle, score, created_at
  from scores
  order by player_id, vehicle, score desc;
grant select on leaderboard to anon, authenticated;
