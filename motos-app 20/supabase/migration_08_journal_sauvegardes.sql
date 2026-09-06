-- À lancer dans Supabase SQL Editor (nouvel onglet), une seule fois.

create table if not exists sauvegardes_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id),
  created_at timestamptz default now()
);

alter table sauvegardes_log enable row level security;

create policy "sauvegardes_log_admin_all" on sauvegardes_log for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
