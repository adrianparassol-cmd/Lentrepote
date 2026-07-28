import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useUser } from '../lib/useUser';

export default function Retour() {
  const router = useRouter();
  const { sortieId } = router.query;
  const { loading } = useUser();
  const [sortie, setSortie] = useState(null);
  const [moto, setMoto] = useState(null);
  const [km, setKm] = useState('');
  const [note, setNote] = useState(8);
  const [commentaire, setCommentaire] = useState('');
  const [noteEntretien, setNoteEntretien] = useState('');
  const [photos, setPhotos] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sortieId) return;
    (async () => {
      const { data: sortieData } = await supabase.from('sorties').select('*').eq('id', sortieId).single();
      setSortie(sortieData);
      if (sortieData) {
        const { data: motoData } = await supabase.from('motos').select('*').eq('id', sortieData.moto_id).single();
        setMoto(motoData);
      }
    })();
  }, [sortieId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!km) return;
    setEnvoi(true);

    const { error: updateError } = await supabase
      .from('sorties')
      .update({
        date_retour: new Date().toISOString(),
        km_retour: parseInt(km, 10),
        note_sur_10: note,
        commentaire,
        note_entretien: noteEntretien,
        statut: 'terminee',
      })
      .eq('id', sortieId);

    if (updateError) {
      setError(`Erreur : ${updateError.message}`);
      setEnvoi(false);
      return;
    }

    await supabase.from('motos').update({
      kilometrage: parseInt(km, 10),
      dernier_roulage: new Date().toISOString().slice(0, 10),
    }).eq('id', moto.id);

    for (const fichier of photos) {
      const chemin = `sorties/${sortieId}-${Date.now()}-${fichier.name}`;
      const { error: uploadError } = await supabase.storage.from('photos').upload(chemin, fichier);
      if (!uploadError) {
        const { data: publicUrl } = supabase.storage.from('photos').getPublicUrl(chemin);
        await supabase.from('photos_sortie').insert({ sortie_id: sortieId, url: publicUrl.publicUrl });
      }
    }

    setEnvoi(false);
    router.replace(`/moto/${moto.id}`);
  }

  if (loading || !sortie || !moto) return null;

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <h1>Retour de {moto.marque} {moto.modele}</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="km">Kilométrage affiché au retour</label>
        <input
          id="km"
          type="number"
          inputMode="numeric"
          value={km}
          onChange={(e) => setKm(e.target.value)}
          placeholder={String(sortie.km_depart)}
          required
        />

        <label>Quelle note donnes-tu à cette moto ? {note}/10</label>
        <input
          type="range"
          min="0"
          max="10"
          value={note}
          onChange={(e) => setNote(parseInt(e.target.value, 10))}
          style={{ minHeight: 40, marginBottom: 20 }}
        />

        <label htmlFor="commentaire">Un commentaire sur la balade ? (facultatif)</label>
        <textarea
          id="commentaire"
          rows={3}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
        />

        <label htmlFor="entretien">Quelque chose à signaler pour l'entretien ? (facultatif)</label>
        <textarea
          id="entretien"
          rows={3}
          value={noteEntretien}
          onChange={(e) => setNoteEntretien(e.target.value)}
        />

        <label htmlFor="photo">Ajouter des photos (facultatif)</label>
        <input
          id="photo"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files || []))}
        />

        {error && <p style={{ color: '#8a1f1f' }}>{error}</p>}
        <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={envoi}>
          {envoi ? 'Enregistrement...' : 'Je rends la moto'}
        </button>
      </form>
    </div>
  );
}
