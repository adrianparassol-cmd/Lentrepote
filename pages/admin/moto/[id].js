import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabaseClient';
import { useUser } from '../../../lib/useUser';
import { compresserImage } from '../../../lib/image';
import { convertirHeicSiNecessaire } from '../../../lib/heic';
import { formatDateFR } from '../../../lib/format';
import NavBar from '../../../components/NavBar';

const vide = {
  marque: '', modele: '', annee: '', date_achat: '', kilometrage: '',
  etat: 'roulante', dernier_roulage: '', photo_principale_url: '', immatriculation: '',
};

const TYPES_DOCUMENTS = {
  achat: "Facture d'achat",
  frais_achat: "Frais d'achat",
  entretien: "Facture d'entretien",
  carte_grise: 'Carte grise',
  autre: 'Autre document',
};

function nettoyerDates(form) {
  const copie = { ...form };
  ['date_achat', 'dernier_roulage'].forEach((champ) => {
    if (!copie[champ]) copie[champ] = null;
  });
  return copie;
}

export default function EditMoto() {
  const router = useRouter();
  const { id } = router.query;
  const estNouveau = id === 'new';
  const { profile, loading } = useUser();
  const [form, setForm] = useState(vide);
  const [nouvellesPhotos, setNouvellesPhotos] = useState([]);
  const [galerie, setGalerie] = useState([]);
  const [notesEntretien, setNotesEntretien] = useState([]);
  const [nouvelleNote, setNouvelleNote] = useState('');
  const [documents, setDocuments] = useState([]);
  const [apercus, setApercus] = useState({});
  const [typeDocument, setTypeDocument] = useState('achat');
  const [montantDocument, setMontantDocument] = useState('');
  const [nomDocumentManuel, setNomDocumentManuel] = useState('');
  const [fichierDocument, setFichierDocument] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [envoiDocument, setEnvoiDocument] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || estNouveau) return;
    supabase.from('motos').select('*').eq('id', id).single().then(({ data }) => {
      if (data) setForm(data);
    });
    chargerGalerie();
    chargerNotes();
    chargerDocuments();
  }, [id]);

  async function chargerGalerie() {
    const { data } = await supabase.from('photos_moto').select('*').eq('moto_id', id).order('created_at');
    setGalerie(data || []);
  }

  async function chargerNotes() {
    const { data } = await supabase.from('entretien_notes').select('*').eq('moto_id', id).order('created_at', { ascending: false });
    setNotesEntretien(data || []);
  }

  function estImage(nomFichier) {
    return /\.(jpe?g|png|heic|webp)$/i.test(nomFichier || '');
  }

  async function genererApercuPdf(url) {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument(url).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.35 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  async function chargerDocuments() {
    const { data } = await supabase.from('documents_moto').select('*').eq('moto_id', id).order('created_at', { ascending: false });
    setDocuments(data || []);
    for (const doc of data || []) {
      if (!doc.chemin || apercus[doc.id]) continue;
      const { data: signee } = await supabase.storage.from('documents').createSignedUrl(doc.chemin, 3600);
      if (!signee) continue;
      if (estImage(doc.nom_fichier)) {
        setApercus((a) => ({ ...a, [doc.id]: signee.signedUrl }));
      } else {
        genererApercuPdf(signee.signedUrl)
          .then((dataUrl) => setApercus((a) => ({ ...a, [doc.id]: dataUrl })))
          .catch(() => {}); // pas grave si l'aperçu échoue, le pictogramme reste affiché
      }
    }
  }

  function update(champ, valeur) {
    setForm((f) => ({ ...f, [champ]: valeur }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setEnvoi(true);

    const payload = nettoyerDates({
      ...form,
      annee: form.annee ? parseInt(form.annee, 10) : null,
      kilometrage: form.kilometrage ? parseInt(form.kilometrage, 10) : 0,
    });

    let result;
    if (estNouveau) {
      result = await supabase.from('motos').insert(payload).select().single();
    } else {
      result = await supabase.from('motos').update(payload).eq('id', id).select().single();
    }

    if (result.error) {
      setEnvoi(false);
      setError(`Erreur : ${result.error.message}`);
      return;
    }

    const motoId = result.data.id;
    let dernierePhotoUrl = null;

    for (const fichier of nouvellesPhotos) {
      const compressee = await compresserImage(fichier);
      const chemin = `motos/galerie/${motoId}-${Date.now()}-${compressee.name}`;
      const { error: uploadError } = await supabase.storage.from('photos').upload(chemin, compressee, { contentType: 'image/jpeg' });
      if (!uploadError) {
        const { data: publicUrl } = supabase.storage.from('photos').getPublicUrl(chemin);
        dernierePhotoUrl = publicUrl.publicUrl;
        await supabase.from('photos_moto').insert({ moto_id: motoId, url: publicUrl.publicUrl });
      }
    }

    // Si la moto n'a encore aucune photo principale, on prend la première envoyée.
    if (!form.photo_principale_url && dernierePhotoUrl) {
      await supabase.from('motos').update({ photo_principale_url: dernierePhotoUrl }).eq('id', motoId);
    }

    setEnvoi(false);
    router.replace(`/moto/${motoId}`);
  }

  async function definirPrincipale(url) {
    await supabase.from('motos').update({ photo_principale_url: url }).eq('id', id);
    setForm((f) => ({ ...f, photo_principale_url: url }));
  }

  async function ajouterNoteManuelle() {
    if (!nouvelleNote.trim()) return;
    await supabase.from('entretien_notes').insert({
      moto_id: id,
      contenu: nouvelleNote.trim(),
      auteur: profile?.nom,
      source: 'admin',
    });
    setNouvelleNote('');
    chargerNotes();
  }

  async function supprimerNote(noteId) {
    await supabase.from('entretien_notes').delete().eq('id', noteId);
    chargerNotes();
  }

  async function handleAjoutDocument(e) {
    e.preventDefault();
    if (estNouveau) return;
    if (!fichierDocument && !montantDocument && !nomDocumentManuel.trim()) return;
    setEnvoiDocument(true);

    let chemin = null;
    let nomFichier = nomDocumentManuel.trim() || TYPES_DOCUMENTS[typeDocument];

    if (fichierDocument) {
      const fichierPret = await convertirHeicSiNecessaire(fichierDocument);
      chemin = `${id}/${Date.now()}-${fichierPret.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(chemin, fichierPret, { contentType: fichierPret.type || 'application/octet-stream' });
      if (uploadError) {
        setError(`Erreur : ${uploadError.message}`);
        setEnvoiDocument(false);
        return;
      }
      nomFichier = nomDocumentManuel.trim() || fichierPret.name;
    }

    await supabase.from('documents_moto').insert({
      moto_id: id,
      type: typeDocument,
      chemin,
      nom_fichier: nomFichier,
      montant: montantDocument ? parseFloat(montantDocument) : null,
    });
    setFichierDocument(null);
    setMontantDocument('');
    setNomDocumentManuel('');
    await chargerDocuments();
    setEnvoiDocument(false);
  }

  async function supprimerDocument(docId) {
    const confirmation = window.confirm('Supprimer définitivement ce document ?');
    if (!confirmation) return;
    await supabase.from('documents_moto').delete().eq('id', docId);
    chargerDocuments();
  }

  async function changerTypeDocument(doc, nouveauType) {
    await supabase.from('documents_moto').update({ type: nouveauType }).eq('id', doc.id);
    chargerDocuments();
  }

  async function voirDocument(chemin) {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(chemin, 3600);
    if (!error && data) window.open(data.signedUrl, '_blank');
  }

  const [analyseEnCours, setAnalyseEnCours] = useState(null);
  const [analyseGlobaleEnCours, setAnalyseGlobaleEnCours] = useState(false);
  const [montantsEdites, setMontantsEdites] = useState({});
  const [erreursDocuments, setErreursDocuments] = useState({});
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(null);
  const [nomsEdites, setNomsEdites] = useState({});

  function montantAffiche(doc) {
    return montantsEdites[doc.id] !== undefined ? montantsEdites[doc.id] : (doc.montant ?? '');
  }

  async function recalculerDateAchatDepuisCG() {
    const { data } = await supabase
      .from('documents_moto')
      .select('date_document')
      .eq('moto_id', id)
      .eq('type', 'carte_grise')
      .not('date_document', 'is', null)
      .order('date_document', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.date_document) {
      await supabase.from('motos').update({ date_achat: data.date_document }).eq('id', id);
      setForm((f) => ({ ...f, date_achat: data.date_document }));
    }
  }

  async function analyserDocument(doc) {
    setAnalyseEnCours(doc.id);
    setErreursDocuments((e) => ({ ...e, [doc.id]: null }));
    try {
      const res = await fetch('/api/analyser-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chemin: doc.chemin }),
      });
      const resultat = await res.json();
      if (!res.ok || resultat.error) {
        setErreursDocuments((e) => ({ ...e, [doc.id]: resultat.error || `Erreur serveur (${res.status})` }));
        return;
      }
      if (resultat.montant != null) {
        setMontantsEdites((m) => ({ ...m, [doc.id]: resultat.montant }));
      }
      if (resultat.date != null && (doc.type === 'achat' || doc.type === 'carte_grise')) {
        await supabase.from('documents_moto').update({ date_document: resultat.date }).eq('id', doc.id);
        if (doc.type === 'carte_grise') {
          await recalculerDateAchatDepuisCG();
        }
        chargerDocuments();
      }
      if (resultat.montant == null && resultat.date == null) {
        setErreursDocuments((e) => ({ ...e, [doc.id]: "Rien d'exploitable trouvé sur ce document — à compléter à la main si besoin." }));
      }
      // Pré-remplit l'année / l'immatriculation de la moto si elles sont encore vides
      if (resultat.annee && !form.annee) {
        await supabase.from('motos').update({ annee: resultat.annee }).eq('id', id);
        setForm((f) => ({ ...f, annee: resultat.annee }));
      }
      if (resultat.immatriculation && !form.immatriculation) {
        await supabase.from('motos').update({ immatriculation: resultat.immatriculation }).eq('id', id);
        setForm((f) => ({ ...f, immatriculation: resultat.immatriculation }));
      }
    } catch (err) {
      setErreursDocuments((e) => ({ ...e, [doc.id]: err.message }));
    } finally {
      setAnalyseEnCours(null);
    }
  }

  async function analyserTousLesDocuments() {
    setAnalyseGlobaleEnCours(true);
    for (const doc of documents) {
      if (doc.montant == null && doc.chemin) {
        await analyserDocument(doc);
      }
    }
    setAnalyseGlobaleEnCours(false);
  }

  async function enregistrerMontant(doc) {
    setEnregistrementEnCours(doc.id);
    const valeur = montantAffiche(doc);
    const montant = valeur === '' ? null : parseFloat(valeur);
    const { error } = await supabase.from('documents_moto').update({ montant }).eq('id', doc.id);
    setEnregistrementEnCours(null);
    if (error) {
      setErreursDocuments((e) => ({ ...e, [doc.id]: error.message }));
      return;
    }
    setMontantsEdites((m) => {
      const copie = { ...m };
      delete copie[doc.id];
      return copie;
    });
    chargerDocuments();
  }

  async function toggleVerifie() {
    const { error } = await supabase.from('motos').update({ verifie: !form.verifie }).eq('id', id);
    if (!error) setForm((f) => ({ ...f, verifie: !f.verifie }));
  }

  async function supprimerMoto() {
    const confirmation = window.confirm(
      `Supprimer définitivement ${form.marque} ${form.modele} ? Son historique de sorties, ses notes et ses documents seront aussi supprimés. Cette action est irréversible.`
    );
    if (!confirmation) return;
    const { error } = await supabase.from('motos').delete().eq('id', id);
    if (error) {
      setError(`Erreur lors de la suppression : ${error.message}`);
      return;
    }
    router.replace('/admin');
  }

  function cheminDepuisUrlPhoto(url) {
    const marqueur = '/photos/';
    const index = url.indexOf(marqueur);
    return index === -1 ? null : url.slice(index + marqueur.length);
  }

  async function supprimerPhoto(photo) {
    const confirmation = window.confirm('Supprimer cette photo ?');
    if (!confirmation) return;
    const chemin = cheminDepuisUrlPhoto(photo.url);
    if (chemin) {
      await supabase.storage.from('photos').remove([chemin]);
    }
    await supabase.from('photos_moto').delete().eq('id', photo.id);
    if (form.photo_principale_url === photo.url) {
      const restantes = galerie.filter((p) => p.id !== photo.id);
      const nouvellePrincipale = restantes[0]?.url || null;
      await supabase.from('motos').update({ photo_principale_url: nouvellePrincipale }).eq('id', id);
      setForm((f) => ({ ...f, photo_principale_url: nouvellePrincipale }));
    }
    chargerGalerie();
  }

  async function renommerDocument(doc, nouveauNom) {
    if (!nouveauNom.trim() || nouveauNom === doc.nom_fichier) return;
    await supabase.from('documents_moto').update({ nom_fichier: nouveauNom.trim() }).eq('id', doc.id);
    setNomsEdites((n) => {
      const copie = { ...n };
      delete copie[doc.id];
      return copie;
    });
    chargerDocuments();
  }

  if (loading) return null;
  if (!profile?.is_admin) return <div className="page"><p>Accès réservé à l'administrateur.</p></div>;

  const prixAchatBrut = documents.filter((d) => d.type === 'achat').reduce((s, d) => s + (d.montant || 0), 0);
  const fraisAchat = documents.filter((d) => d.type === 'frais_achat').reduce((s, d) => s + (d.montant || 0), 0);
  const totalFrais = documents.filter((d) => d.type === 'entretien').reduce((s, d) => s + (d.montant || 0), 0);
  const totalGeneral = prixAchatBrut + fraisAchat + totalFrais;

  return (
    <div className="page" style={{ maxWidth: 480 }}>
      <NavBar isAdmin />
      <div className="top-bar">
        <h1>{estNouveau ? 'Ajouter une moto' : 'Modifier la fiche'}</h1>
        {!estNouveau && (
          <button type="button" className={form.verifie ? 'btn-primary' : ''} onClick={toggleVerifie}>
            {form.verifie ? '✓ Vérifiée' : 'À vérifier'}
          </button>
        )}
      </div>
      <form onSubmit={handleSubmit}>
        <label htmlFor="marque">Marque</label>
        <input id="marque" value={form.marque} onChange={(e) => update('marque', e.target.value)} required />

        <label htmlFor="modele">Modèle</label>
        <input id="modele" value={form.modele} onChange={(e) => update('modele', e.target.value)} required />

        <label htmlFor="immatriculation">Immatriculation</label>
        <input id="immatriculation" value={form.immatriculation || ''} onChange={(e) => update('immatriculation', e.target.value)} />

        <label htmlFor="annee">Année</label>
        <input id="annee" type="number" value={form.annee || ''} onChange={(e) => update('annee', e.target.value)} />

        <label htmlFor="date_achat">Date d'achat</label>
        <input id="date_achat" type="date" value={form.date_achat || ''} onChange={(e) => update('date_achat', e.target.value)} />

        <label htmlFor="kilometrage">Kilométrage actuel</label>
        <input id="kilometrage" type="number" value={form.kilometrage || ''} onChange={(e) => update('kilometrage', e.target.value)} />

        <label htmlFor="etat">État</label>
        <select id="etat" value={form.etat} onChange={(e) => update('etat', e.target.value)}>
          <option value="roulante">Roulante</option>
          <option value="entretien">Besoin d'entretien</option>
          <option value="restauration">Besoin de restauration</option>
          <option value="non_roulante">Non roulante (pas destinée à rouler)</option>
        </select>

        <label htmlFor="dernier_roulage">Dernier roulage</label>
        <input id="dernier_roulage" type="date" value={form.dernier_roulage || ''} onChange={(e) => update('dernier_roulage', e.target.value)} />
        <p style={{ fontSize: 13, color: '#6b6a63', marginTop: -8 }}>
          Une alerte "Aurait besoin de rouler" apparaît automatiquement après 12 mois sans roulage.
        </p>

        <label htmlFor="galerie">Ajouter des photos</label>
        <input
          id="galerie"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setNouvellesPhotos(Array.from(e.target.files || []))}
        />

        {error && <p style={{ color: '#8a1f1f' }}>{error}</p>}
        <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={envoi}>
          {envoi ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>

      {!estNouveau && galerie.length > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>Photos</h2>
          <p style={{ fontSize: 13, color: '#6b6a63', marginTop: -8 }}>
            Clique sur une photo pour en faire la photo principale de la fiche.
          </p>
          <div className="grid">
            {galerie.map((p) => {
              const estPrincipale = form.photo_principale_url === p.url;
              return (
                <div
                  key={p.id}
                  onClick={() => !estPrincipale && definirPrincipale(p.url)}
                  style={{ position: 'relative', cursor: estPrincipale ? 'default' : 'pointer' }}
                >
                  <img
                    src={p.url}
                    alt=""
                    className="photo-carree"
                    style={{ outline: estPrincipale ? '3px solid var(--ink)' : 'none', outlineOffset: -3 }}
                  />
                  {estPrincipale && (
                    <span
                      style={{
                        position: 'absolute', top: 6, right: 6,
                        background: 'var(--ink)', color: 'var(--paper)',
                        borderRadius: '50%', width: 26, height: 26,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14,
                      }}
                      title="Photo principale"
                    >
                      ★
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); supprimerPhoto(p); }}
                    style={{
                      position: 'absolute', top: 6, left: 6,
                      minHeight: 26, width: 26, padding: 0,
                      borderRadius: '50%', background: 'var(--paper)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, lineHeight: 1,
                    }}
                    title="Supprimer cette photo"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!estNouveau && (
        <>
          <h2 style={{ marginTop: 28 }}>Notes d'entretien</h2>
          <div className="card">
            <label htmlFor="nouvelle_note">Ajouter une note</label>
            <textarea id="nouvelle_note" rows={2} value={nouvelleNote} onChange={(e) => setNouvelleNote(e.target.value)} />
            <button type="button" className="btn" style={{ width: '100%' }} onClick={ajouterNoteManuelle} disabled={!nouvelleNote.trim()}>
              Ajouter
            </button>
          </div>
          {notesEntretien.length === 0 && <p style={{ color: '#6b6a63' }}>Aucune note pour l'instant.</p>}
          {notesEntretien.map((n) => (
            <div key={n.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ margin: '0 0 4px' }}>{n.contenu}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#6b6a63' }}>
                  {n.auteur ? `${n.auteur} · ` : ''}{formatDateFR(n.created_at?.slice(0, 10))}
                  {n.source === 'retour' ? ' · signalé au retour' : ''}
                </p>
              </div>
              <button type="button" onClick={() => supprimerNote(n.id)}>Supprimer</button>
            </div>
          ))}
        </>
      )}

      {!estNouveau && (
        <>
          <h2 style={{ marginTop: 28 }}>Récapitulatif des frais</h2>
          <div className="card">
            <p style={{ margin: '0 0 4px' }}><strong>Prix d'achat (brut) :</strong> {prixAchatBrut.toLocaleString('fr-FR')} €</p>
            <p style={{ margin: '0 0 4px' }}><strong>Frais d'achat :</strong> {fraisAchat.toLocaleString('fr-FR')} €</p>
            <p style={{ margin: '0 0 4px' }}><strong>Frais d'entretien :</strong> {totalFrais.toLocaleString('fr-FR')} €</p>
            <p style={{ margin: '0 0 10px' }}><strong>Total général :</strong> {totalGeneral.toLocaleString('fr-FR')} €</p>
            <button
              type="button"
              className="btn"
              style={{ width: '100%' }}
              onClick={analyserTousLesDocuments}
              disabled={analyseGlobaleEnCours || documents.every((d) => d.montant != null)}
            >
              {analyseGlobaleEnCours ? 'Analyse en cours...' : 'Analyser automatiquement les documents sans montant'}
            </button>
            {Object.keys(montantsEdites).length > 0 && (
              <button
                type="button"
                className="btn-primary btn"
                style={{ width: '100%', marginTop: 10 }}
                onClick={async () => {
                  for (const docId of Object.keys(montantsEdites)) {
                    const doc = documents.find((d) => d.id === docId);
                    if (doc) await enregistrerMontant(doc);
                  }
                }}
              >
                Enregistrer tous les montants proposés ({Object.keys(montantsEdites).length})
              </button>
            )}
          </div>

          <h2 style={{ marginTop: 28 }}>Ajouter un document/frais</h2>
          <div className="card">
            <label htmlFor="type_document">Type</label>
            <select id="type_document" value={typeDocument} onChange={(e) => setTypeDocument(e.target.value)}>
              {Object.entries(TYPES_DOCUMENTS).map(([valeur, label]) => (
                <option key={valeur} value={valeur}>{label}</option>
              ))}
            </select>
            <label htmlFor="montant_document">Montant (€)</label>
            <input id="montant_document" type="number" step="0.01" placeholder="Facultatif" value={montantDocument} onChange={(e) => setMontantDocument(e.target.value)} />
            <label htmlFor="fichier_document">Fichier (facultatif — laisse vide pour un frais sans justificatif)</label>
            <input
              id="fichier_document"
              type="file"
              onChange={(e) => setFichierDocument(e.target.files?.[0] || null)}
            />
            {!fichierDocument && (
              <>
                <label htmlFor="nom_document_manuel">Description</label>
                <input
                  id="nom_document_manuel"
                  placeholder="Ex. Prix d'achat payé en liquide"
                  value={nomDocumentManuel}
                  onChange={(e) => setNomDocumentManuel(e.target.value)}
                />
              </>
            )}
            <button
              type="button"
              className="btn"
              style={{ width: '100%' }}
              disabled={(!fichierDocument && !montantDocument && !nomDocumentManuel.trim()) || envoiDocument}
              onClick={handleAjoutDocument}
            >
              {envoiDocument ? 'Envoi...' : 'Ajouter'}
            </button>
          </div>

          <h2 style={{ marginTop: 28 }}>Documents enregistrés</h2>
          {documents.length === 0 && <p style={{ color: '#6b6a63' }}>Aucun document ajouté pour l'instant.</p>}
          {documents.map((d) => {
            const modifie = montantsEdites[d.id] !== undefined;
            return (
              <div key={d.id} className="card">
                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                  {apercus[d.id] ? (
                    <img
                      src={apercus[d.id]}
                      alt=""
                      onClick={() => d.chemin && voirDocument(d.chemin)}
                      style={{ width: 56, height: 56, objectFit: 'cover', border: '1px solid var(--ink)', flexShrink: 0, cursor: d.chemin ? 'pointer' : 'default' }}
                    />
                  ) : (
                    <div
                      onClick={() => d.chemin && voirDocument(d.chemin)}
                      style={{
                        width: 56, height: 56, flexShrink: 0, border: '1px solid var(--ink)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, textAlign: 'center', color: '#6b6a63', background: 'var(--gris)',
                        cursor: d.chemin ? 'pointer' : 'default',
                      }}
                    >
                      {d.chemin ? 'PDF' : 'Sans fichier'}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <select
                      value={d.type}
                      onChange={(e) => changerTypeDocument(d, e.target.value)}
                      style={{ marginBottom: 6, minHeight: 40, fontSize: 14 }}
                    >
                      {Object.entries(TYPES_DOCUMENTS).map(([valeur, label]) => (
                        <option key={valeur} value={valeur}>{label}</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        value={nomsEdites[d.id] !== undefined ? nomsEdites[d.id] : d.nom_fichier}
                        onChange={(e) => setNomsEdites((n) => ({ ...n, [d.id]: e.target.value }))}
                        style={{ marginBottom: 0, fontSize: 14, flex: 1 }}
                      />
                      {nomsEdites[d.id] !== undefined && nomsEdites[d.id] !== d.nom_fichier && (
                        <button type="button" onClick={() => renommerDocument(d, nomsEdites[d.id])} style={{ whiteSpace: 'nowrap' }}>
                          Renommer
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Montant (€)"
                    value={montantAffiche(d)}
                    onChange={(e) => setMontantsEdites((m) => ({ ...m, [d.id]: e.target.value }))}
                    style={{ marginBottom: 0, flex: 1 }}
                  />
                  <button
                    type="button"
                    className={modifie ? 'btn-primary' : ''}
                    onClick={() => enregistrerMontant(d)}
                    disabled={!modifie || enregistrementEnCours === d.id}
                  >
                    {enregistrementEnCours === d.id ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {d.chemin && (
                    <button type="button" style={{ flex: 1 }} onClick={() => analyserDocument(d)} disabled={analyseEnCours === d.id}>
                      {analyseEnCours === d.id ? 'Analyse...' : 'Analyser'}
                    </button>
                  )}
                  {d.chemin && (
                    <button type="button" style={{ flex: 1 }} onClick={() => voirDocument(d.chemin)}>Voir</button>
                  )}
                  <button type="button" style={{ flex: 1 }} onClick={() => supprimerDocument(d.id)}>Supprimer</button>
                </div>

                {erreursDocuments[d.id] && (
                  <p style={{ color: '#8a1f1f', fontSize: 14, margin: '8px 0 0' }}>{erreursDocuments[d.id]}</p>
                )}
              </div>
            );
          })}
        </>
      )}

      {!estNouveau && (
        <button
          type="button"
          onClick={supprimerMoto}
          style={{ width: '100%', marginTop: 40, marginBottom: 20, borderColor: '#8a1f1f', color: '#8a1f1f' }}
        >
          Supprimer cette moto
        </button>
      )}
    </div>
  );
}
