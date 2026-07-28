import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useUser } from '../lib/useUser';

export default function Sortie() {
  const router = useRouter();
  const { motoId } = router.query;
  const { profile, loading } = useUser();
  const [motos, setMotos] = useState([]);
  const [sortiesEnCours, setSortiesEnCours] = useState([]);
  const [mesSorties, setMesSorties] = useState([]);
  const [search, setSearch] = useState('');
  const [motoChoisie, setMotoChoisie] = useState(null);
  const [km, setKm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (motoId && motos.length) {
      setMotoChoisie(motos.find((m) => m.id === motoId) || null);
    }
  }, [motoId, motos]);

  async function load() {
    const { data: motosData } = await supabase.from('motos').select('*').eq('etat', 'roulante').order('marque');
    const { data: sortiesData } = await supabase.from('sorties').select('*').eq('statut', 'en_cours');
    setMotos(motosData || []);
    setSortiesEnCours(sortiesData || []);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: mine } = await supabase.from('sorties').select('moto_id').eq('user_id', session.user.id);
      setMesSorties(mine || []);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setError('');
    if (!km) return;
    const { error } = await supabase.from('sorties').insert({
      moto_id: motoChoisie.id,
      user_id: profile.id,
      km_depart: parseInt(km, 10),
      statut: 'en_cours',
    });
    if (error) {
      setError("Une erreur est survenue, réessaie.");
      return;
    }
    router.replace(`/moto/${motoChoisie.id}`);
  }

  if (loading) return null;

  const disponibles = motos.filter((m) => !sortiesEnCours.find((s) => s.moto_id === m.id));

  if (!motoChoisie) {
    const frequence = {};
    mesSorties.forEach((s) => { frequence[s.moto_id] = (frequence[s.moto_id] || 0) + 1; });
    const habituelles = disponibles
      .filter((m) => frequence[m.id])
      .sort((a, b) => frequence[b.id] - frequence[a.id])
      .slice(0, 4);

    const q = search.toLowerCase();
    const resultats = q
      ? disponibles.filter((m) => m.marque.toLowerCase().includes(q) || m.modele.toLowerCase().includes(q))
      : disponibles;

    return (
      <div className="page" style={{ maxWidth: 420 }}>
        <p style={{ color: '#6b6a63', margin: '0 0 4px' }}>Étape 1</p>
        <h1>Quelle moto prends-tu ?</h1>
        <input
          placeholder="Rechercher (marque, modèle...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!q && habituelles.length > 0 && (
          <>
            <h2>Tes habituelles</h2>
            <div className="grid" style={{ marginBottom: 20 }}>
              {habituelles.map((m) => (
                <button key={m.id} onClick={() => setMotoChoisie(m)} style={{ flexDirection: 'column', height: 'auto', padding: 12 }}>
                  {m.photo_principale_url
                    ? <img src={m.photo_principale_url} alt="" className="photo-carree" style={{ marginBottom: 8 }} />
                    : <div className="photo-placeholder photo-carree" style={{ marginBottom: 8 }}>Photo</div>}
                  {m.marque} {m.modele}
                </button>
              ))}
            </div>
          </>
        )}
        <h2>{q ? 'Résultats' : 'Toutes les motos disponibles'}</h2>
        <div className="grid">
          {resultats.map((m) => (
            <button key={m.id} onClick={() => setMotoChoisie(m)} style={{ flexDirection: 'column', height: 'auto', padding: 12 }}>
              {m.photo_principale_url
                ? <img src={m.photo_principale_url} alt="" className="photo-carree" style={{ marginBottom: 8 }} />
                : <div className="photo-placeholder photo-carree" style={{ marginBottom: 8 }}>Photo</div>}
              {m.marque} {m.modele}
            </button>
          ))}
          {resultats.length === 0 && <p style={{ color: '#6b6a63' }}>Aucune moto trouvée.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <p style={{ color: '#6b6a63', margin: '0 0 4px' }}>Étape 2</p>
      <h1>{motoChoisie.marque} {motoChoisie.modele}</h1>
      <form onSubmit={handleConfirm}>
        <label htmlFor="km">Kilométrage affiché au départ</label>
        <input
          id="km"
          type="number"
          inputMode="numeric"
          value={km}
          onChange={(e) => setKm(e.target.value)}
          placeholder={String(motoChoisie.kilometrage || '')}
          required
        />
        {error && <p style={{ color: '#8a1f1f' }}>{error}</p>}
        <button type="submit" className="btn-primary" style={{ width: '100%' }}>Je pars</button>
        <button type="button" onClick={() => setMotoChoisie(null)} style={{ width: '100%', marginTop: 10 }}>Changer de moto</button>
      </form>
    </div>
  );
}
