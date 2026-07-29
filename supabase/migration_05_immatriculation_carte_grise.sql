-- À lancer dans Supabase SQL Editor (nouvel onglet), une seule fois.

alter table motos add column if not exists immatriculation text;
alter table documents_moto add column if not exists date_document date;

-- Autoriser tout utilisateur connecté (pas seulement l'admin) à voir les fiches
-- "carte grise" en base de données, pour qu'elle soit accessible pendant une sortie.
create policy "documents_moto_select_carte_grise" on documents_moto for select using (
  type = 'carte_grise' and auth.role() = 'authenticated'
);

-- Idem côté stockage : autoriser le téléchargement du fichier carte grise lui-même
-- (pas les autres documents, qui restent réservés à l'administrateur).
create policy "documents_bucket_select_carte_grise" on storage.objects
  for select using (
    bucket_id = 'documents'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from documents_moto
      where chemin = storage.objects.name and type = 'carte_grise'
    )
  );
