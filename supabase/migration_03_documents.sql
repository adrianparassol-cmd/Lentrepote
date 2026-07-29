-- À lancer dans Supabase SQL Editor (nouvel onglet), une seule fois.

-- Bucket privé (pas "public") pour les documents sensibles : factures, carte grise.
-- Contrairement aux photos, ces fichiers ne sont accessibles qu'à l'administrateur.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create table if not exists documents_moto (
  id uuid primary key default uuid_generate_v4(),
  moto_id uuid not null references motos(id) on delete cascade,
  type text not null default 'autre', -- 'achat' | 'entretien' | 'carte_grise' | 'autre'
  chemin text not null,
  nom_fichier text,
  created_at timestamptz default now()
);

alter table documents_moto enable row level security;

create policy "documents_moto_admin_all" on documents_moto for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

create policy "documents_bucket_admin_select" on storage.objects
  for select using (
    bucket_id = 'documents'
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "documents_bucket_admin_insert" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "documents_bucket_admin_delete" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
