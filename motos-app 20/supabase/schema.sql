-- ============================================================
-- Schéma de la base pour l'application de gestion des motos
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run
-- ============================================================

create extension if not exists "uuid-ossp";

-- Profils utilisateurs (lié à l'utilisateur d'authentification Supabase)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text not null,
  is_admin boolean not null default false,
  created_at timestamp with time zone default now()
);

-- Motos
create table if not exists motos (
  id uuid primary key default uuid_generate_v4(),
  marque text not null,
  modele text not null,
  annee int,
  date_achat date,
  kilometrage int not null default 0,
  etat text not null default 'roulante', -- 'roulante' | 'entretien' | 'restauration'
  frequence_roulage_mois int default 3,
  dernier_roulage date,
  prochain_ct date,
  notes_entretien text,
  photo_principale_url text,
  created_at timestamp with time zone default now()
);

-- Sorties (emprunts)
create table if not exists sorties (
  id uuid primary key default uuid_generate_v4(),
  moto_id uuid not null references motos(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  date_depart timestamp with time zone default now(),
  km_depart int not null,
  date_retour timestamp with time zone,
  km_retour int,
  commentaire text,
  note_sur_10 int,
  note_entretien text,
  statut text not null default 'en_cours' -- 'en_cours' | 'terminee'
);

-- Photos rattachées à une moto (fiche permanente)
create table if not exists photos_moto (
  id uuid primary key default uuid_generate_v4(),
  moto_id uuid not null references motos(id) on delete cascade,
  url text not null,
  created_at timestamp with time zone default now()
);

-- Photos rattachées à une sortie précise
create table if not exists photos_sortie (
  id uuid primary key default uuid_generate_v4(),
  sortie_id uuid not null references sorties(id) on delete cascade,
  url text not null,
  created_at timestamp with time zone default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table motos enable row level security;
alter table sorties enable row level security;
alter table photos_moto enable row level security;
alter table photos_sortie enable row level security;

-- Tout utilisateur connecté peut lire son propre profil et ceux des autres (pour afficher les prénoms)
create policy "profiles_select_all" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_self" on profiles for update using (auth.uid() = id);

-- Tout utilisateur connecté peut voir toutes les motos
create policy "motos_select_all" on motos for select using (auth.role() = 'authenticated');

-- Seuls les admins peuvent créer/modifier/supprimer des motos
create policy "motos_admin_write" on motos for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

-- Tout le monde peut voir toutes les sorties (historique visible sur la fiche moto)
create policy "sorties_select_all" on sorties for select using (auth.role() = 'authenticated');

-- Un utilisateur peut créer une sortie pour lui-même
create policy "sorties_insert_self" on sorties for insert with check (auth.uid() = user_id);

-- Un utilisateur peut modifier (clôturer) sa propre sortie ; un admin peut tout modifier
create policy "sorties_update_self_or_admin" on sorties for update using (
  auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

-- Photos : lecture libre pour les connectés, écriture pour son propre contenu ou admin
create policy "photos_moto_select_all" on photos_moto for select using (auth.role() = 'authenticated');
create policy "photos_moto_admin_write" on photos_moto for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

create policy "photos_sortie_select_all" on photos_sortie for select using (auth.role() = 'authenticated');
create policy "photos_sortie_insert_self" on photos_sortie for insert with check (
  exists (select 1 from sorties where id = sortie_id and user_id = auth.uid())
);

-- ============================================================
-- Pour créer le premier compte admin (ton père) :
-- 1. Crée son compte depuis Authentication > Users > Add user (email + mot de passe)
-- 2. Puis exécute (en remplaçant l'email) :
--    insert into profiles (id, nom, is_admin)
--    select id, 'Papa', true from auth.users where email = 'email-de-ton-pere@exemple.fr';
-- ============================================================
