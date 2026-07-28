import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useUser } from '../../lib/useUser';

export default function FicheMoto() {
  const router = useRouter();
  const { id } = router.query;
  const { profile, loading } = useUser();
  const [moto, setMoto] = useState(null);
  const [historique, setHistorique] = useState([]);
  const [sortieActive, setSortieActive] = useState(null);

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  async function load() {
    const { data: motoData } = await supabase.from('motos').select('*').eq('id', id).single();
    const { data: sortiesData } = await supabase
      .from('sorties')
      .select('*, profiles(nom)')
      .eq('moto_id', id)
      .order('date_depart', { ascending: false });
    setMoto(motoData);
    setHistorique(sortiesData || []);
    setSortieActive((sortiesData || []).find((s) => s.statut === 'en_cours') || null);
  }

  if (loading || !moto) return null;

  const disponible = moto.etat === 'roulante' && !sortieActive;
  const cestMaSortie = sortieActive && profile && sortieActive.user_id === profile.id;

  return (
    <div className="page">
      <Link href="/recap">← Retour à la liste</Link>
      <h1 style={{ marginTop: 12 }}>{moto.marque} {moto.modele}</h1>

      {moto.photo_principale_url ? (
        <img src={moto.photo_principale_url} alt="" style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 12, marginBottom: 16 }} />
      ) : (
        <div className="photo-placeholder" style={{ height: 220 }}>Pas de photo</div>
      )}

      <div className="card">
        <p><strong>Année :</strong> {moto.annee || '—'}</p>
        <p><strong>Date d'achat :</strong> {moto.date_achat || '—'}</p>
        <p><strong>Kilométrage :</strong> {moto.kilometrage?.toLocaleString('fr-FR')} km</p>
        <p><strong>Prochain contrôle technique :</strong> {moto.prochain_ct || '—'}</p>
        <p><strong>Notes d'entretien :</strong> {moto.notes_entretien || '—'}</p>
        {sortieActive && (
          <p><strong>Actuellement sortie par :</strong> {sortieActive.profiles?.nom}</p>
        )}
      </div>

      {profile?.is_admin && (
        <Link href={`/admin/moto/${moto.id}`} className="btn" style={{ marginBottom: 14, display: 'inline-flex' }}>
          Modifier la fiche
        </Link>
      )}

      {disponible && (
        <Link href={`/sortie?motoId=${moto.id}`} className="btn-primary btn" style={{ width: '100%', marginBottom: 20 }}>
          Je pars avec cette moto
        </Link>
      )}
      {cestMaSortie && (
        <Link href={`/retour?sortieId=${sortieActive.id}`} className="btn-primary btn" style={{ width: '100%', marginBottom: 20 }}>
          Je rends cette moto
        </Link>
      )}

      <h2>Historique des sorties</h2>
      {historique.filter((s) => s.statut === 'terminee').length === 0 && (
        <p style={{ color: '#6b6a63' }}>Aucune sortie enregistrée pour l'instant.</p>
      )}
      {historique.filter((s) => s.statut === 'terminee').map((s) => (
        <div key={s.id} className="card">
          <p style={{ margin: '0 0 4px' }}>
            <strong>{s.profiles?.nom}</strong> · {new Date(s.date_depart).toLocaleDateString('fr-FR')}
          </p>
          <p style={{ margin: '0 0 4px', color: '#6b6a63' }}>
            {s.km_depart?.toLocaleString('fr-FR')} km → {s.km_retour?.toLocaleString('fr-FR')} km
            {s.note_sur_10 ? ` · Note : ${s.note_sur_10}/10` : ''}
          </p>
          {s.commentaire && <p style={{ margin: '0 0 4px' }}>{s.commentaire}</p>}
          {s.note_entretien && <p style={{ margin: 0, fontStyle: 'italic' }}>Entretien : {s.note_entretien}</p>}
        </div>
      ))}
    </div>
  );
}
