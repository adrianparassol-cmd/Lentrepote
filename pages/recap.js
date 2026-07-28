import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useUser } from '../lib/useUser';
import Masthead from '../components/Masthead';

export default function Recap() {
  const router = useRouter();
  const { profile, loading } = useUser();
  const [motos, setMotos] = useState([]);
  const [sortiesEnCours, setSortiesEnCours] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      const { data: motosData } = await supabase.from('motos').select('*').order('marque');
      const { data: sortiesData } = await supabase
        .from('sorties')
        .select('*, profiles(nom)')
        .eq('statut', 'en_cours');
      setMotos(motosData || []);
      setSortiesEnCours(sortiesData || []);
    }
    load();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return null;

  const filtered = motos.filter((m) => {
    const q = search.toLowerCase();
    return m.marque.toLowerCase().includes(q) || m.modele.toLowerCase().includes(q);
  });

  function statutDe(moto) {
    if (moto.etat === 'restauration') return { label: 'À restaurer', classe: 'badge-rouge' };
    if (moto.etat === 'entretien') return { label: 'Entretien requis', classe: 'badge-rouge' };
    const sortie = sortiesEnCours.find((s) => s.moto_id === moto.id);
    if (sortie) return { label: `Sortie par ${sortie.profiles?.nom || '...'}`, classe: 'badge-orange' };
    return { label: 'Disponible', classe: 'badge-vert' };
  }

  return (
    <div className="page">
      <Masthead />
      <div className="top-bar">
        <h1>Les motos</h1>
        <button onClick={handleLogout}>Se déconnecter</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <input
          placeholder="Rechercher (marque, modèle...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 0 }}
        />
        {profile?.is_admin && (
          <Link href="/admin" className="btn" style={{ whiteSpace: 'nowrap' }}>
            Back-office
          </Link>
        )}
      </div>

      <div className="grid">
        {filtered.map((moto) => {
          const statut = statutDe(moto);
          return (
            <Link key={moto.id} href={`/moto/${moto.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              {moto.photo_principale_url ? (
                <img src={moto.photo_principale_url} alt={`${moto.marque} ${moto.modele}`} className="photo-carree" style={{ marginBottom: 10 }} />
              ) : (
                <div className="photo-placeholder photo-carree" style={{ marginBottom: 10 }}>Pas de photo</div>
              )}
              <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{moto.marque} {moto.modele}</p>
              <p style={{ fontSize: 14, color: '#6b6a63', margin: '0 0 10px' }}>{moto.annee} · {moto.kilometrage?.toLocaleString('fr-FR')} km</p>
              <span className={`badge ${statut.classe}`}>{statut.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
