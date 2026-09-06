-- À lancer dans Supabase SQL Editor (nouvel onglet), une seule fois.
-- Permet d'enregistrer un frais (ex. prix d'achat payé en liquide, sans facture)
-- sans qu'un fichier ne soit obligatoirement rattaché.

alter table documents_moto alter column chemin drop not null;
