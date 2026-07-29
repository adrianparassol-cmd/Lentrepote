import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabaseClient';
import { useUser } from '../../../lib/useUser';
import { compresserImage } from '../../../lib/image';
import { formatDateFR } from '../../../lib/format';
import NavBar from '../../../components/NavBar';

const vide = {
  marque: '', modele: '', annee: '', date_achat: '', kilometrage: '',
  etat: 'roulante', dernier_roulage: '', photo_principale_url: '',
};

const TYPES_DOCUMENTS = {
  achat: "Facture d'achat",
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
  const [typeDocument, setTypeDocument] = useState('achat');
  const [montantDocument, setMontantDocument] = useState('');
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

  async function chargerDocuments() {
    const { data } = await supabase.from('documents_moto').select('*').eq('moto_id', id).order('created_at', { ascending: false });
    setDocuments(data || []);
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
      const { error: uploadError } = await supabase.storage.from('photos').upload(chemin, compressee);
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
    if (!fichierDocument || estNouveau) return;
    setEnvoiDocument(true);
    const chemin = `${id}/${Date.now()}-${fichierDocument.name}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(chemin, fichierDocument);
    if (!uploadError) {
      await supabase.from('documents_moto').insert({
        moto_id: id,
        type: typeDocument,
        chemin,
        nom_fichier: fichierDocument.name,
        montant: montantDocument ? parseFloat(montantDocument) : null,
      });
      setFichierDocument(null);
      setMontantDocument('');
      await chargerDocuments();
    }
    setEnvoiDocument(false);
  }

  async function supprimerDocument(docId) {
    await supabase.from('documents_moto').delete().eq('id', docId);
    chargerDocuments();
  }

  async function voirDocument(chemin) {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(chemin, 3600);
    if (!error && data) window.open(data.signedUrl, '_blank');
  }

  const [analyseEnCours, setAnalyseEnCours] = useState(null);
  const [analyseGlobaleEnCours, setAnalyseGlobaleEnCours] = useState(false);

  async function analyserDocument(doc) {
    setAnalyseEnCours(doc.id);
    try {
      const res = await fetch('/api/analyser-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chemin: doc.chemin }),
      });
      const resultat = await res.json();
      if (resultat.error) {
        setError(`Erreur d'analyse (${doc.nom_fichier}) : ${resultat.error}`);
        return;
      }
      if (resultat.montant != null) {
        await supabase.from('documents_moto').update({ montant: resultat.montant }).eq('id', doc.id);
      }
      // Pré-remplit l'année / la date d'achat de la moto si elles sont encore vides
      if (resultat.annee && !form.annee) {
        await supabase.from('motos').update({ annee: resultat.annee }).eq('id', id);
        setForm((f) => ({ ...f, annee: resultat.annee }));
      }
      if (resultat.type === 'achat' && resultat.date && !form.date_achat) {
        await supabase.from('motos').update({ date_achat: resultat.date }).eq('id', id);
        setForm((f) => ({ ...f, date_achat: resultat.date }));
      }
      await chargerDocuments();
    } catch (err) {
      setError(`Erreur d'analyse : ${err.message}`);
    } finally {
      setAnalyseEnCours(null);
    }
  }

  async function analyserTousLesDocuments() {
    setAnalyseGlobaleEnCours(true);
    for (const doc of documents) {
      if (doc.montant == null) {
        await analyserDocument(doc);
      }
    }
    setAnalyseGlobaleEnCours(false);
  }

  if (loading) return null;
  if (!profile?.is_admin) return <div className="page"><p>Accès réservé à l'administrateur.</p></div>;

  const prixAchat = documents.filter((d) => d.type === 'achat').reduce((s, d) => s + (d.montant || 0), 0);
  const totalFrais = documents.filter((d) => d.type === 'entretien').reduce((s, d) => s + (d.montant || 0), 0);
  const totalGeneral = prixAchat + totalFrais;

  return (
    <div className="page" style={{ maxWidth: 480 }}>
      <NavBar isAdmin />
      <h1>{estNouveau ? 'Ajouter une moto' : 'Modifier la fiche'}</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="marque">Marque</label>
        <input id="marque" value={form.marque} onChange={(e) => update('marque', e.target.value)} required />

        <label htmlFor="modele">Modèle</label>
        <input id="modele" value={form.modele} onChange={(e) => update('modele', e.target.value)} required />

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
          <h2 style={{ marginTop: 28 }}>Factures et frais</h2>
          <div className="card">
            <p style={{ margin: '0 0 4px' }}><strong>Prix d'achat :</strong> {prixAchat.toLocaleString('fr-FR')} €</p>
            <p style={{ margin: '0 0 4px' }}><strong>Total des frais :</strong> {totalFrais.toLocaleString('fr-FR')} €</p>
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
          </div>

          <div className="card">
            <label htmlFor="type_document">Type de document</label>
            <select id="type_document" value={typeDocument} onChange={(e) => setTypeDocument(e.target.value)}>
              {Object.entries(TYPES_DOCUMENTS).map(([valeur, label]) => (
                <option key={valeur} value={valeur}>{label}</option>
              ))}
            </select>
            <label htmlFor="montant_document">Montant (€, facultatif)</label>
            <input id="montant_document" type="number" step="0.01" value={montantDocument} onChange={(e) => setMontantDocument(e.target.value)} />
            <label htmlFor="fichier_document">Fichier (PDF, photo...)</label>
            <input
              id="fichier_document"
              type="file"
              onChange={(e) => setFichierDocument(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              className="btn"
              style={{ width: '100%' }}
              disabled={!fichierDocument || envoiDocument}
              onClick={handleAjoutDocument}
            >
              {envoiDocument ? 'Envoi...' : 'Ajouter ce document'}
            </button>
          </div>

          {documents.length === 0 && <p style={{ color: '#6b6a63' }}>Aucun document ajouté pour l'instant.</p>}
          {documents.map((d) => (
            <div key={d.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{TYPES_DOCUMENTS[d.type] || 'Document'}</p>
                <p style={{ margin: 0, color: '#6b6a63', fontSize: 14 }}>
                  {d.nom_fichier}{d.montant != null ? ` · ${d.montant.toLocaleString('fr-FR')} €` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {d.montant == null && (
                  <button type="button" onClick={() => analyserDocument(d)} disabled={analyseEnCours === d.id}>
                    {analyseEnCours === d.id ? 'Analyse...' : 'Analyser'}
                  </button>
                )}
                <button type="button" onClick={() => voirDocument(d.chemin)}>Voir</button>
                <button type="button" onClick={() => supprimerDocument(d.id)}>Supprimer</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
