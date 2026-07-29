import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabaseClient';
import { useUser } from '../../../lib/useUser';
import { compresserImage } from '../../../lib/image';
import { formatDateFR } from '../../../lib/format';

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

  if (loading) return null;
  if (!profile?.is_admin) return <div className="page"><p>Accès réservé à l'administrateur.</p></div>;

  const prixAchat = documents.filter((d) => d.type === 'achat').reduce((s, d) => s + (d.montant || 0), 0);
  const totalFrais = documents.filter((d) => d.type === 'entretien').reduce((s, d) => s + (d.montant || 0), 0);
  const totalGeneral = prixAchat + totalFrais;

  return (
    <div className="page" style={{ maxWidth: 480 }}>
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
          <div className="grid">
            {galerie.map((p) => (
              <div key={p.id}>
                <img src={p.url} alt="" className="photo-carree" style={{ marginBottom: 6 }} />
                {form.photo_principale_url === p.url ? (
                  <span className="badge badge-vert">Photo principale</span>
                ) : (
                  <button type="button" onClick={() => definirPrincipale(p.url)} style={{ width: '100%', minHeight: 40 }}>
                    Définir comme principale
                  </button>
                )}
              </div>
            ))}
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
            <p style={{ margin: 0 }}><strong>Total général :</strong> {totalGeneral.toLocaleString('fr-FR')} €</p>
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
