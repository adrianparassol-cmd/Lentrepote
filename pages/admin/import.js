import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useUser } from '../../lib/useUser';
import { compresserImage } from '../../lib/image';
import NavBar from '../../components/NavBar';

function categoriser(nomFichier) {
  if (nomFichier.startsWith('.')) return null;
  if (/\.(jpe?g|png|heic|webp)$/i.test(nomFichier)) return 'photo';
  if (/carte.?gris/i.test(nomFichier)) return 'carte_grise';
  if (/achat/i.test(nomFichier)) return 'achat';
  if (/frais/i.test(nomFichier) || /faris/i.test(nomFichier)) return 'entretien';
  if (/\.pdf$/i.test(nomFichier)) return 'autre';
  return null;
}

function nomDepuisDossier(nomDossier) {
  const parties = nomDossier.trim().split(/\s+/);
  return {
    marque: parties[0] || nomDossier,
    modele: parties.slice(1).join(' ') || nomDossier,
  };
}

export default function ImportMasse() {
  const { profile, loading } = useUser();
  const [journal, setJournal] = useState([]);
  const [enCours, setEnCours] = useState(false);

  function log(ligne) {
    setJournal((j) => [...j, ligne]);
  }

  async function handleFichiers(e) {
    const fichiers = Array.from(e.target.files || []);
    if (fichiers.length === 0) return;
    setEnCours(true);
    setJournal([]);

    // Regroupe les fichiers par dossier moto (le dossier parent direct de chaque fichier)
    const groupes = {};
    for (const fichier of fichiers) {
      const chemin = fichier.webkitRelativePath || fichier.name;
      const segments = chemin.split('/');
      if (segments.length < 2) continue;
      const dossierMoto = segments[segments.length - 2];
      if (dossierMoto === '__MACOSX' || dossierMoto.startsWith('.')) continue;
      const cat = categoriser(fichier.name);
      if (!cat) continue;
      groupes[dossierMoto] = groupes[dossierMoto] || [];
      groupes[dossierMoto].push({ fichier, cat });
    }

    const nomsDossiers = Object.keys(groupes);
    log(`${nomsDossiers.length} moto(s) détectée(s) : ${nomsDossiers.join(', ')}`);

    for (const dossierMoto of nomsDossiers) {
      const { marque, modele } = nomDepuisDossier(dossierMoto);
      log(`— ${dossierMoto} : recherche d'une fiche existante...`);

      const { data: existante } = await supabase
        .from('motos')
        .select('id')
        .eq('marque', marque)
        .eq('modele', modele)
        .maybeSingle();

      let motoId = existante?.id;

      if (!motoId) {
        const { data: nouvelle, error } = await supabase
          .from('motos')
          .insert({ marque, modele, etat: 'roulante', kilometrage: 0 })
          .select()
          .single();
        if (error) {
          log(`  ⚠️ Erreur création fiche : ${error.message}`);
          continue;
        }
        motoId = nouvelle.id;
        log(`  Fiche créée (${marque} ${modele}).`);
      } else {
        log(`  Fiche déjà existante, ajout des fichiers dessus.`);
      }

      let photoPrincipaleDejaDefinie = false;
      const { data: motoActuelle } = await supabase.from('motos').select('photo_principale_url').eq('id', motoId).single();
      if (motoActuelle?.photo_principale_url) photoPrincipaleDejaDefinie = true;

      for (const { fichier, cat } of groupes[dossierMoto]) {
        if (cat === 'photo') {
          const compressee = await compresserImage(fichier);
          const chemin = `motos/galerie/${motoId}-${Date.now()}-${compressee.name}`;
          const { error } = await supabase.storage.from('photos').upload(chemin, compressee);
          if (error) {
            log(`  ⚠️ Photo ${fichier.name} : ${error.message}`);
            continue;
          }
          const { data: publicUrl } = supabase.storage.from('photos').getPublicUrl(chemin);
          await supabase.from('photos_moto').insert({ moto_id: motoId, url: publicUrl.publicUrl });
          if (!photoPrincipaleDejaDefinie) {
            await supabase.from('motos').update({ photo_principale_url: publicUrl.publicUrl }).eq('id', motoId);
            photoPrincipaleDejaDefinie = true;
          }
          log(`  Photo ajoutée : ${fichier.name}`);
        } else {
          const chemin = `${motoId}/${Date.now()}-${fichier.name}`;
          const { error } = await supabase.storage.from('documents').upload(chemin, fichier);
          if (error) {
            log(`  ⚠️ Document ${fichier.name} : ${error.message}`);
            continue;
          }
          await supabase.from('documents_moto').insert({
            moto_id: motoId,
            type: cat,
            chemin,
            nom_fichier: fichier.name,
          });
          log(`  Document ajouté (${cat}) : ${fichier.name}`);
        }
      }
    }

    log('Import terminé.');
    setEnCours(false);
  }

  if (loading) return null;
  if (!profile?.is_admin) return <div className="page"><p>Accès réservé à l'administrateur.</p></div>;

  return (
    <div className="page">
      <NavBar isAdmin />
      <div className="top-bar">
        <h1>Import en masse</h1>
      </div>

      <p style={{ color: '#6b6a63' }}>
        Sélectionne le dossier qui contient les dossiers de motos (un dossier par moto,
        avec ses photos et ses factures dedans). L'appli crée automatiquement une fiche
        par dossier (marque + modèle déduits du nom du dossier) et y ajoute photos et documents.
        Si une fiche du même nom existe déjà, les fichiers viennent s'y ajouter sans doublon de fiche.
      </p>

      <label htmlFor="dossier">Dossier des motos</label>
      <input
        id="dossier"
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFichiers}
        disabled={enCours}
      />

      {journal.length > 0 && (
        <div className="card" style={{ marginTop: 20, maxHeight: 400, overflowY: 'auto' }}>
          {journal.map((ligne, i) => (
            <p key={i} style={{ margin: '0 0 4px', fontSize: 14, fontFamily: 'monospace' }}>{ligne}</p>
          ))}
        </div>
      )}

      {enCours && <p style={{ marginTop: 14 }}>Import en cours, ne ferme pas cette page...</p>}
    </div>
  );
}
