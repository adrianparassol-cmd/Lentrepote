import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useUser } from '../../lib/useUser';
import { formatDateFR, ajouterMois, estEnRetard } from '../../lib/format';

export default function FicheMoto() {
  const router = useRouter();
  const { id } = router.query;
  const { profile, loading } = useUser();
  const [moto, setMoto] = useState(null);
  const [historique, setHistorique] = useState([]);
  const [sortieActive, setSortieActive] = useState(null);
  const [photosParSortie, setPhotosParSortie] = useState({});

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

    const idsSorties = (sortiesData || []).map((s) => s.id);
    if (idsSorties.length) {
      const { data: photosData } = await supabase
        .from('photos_sortie')
        .select('*')
        .in('sortie_id', idsSorties);
      const groupees = {};
      (photosData || []).forEach((p) => {
        groupees[p.sortie_id] = groupees[p.sortie_id] || [];
        groupees[p.sortie_id].push(p);
      });
      setPhotosParSortie(groupees);
    }
  }

  if (loading || !moto) return null;

  const disponible = moto.etat === 'roulante' && !sortieActive;
  const cestMaSortie = sortieActive && profile && sortieActive.user_id === profile.id;
  const terminees = historique.filter((s) => s.statut === 'terminee');

  // Alerte roulage
  const prochainRoulage = moto.dernier_roulage && moto.frequence_roulage_mois
    ? ajouterMois(moto.dernier_roulage, moto.frequence_roulage_mois)
    : null;
  const besoinDeRouler = prochainRoulage ? estEnRetard(prochainRoulage) : false;

  // Alerte contrôle technique
  const prochainCT = moto.dernier_ct && moto.frequence_ct_mois
    ? ajouterMois(moto.dernier_ct, moto.frequence_ct_mois)
    : null;
  const ctDepasse = prochainCT ? estEnRetard(prochainCT) : false;

  // Note moyenne
  const notes = terminees.map((s) => s.note_sur_10).filter((n) => n !== null && n !== undefined);
  const moyenne = notes.length ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1) : null;

  // Récap par pilote
  const parPilote = {};
  terminees.forEach((s) => {
    const nom = s.profiles?.nom || 'Inconnu';
    if (!parPilote[nom]) parPilote[nom] = { sorties: 0, km: 0 };
    parPilote[nom].sorties += 1;
    if (s.km_depart != null && s.km_retour != null) {
      parPilote[nom].km += Math.max(0, s.km_retour - s.km_depart);
    }
  });

  return (
    <div className="page">
      <Link href="/recap">← Retour à la liste</Link>
      <h1 style={{ marginTop: 12 }}>{moto.marque} {moto.modele}</h1>

      {moto.photo_principale_url ? (
        <img src={moto.photo_principale_url} alt="" className="photo-carree" style={{ marginBottom: 16 }} />
      ) : (
        <div className="photo-placeholder photo-carree" style={{ marginBottom: 16 }}>Pas de photo</div>
      )}

      <div className="card">
        <p><strong>Année :</strong> {moto.annee || '—'}</p>
        <p><strong>Date d'achat :</strong> {formatDateFR(moto.date_achat) || '—'}</p>
        <p><strong>Kilométrage :</strong> {moto.kilometrage?.toLocaleString('fr-FR')} km</p>

        <p>
          <strong>Dernier roulage :</strong> {formatDateFR(moto.dernier_roulage) || '—'}
          {besoinDeRouler && <span className="badge badge-rouge" style={{ marginLeft: 8 }}>Aurait besoin de rouler</span>}
        </p>

        <p>
          <strong>Dernier contrôle technique :</strong> {formatDateFR(moto.dernier_ct) || '—'}
          {prochainCT && (
            <span style={{ color: '#6b6a63' }}> (prochain : {formatDateFR(prochainCT.toISOString().slice(0, 10))})</span>
          )}
          {ctDepasse && <span className="badge badge-rouge" style={{ marginLeft: 8 }}>CT à prévoir</span>}
        </p>

        <p><strong>Notes d'entretien :</strong> {moto.notes_entretien || '—'}</p>
        {sortieActive && (
          <p><strong>Actuellement utilisée par :</strong> {sortieActive.profiles?.nom}</p>
        )}
        {moyenne && (
          <p><strong>Note moyenne :</strong> {moyenne}/10 ({notes.length} avis)</p>
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

      {Object.keys(parPilote).length > 0 && (
        <>
          <h2>Par pilote</h2>
          <div className="card">
            {Object.entries(parPilote).map(([nom, info]) => (
              <p key={nom} style={{ margin: '0 0 8px' }}>
                <strong>{nom}</strong> · {info.sorties} sortie{info.sorties > 1 ? 's' : ''} · {info.km.toLocaleString('fr-FR')} km parcourus
              </p>
            ))}
          </div>
        </>
      )}

      <h2>Historique des sorties</h2>
      {terminees.length === 0 && (
        <p style={{ color: '#6b6a63' }}>Aucune sortie enregistrée pour l'instant.</p>
      )}
      {terminees.map((s) => (
        <div key={s.id} className="card">
          <p style={{ margin: '0 0 4px' }}>
            <strong>{s.profiles?.nom}</strong> · {formatDateFR(s.date_depart?.slice(0, 10))}
          </p>
          <p style={{ margin: '0 0 4px', color: '#6b6a63' }}>
            {s.km_depart?.toLocaleString('fr-FR')} km → {s.km_retour?.toLocaleString('fr-FR')} km
            {s.note_sur_10 != null ? ` · Note : ${s.note_sur_10}/10` : ''}
          </p>
          {s.commentaire && <p style={{ margin: '0 0 4px' }}>{s.commentaire}</p>}
          {s.note_entretien && <p style={{ margin: '0 0 8px', fontStyle: 'italic' }}>Entretien : {s.note_entretien}</p>}
          {photosParSortie[s.id]?.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {photosParSortie[s.id].map((p) => (
                <img key={p.id} src={p.url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', border: '1px solid #111' }} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
