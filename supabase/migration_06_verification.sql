-- À lancer dans Supabase SQL Editor (nouvel onglet), une seule fois.
-- Marqueur temporaire pour le suivi de la vérification des motos importées.
-- Pourra être supprimé plus tard une fois toutes les motos vérifiées :
--   alter table motos drop column verifie;

alter table motos add column if not exists verifie boolean default false;
