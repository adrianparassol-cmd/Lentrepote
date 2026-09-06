import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { useUser } from '../lib/useUser';
import Masthead from '../components/Masthead';
import NavBar from '../components/NavBar';

export default function Profil() {
  const { profile, loading } = useUser();
  const [sorties, setSorties] = useState([]);
  const [souhaits, setSouhaits] = useState([]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data: sortiesData } = await supabase
        .from('sorties')
        .select('*, motos(id, marque, modele, photo_principale_url)')
        .eq('user_id', profile.id)
        .eq('statut', 'terminee')
        .order('date_depart', { ascending: false });
      setSorties(sortiesData || []);

      const { data: souhaitsData } = await supabase
        .from('souhaits')
        .select('*, motos(id, marque, modele, photo_principale_url)')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      setSouhaits(souhaitsData || []);
    })();
  }, [profile]);

  async function retirerDeLaListe(motoId) {
    await supabase.from('souhaits').delete().eq('user_id', profile.id).eq('moto_id', motoId);
    setSouhaits((s) => s.filter((x) => x.moto_id !== motoId));
  }

  if (loading || !profile) return null;

  const totalKm = sorties.reduce((s, sortie) => {
    if (sortie.km_depart != null && sortie.km_retour != null) {
      return s + Math.max(0, sortie.km_retour - sortie.km_depart);
    }
    return s;
  }, 0);

  // Dernières motos essayées (distinctes, la plus récente en premier)
  const dernieresMotos = [];
  const vues = new Set();
  for (const s of sorties) {
    if (s.motos && !vues.has(s.motos.id)) {
      vues.add(s.motos.id);
      dernieresMotos.push(s.motos);
    }
    if (dernieresMotos.length >= 5) break;
  }

  // Classement des motos préférées, basé sur tes propres notes
  const parMoto = {};
  sorties.forEach((s) => {
    if (!s.motos || s.note_sur_10 == null) return;
    if (!parMoto[s.motos.id]) parMoto[s.motos.id] = { moto: s.motos, notes: [] };
    parMoto[s.motos.id].notes.push(s.note_sur_10);
  });
  const classement = Object.values(parMoto)
    .map((entry) => ({
      moto: entry.moto,
      moyenne: entry.notes.reduce((a, b) => a + b, 0) / entry.notes.length,
    }))
    .sort((a, b) => b.moyenne - a.moyenne)
    .slice(0, 5);

  return (
    <div className="page">
      <Masthead />
      <NavBar isAdmin={profile?.is_admin} />
      <div className="top-bar">
        <h1>{profile.nom}</h1>
      </div>

      <div className="card">
        <p style={{ margin: 0 }}><strong>{totalKm.toLocaleString('fr-FR')} km</strong> parcourus au total · {sorties.length} sortie{sorties.length > 1 ? 's' : ''}</p>
      </div>

      {classement.length > 0 && (
        <>
          <h2>Tes motos préférées</h2>
          <div className="grid" style={{ marginBottom: 20 }}>
            {classement.map(({ moto, moyenne }) => (
              <Link key={moto.id} href={`/moto/${moto.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                {moto.photo_principale_url ? (
                  <img src={moto.photo_principale_url} alt="" className="photo-carree" style={{ marginBottom: 8 }} />
                ) : (
                  <div className="photo-placeholder photo-carree" style={{ marginBottom: 8 }}>Photo</div>
                )}
                <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{moto.marque} {moto.modele}</p>
                <span className="badge badge-vert">{moyenne.toFixed(1)}/10</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {dernieresMotos.length > 0 && (
        <>
          <h2>Dernières motos essayées</h2>
          <div className="grid" style={{ marginBottom: 20 }}>
            {dernieresMotos.map((moto) => (
              <Link key={moto.id} href={`/moto/${moto.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                {moto.photo_principale_url ? (
                  <img src={moto.photo_principale_url} alt="" className="photo-carree" style={{ marginBottom: 8 }} />
                ) : (
                  <div className="photo-placeholder photo-carree" style={{ marginBottom: 8 }}>Photo</div>
                )}
                <p style={{ fontWeight: 600, margin: 0 }}>{moto.marque} {moto.modele}</p>
              </Link>
            ))}
          </div>
        </>
      )}

      <h2>Ta liste à essayer</h2>
      {souhaits.length === 0 && <p style={{ color: '#6b6a63' }}>Rien pour l'instant — ajoute des motos depuis leur fiche.</p>}
      {souhaits.map((s) => (
        <div key={s.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href={`/moto/${s.motos.id}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}>
            {s.motos.marque} {s.motos.modele}
          </Link>
          <button type="button" onClick={() => retirerDeLaListe(s.motos.id)}>Retirer</button>
        </div>
      ))}
    </div>
  );
}
