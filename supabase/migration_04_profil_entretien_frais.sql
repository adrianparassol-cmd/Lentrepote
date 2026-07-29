-- À lancer dans Supabase SQL Editor (nouvel onglet), une seule fois.

-- Notes d'entretien : un historique plutôt qu'un champ unique écrasé à chaque fois.
create table if not exists entretien_notes (
  id uuid primary key default uuid_generate_v4(),
  moto_id uuid not null references motos(id) on delete cascade,
  contenu text not null,
  auteur text,
  source text default 'admin', -- 'admin' (saisi par le père) | 'retour' (signalé par un pilote)
  created_at timestamptz default now()
);
alter table entretien_notes enable row level security;
create policy "entretien_select_all" on entretien_notes for select using (auth.role() = 'authenticated');
create policy "entretien_insert_all" on entretien_notes for insert with check (auth.role() = 'authenticated');
create policy "entretien_admin_delete" on entretien_notes for delete using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

-- Liste "motos à essayer" par utilisateur
create table if not exists souhaits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  moto_id uuid not null references motos(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, moto_id)
);
alter table souhaits enable row level security;
create policy "souhaits_select_self" on souhaits for select using (auth.uid() = user_id);
create policy "souhaits_insert_self" on souhaits for insert with check (auth.uid() = user_id);
create policy "souhaits_delete_self" on souhaits for delete using (auth.uid() = user_id);

-- Montant sur chaque document (facture) pour le récap financier
alter table documents_moto add column if not exists montant numeric;
