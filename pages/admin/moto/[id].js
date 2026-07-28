import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabaseClient';
import { useUser } from '../../../lib/useUser';

const vide = {
  marque: '', modele: '', annee: '', date_achat: '', kilometrage: '',
  etat: 'roulante', frequence_roulage_mois: 12, dernier_roulage: '',
  dernier_ct: '', frequence_ct_mois: 24, notes_entretien: '',
  photo_principale_url: '',
};

// Convertit les chaînes vides en null pour les champs de type date
// (Postgres refuse une chaîne vide comme valeur de date)
function nettoyerDates(form) {
  const copie = { ...form };
  ['date_achat', 'dernier_roulage', 'dernier_ct'].forEach((champ) => {
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
  const [photo, setPhoto] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || estNouveau) return;
    supabase.from('motos').select('*').eq('id', id).single().then(({ data }) => {
      if (data) setForm(data);
    });
  }, [id]);

  function update(champ, valeur) {
    setForm((f) => ({ ...f, [champ]: valeur }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setEnvoi(true);

    let photoUrl = form.photo_principale_url;
    if (photo) {
      const chemin = `motos/${Date.now()}-${photo.name}`;
      const { error: uploadError } = await supabase.storage.from('photos').upload(chemin, photo);
      if (!uploadError) {
        const { data: publicUrl } = supabase.storage.from('photos').getPublicUrl(chemin);
        photoUrl = publicUrl.publicUrl;
      }
    }

    const payload = nettoyerDates({
      ...form,
      annee: form.annee ? parseInt(form.annee, 10) : null,
      kilometrage: form.kilometrage ? parseInt(form.kilometrage, 10) : 0,
      frequence_roulage_mois: form.frequence_roulage_mois ? parseInt(form.frequence_roulage_mois, 10) : null,
      frequence_ct_mois: form.frequence_ct_mois ? parseInt(form.frequence_ct_mois, 10) : null,
      photo_principale_url: photoUrl,
    });

    let result;
    if (estNouveau) {
      result = await supabase.from('motos').insert(payload).select().single();
    } else {
      result = await supabase.from('motos').update(payload).eq('id', id).select().single();
    }

    setEnvoi(false);
    if (result.error) {
      setError(`Erreur : ${result.error.message}`);
      return;
    }
    router.replace(`/moto/${result.data.id}`);
  }

  if (loading) return null;
  if (!profile?.is_admin) return <div className="page"><p>Accès réservé à l'administrateur.</p></div>;

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

        <label htmlFor="frequence">Rappel : faire rouler tous les combien de mois ?</label>
        <input id="frequence" type="number" value={form.frequence_roulage_mois || ''} onChange={(e) => update('frequence_roulage_mois', e.target.value)} />

        <label htmlFor="dernier_ct">Dernier contrôle technique</label>
        <input id="dernier_ct" type="date" value={form.dernier_ct || ''} onChange={(e) => update('dernier_ct', e.target.value)} />

        <label htmlFor="frequence_ct">Rappel CT tous les combien de mois ?</label>
        <input id="frequence_ct" type="number" value={form.frequence_ct_mois || ''} onChange={(e) => update('frequence_ct_mois', e.target.value)} />

        <label htmlFor="notes">Notes d'entretien</label>
        <textarea id="notes" rows={4} value={form.notes_entretien || ''} onChange={(e) => update('notes_entretien', e.target.value)} />

        <label htmlFor="photo">Photo principale</label>
        <input id="photo" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />

        {error && <p style={{ color: '#8a1f1f' }}>{error}</p>}
        <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={envoi}>
          {envoi ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>
    </div>
  );
}
