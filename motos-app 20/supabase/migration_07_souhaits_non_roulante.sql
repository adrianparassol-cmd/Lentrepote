-- À lancer dans Supabase SQL Editor (nouvel onglet), une seule fois.
-- Empêche l'ajout d'une moto "non roulante" à la liste à essayer d'un utilisateur,
-- même si la restriction visuelle de l'appli était contournée.

drop policy if exists "souhaits_insert_self" on souhaits;
create policy "souhaits_insert_self" on souhaits for insert with check (
  auth.uid() = user_id
  and exists (select 1 from motos where id = moto_id and etat <> 'non_roulante')
);
