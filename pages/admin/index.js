import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useUser } from '../../lib/useUser';
import { ajouterMois, estEnRetard } from '../../lib/format';
import NavBar from '../../components/NavBar';

const LABELS_ETAT = {
  roulante: 'Roulante',
  entretien: "Besoin d'entretien",
  restauration: 'Besoin de restauration',
  non_roulante: 'Non roulante',
};

export default function AdminIndex() {
  const { profile, loading } = useUser();
  const [motos, setMotos] = useState([]);
  const [motosAvecNotes, setMotosAvecNotes] = useState(new Set());

  useEffect(() => {
    supabase.from('motos').select('*').order('marque').then(({ data }) => setMotos(data || []));
    supabase.from('entretien_notes').select('moto_id').then(({ data }) => {
      setMotosAvecNotes(new Set((data || []).map((n) => n.moto_id)));
    });
  }, []);

  if (loading) return null;
  if (!profile?.is_admin) return <div className="page"><p>Accès réservé à l'administrateur.</p></div>;

  const besoinDeRouler = motos.filter((m) => {
    if (m.etat !== 'roulante') return false;
    const prochain = m.dernier_roulage ? ajouterMois(m.dernier_roulage, 12) : null;
    return prochain ? estEnRetard(prochain) : false;
  });
  const aEntretenir = motos.filter((m) => motosAvecNotes.has(m.id));

  return (
    <div className="page">
      <NavBar isAdmin />
      <div className="top-bar">
        <h1>Back-office motos</h1>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <Link href="/admin/moto/new" className="btn-primary btn" style={{ display: 'inline-flex' }}>
          Ajouter une moto
        </Link>
        <Link href="/admin/import" className="btn" style={{ display: 'inline-flex' }}>
          Import en masse
        </Link>
      </div>

      {besoinDeRouler.length > 0 && (
        <>
          <h2>Motos qui ont besoin de rouler</h2>
          {besoinDeRouler.map((m) => (
            <Link key={m.id} href={`/admin/moto/${m.id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <strong>{m.marque} {m.modele}</strong> <span className="badge badge-rouge" style={{ marginLeft: 8 }}>N'a pas roulé depuis plus de 12 mois</span>
            </Link>
          ))}
        </>
      )}

      {aEntretenir.length > 0 && (
        <>
          <h2 style={{ marginTop: 20 }}>Motos à entretenir</h2>
          {aEntretenir.map((m) => (
            <Link key={m.id} href={`/admin/moto/${m.id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <strong>{m.marque} {m.modele}</strong> <span className="badge badge-orange" style={{ marginLeft: 8 }}>Note(s) d'entretien en attente</span>
            </Link>
          ))}
        </>
      )}

      <h2 style={{ marginTop: 20 }}>Toutes les motos</h2>
      {motos.map((m) => (
        <Link key={m.id} href={`/admin/moto/${m.id}`} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
          <div>
            <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{m.marque} {m.modele}</p>
            <p style={{ fontSize: 14, color: '#6b6a63', margin: 0 }}>{LABELS_ETAT[m.etat] || m.etat} · {m.kilometrage?.toLocaleString('fr-FR')} km</p>
          </div>
          <span>Modifier →</span>
        </Link>
      ))}
    </div>
  );
}
