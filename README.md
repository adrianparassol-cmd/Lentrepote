# Appli motos

Application de suivi et de réservation pour la collection de motos, avec back-office pour l'administrateur (ton père) et un parcours simplifié pour ses amis.

## 1. Créer le projet Supabase (base de données + comptes + photos)

1. Va sur https://supabase.com, crée un compte gratuit et un nouveau projet.
2. Une fois le projet créé, ouvre **SQL Editor > New query**, colle le contenu du fichier `supabase/schema.sql`, puis clique sur **Run**. Cela crée toutes les tables et les règles de sécurité.
3. Va dans **Storage**, crée un nouveau bucket nommé exactement `photos`, et coche **Public bucket** (pour que les photos s'affichent directement).
4. Va dans **Project Settings > API** : note l'**URL du projet** et la clé **anon public**. Tu en auras besoin à l'étape 3.

## 2. Créer les comptes

1. Va dans **Authentication > Users > Add user**, et crée un compte pour ton père (email + mot de passe), puis un compte par ami.
2. Retourne dans **SQL Editor**, et pour chaque personne créée, exécute (en adaptant l'email et le nom) :

```sql
insert into profiles (id, nom, is_admin)
select id, 'Papa', true from auth.users where email = 'email-de-ton-pere@exemple.fr';
```

Mets `true` uniquement pour ton père (administrateur). Mets `false` pour tous les amis :

```sql
insert into profiles (id, nom, is_admin)
select id, 'Jean', false from auth.users where email = 'email-de-jean@exemple.fr';
```

## 3. Déployer sur Vercel (comme pour Suivisport)

1. Crée un nouveau dépôt GitHub (ex. `motos-app`), et uploade-y tout le contenu de ce dossier.
2. Sur Vercel, crée un nouveau projet à partir de ce dépôt.
3. Dans **Project Settings > Environment Variables**, ajoute :
   - `NEXT_PUBLIC_SUPABASE_URL` → l'URL notée à l'étape 1.4
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → la clé notée à l'étape 1.4
4. Déploie. Le site est en ligne à l'adresse fournie par Vercel.

Pour toute mise à jour ultérieure : je te fournirai les fichiers modifiés, tu les réuploades sur GitHub (commit), et Vercel redéploie automatiquement — exactement le même principe que pour Suivisport.

## Pages de l'application

- `/login` — connexion
- `/recap` — récapitulatif de toutes les motos avec leur statut (disponible / sortie / entretien / restauration)
- `/moto/[id]` — fiche complète d'une moto (infos, historique, bouton je pars / je rends)
- `/sortie` — choix de la moto (favoris + recherche) puis kilométrage de départ
- `/retour` — clôture de la sortie (kilométrage, note, commentaire, photo)
- `/admin` — back-office (liste des motos), réservé à l'administrateur
- `/admin/moto/new` et `/admin/moto/[id]` — création / modification d'une fiche moto

## Prochaines étapes possibles

- Ajouter un rappel visuel sur la page récap si le contrôle technique approche ou si une moto n'a pas roulé depuis trop longtemps (basé sur `prochain_ct` et `dernier_roulage` + `frequence_roulage_mois`).
- Ajouter une page listant les photos de toutes les sorties d'une moto (actuellement seule la dernière saisie est facilement accessible).
- Importer en une fois les fiches Word existantes une fois leur contenu récupéré.
