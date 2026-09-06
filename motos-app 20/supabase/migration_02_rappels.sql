-- À lancer dans Supabase SQL Editor (nouvel onglet), une seule fois.

-- Rappel de roulage : passage du défaut à 12 mois
alter table motos alter column frequence_roulage_mois set default 12;
update motos set frequence_roulage_mois = 12 where frequence_roulage_mois = 3;

-- Contrôle technique : on saisit désormais la date du DERNIER contrôle,
-- l'appli calcule elle-même le prochain rappel.
alter table motos add column if not exists dernier_ct date;
alter table motos add column if not exists frequence_ct_mois int default 24;
