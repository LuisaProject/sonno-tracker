create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  eta int not null,
  soglia_manuale_ore numeric,
  ultimo_avviso_soglia_data date,
  ultimo_promemoria_data date
);

alter table profiles add column if not exists ultimo_avviso_soglia_data date;
alter table profiles add column if not exists ultimo_promemoria_data date;
-- Nessuna policy aggiuntiva richiesta: scripts/check-soglia.js scrive con la
-- service_role key, che bypassa sempre RLS. La policy profiles_update_own
-- esistente resta sufficiente per l'app frontend (limita comunque per riga).

alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

create table if not exists sessioni_sonno (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  inizio timestamptz not null,
  fine timestamptz,
  rientro_diurno_notificato boolean not null default false
);

alter table sessioni_sonno add column if not exists rientro_diurno_notificato boolean not null default false;
-- Stesso ragionamento di profiles: scrittura solo via service_role key,
-- sessioni_update_own esistente resta sufficiente per l'app frontend.

alter table sessioni_sonno enable row level security;

create policy "sessioni_select_own" on sessioni_sonno
  for select using (auth.uid() = user_id);

create policy "sessioni_insert_own" on sessioni_sonno
  for insert with check (auth.uid() = user_id);

create policy "sessioni_update_own" on sessioni_sonno
  for update using (auth.uid() = user_id);

create policy "sessioni_delete_own" on sessioni_sonno
  for delete using (auth.uid() = user_id);

create index if not exists sessioni_sonno_user_inizio_idx on sessioni_sonno (user_id, inizio desc);
