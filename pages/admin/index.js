import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useUser } from '../../lib/useUser';

export default function AdminIndex() {
  const { profile, loading } = useUser();
  const [motos, setMotos] = useState([]);

  useEffect(() => {
    supabase.from('motos').select('*').order('marque').then(({ data }) => setMotos(data || []));
  }, []);

  if (loading) return null;
  if (!profile?.is_admin) return <div className="page"><p>Accès réservé à l'administrateur.</p></div>;

  return (
    <div className="page">
      <div className="top-bar">
        <h1>Back-office motos</h1>
        <Link href="/recap">← Vue générale</Link>
      </div>
      <Link href="/admin/moto/new" className="btn-primary btn" style={{ marginBottom: 20, display: 'inline-flex' }}>
        Ajouter une moto
      </Link>
      {motos.map((m) => (
        <Link key={m.id} href={`/admin/moto/${m.id}`} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
          <div>
            <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{m.marque} {m.modele}</p>
            <p style={{ fontSize: 14, color: '#6b6a63', margin: 0 }}>{m.etat} · {m.kilometrage?.toLocaleString('fr-FR')} km</p>
          </div>
          <span>Modifier →</span>
        </Link>
      ))}
    </div>
  );
}
