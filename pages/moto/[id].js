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
  const [galeriePhotosMoto, setGaleriePhotosMoto] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [sortieActive, setSortieActive] = useState(null);
  const [photosParSortie, setPhotosParSortie] = useState({});
  const [dansListeEnvies, setDansListeEnvies] = useState(false);

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  async function load() {
    const { data: motoData } = await supabase.from('motos').select('*').eq('id', id).single();
    const { data: galerieData } = await supabase.from('photos_moto').select('*').eq('moto_id', id).order('created_at');
    const { data: sortiesData } = await supabase
      .from('sorties')
      .select('*, profiles(nom)')
      .eq('moto_id', id)
      .order('date_depart', { ascending: false });
    setMoto(motoData);
    setGaleriePhotosMoto(galerieData || []);
    setHistorique(sortiesData || []);
    setSortieActive((sortiesData || []).find((s) => s.statut === 'en_cours') || null);

    const idsSorties = (sortiesData || []).map((s) => s.id);
    if (idsSorties.length) {
      const { data: photosData } = await supabase
        .from('photos_sortie')
        .select('*, sorties(date_depart, profiles(nom))')
        .in('sortie_id', idsSorties);
      const groupees = {};
      (photosData || []).forEach((p) => {
        groupees[p.sortie_id] = groupees[p.sortie_id] || [];
        groupees[p.sortie_id].push(p);
      });
      setPhotosParSortie(groupees);
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: souhait } = await supabase
        .from('souhaits')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('moto_id', id)
        .maybeSingle();
      setDansListeEnvies(!!souhait);
    }
  }

  async function basculerListeEnvies() {
    if (!profile) return;
    if (dansListeEnvies) {
      await supabase.from('souhaits').delete().eq('user_id', profile.id).eq('moto_id', id);
    } else {
      await supabase.from('souhaits').insert({ user_id: profile.id, moto_id: id });
    }
    setDansListeEnvies(!dansListeEnvies);
  }

  if (loading || !moto) return null;

  const disponible = moto.etat === 'roulante' && !sortieActive;
  const cestMaSortie = sortieActive && profile && sortieActive.user_id === profile.id;
  const terminees = historique.filter((s) => s.statut === 'terminee');

  const prochainRoulage = moto.dernier_roulage
    ? ajouterMois(moto.dernier_roulage, 12)
    : null;
  const besoinDeRouler = prochainRoulage ? estEnRetard(prochainRoulage) : false;

  const notes = terminees.map((s) => s.note_sur_10).filter((n) => n !== null && n !== undefined);
  const moyenne = notes.length ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1) : null;

  const parPilote = {};
  terminees.forEach((s) => {
    const nom = s.profiles?.nom || 'Inconnu';
    if (!parPilote[nom]) parPilote[nom] = { sorties: 0, km: 0 };
    parPilote[nom].sorties += 1;
    if (s.km_depart != null && s.km_retour != null) {
      parPilote[nom].km += Math.max(0, s.km_retour - s.km_depart);
    }
  });

  // Galerie fusionnée : photos de fiche (sans légende) + photos de sortie (avec date/pilote)
  const galerieFusionnee = [
    ...galeriePhotosMoto.map((p) => ({ id: p.id, url: p.url, legende: null, date: p.created_at })),
    ...Object.values(photosParSortie).flat().map((p) => ({
      id: p.id,
      url: p.url,
      legende: `${formatDateFR(p.sorties?.date_depart?.slice(0, 10))} – ${p.sorties?.profiles?.nom || ''}`,
      date: p.sorties?.date_depart,
    })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return (
    <div className="page">
      <Link href="/recap">← Retour à la liste</Link>
      <h1 style={{ marginTop: 12 }}>{moto.marque} {moto.modele}</h1>

      {moto.photo_principale_url ? (
        <img src={moto.photo_principale_url} alt="" className="photo-carree" style={{ marginBottom: 16 }} />
      ) : (
        <div className="photo-placeholder photo-carree" style={{ marginBottom: 16 }}>Pas de photo</div>
      )}

      {moyenne && (
        <div className="note-moyenne">
          <span className="note-moyenne-chiffre">{moyenne}</span>
          <span className="note-moyenne-sur10">/10</span>
          <span className="note-moyenne-label">note moyenne · {notes.length} avis</span>
        </div>
      )}

      {profile && (
        <button
          type="button"
          onClick={basculerListeEnvies}
          style={{ width: '100%', marginBottom: 16 }}
        >
          {dansListeEnvies ? '✓ Dans ta liste à essayer' : '+ Ajouter à ma liste à essayer'}
        </button>
      )}

      <div className="card">
        <p><strong>Année :</strong> {moto.annee || '—'}</p>
        <p><strong>Date d'achat :</strong> {formatDateFR(moto.date_achat) || '—'}</p>
        <p><strong>Kilométrage :</strong> {moto.kilometrage?.toLocaleString('fr-FR')} km</p>
        <p>
          <strong>Dernier roulage :</strong> {formatDateFR(moto.dernier_roulage) || '—'}
          {besoinDeRouler && <span className="badge badge-rouge" style={{ marginLeft: 8 }}>Aurait besoin de rouler</span>}
        </p>
        {sortieActive && (
          <p><strong>Actuellement utilisée par :</strong> {sortieActive.profiles?.nom}</p>
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

      {galerieFusionnee.length > 0 && (
        <>
          <h2>Photos</h2>
          <div className="grid" style={{ marginBottom: 20 }}>
            {galerieFusionnee.map((p) => (
              <div key={p.id}>
                <img src={p.url} alt="" className="photo-carree" />
                {p.legende && <p style={{ fontSize: 12, color: '#6b6a63', margin: '4px 0 0' }}>{p.legende}</p>}
              </div>
            ))}
          </div>
        </>
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
      {terminees.map((s) => {
        const km = s.km_depart != null && s.km_retour != null ? Math.max(0, s.km_retour - s.km_depart) : null;
        return (
          <div key={s.id} className="card">
            <p style={{ margin: '0 0 4px' }}>
              <strong>{s.profiles?.nom}</strong> · {formatDateFR(s.date_depart?.slice(0, 10))}
            </p>
            <p style={{ margin: '0 0 4px', color: '#6b6a63' }}>
              {km != null ? `${km.toLocaleString('fr-FR')} km parcourus` : '—'}
              {s.note_sur_10 != null ? ` · Note : ${s.note_sur_10}/10` : ''}
            </p>
            {s.commentaire && <p style={{ margin: '0 0 4px' }}>{s.commentaire}</p>}
            {s.note_entretien && <p style={{ margin: 0, fontStyle: 'italic' }}>Entretien : {s.note_entretien}</p>}
          </div>
        );
      })}
    </div>
  );
}
