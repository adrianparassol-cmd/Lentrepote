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
  const [sauvegardeEnCours, setSauvegardeEnCours] = useState(false);
  const [erreurSauvegarde, setErreurSauvegarde] = useState('');

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
  const aEntretenir = motos.filter((m) => m.etat === 'entretien' || motosAvecNotes.has(m.id));
  const nonVerifiees = motos.filter((m) => !m.verifie);

  async function toggleVerifie(moto) {
    const { error } = await supabase.from('motos').update({ verifie: !moto.verifie }).eq('id', moto.id);
    if (!error) {
      setMotos((liste) => liste.map((m) => (m.id === moto.id ? { ...m, verifie: !moto.verifie } : m)));
    }
  }

  async function telechargerSauvegarde() {
    setSauvegardeEnCours(true);
    setErreurSauvegarde('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/backup-documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErreurSauvegarde(data.error || `Erreur (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = `documents-motos-${new Date().toISOString().slice(0, 10)}.zip`;
      lien.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErreurSauvegarde(err.message);
    } finally {
      setSauvegardeEnCours(false);
    }
  }

  return (
    <div className="page">
      <NavBar isAdmin />
      <div className="top-bar">
        <h1>Gestion des motos</h1>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <Link href="/admin/moto/new" className="btn-primary btn" style={{ display: 'inline-flex' }}>
          Ajouter une moto
        </Link>
        <Link href="/admin/import" className="btn" style={{ display: 'inline-flex' }}>
          Import en masse
        </Link>
        <button type="button" onClick={telechargerSauvegarde} disabled={sauvegardeEnCours}>
          {sauvegardeEnCours ? 'Préparation du zip...' : 'Télécharger une sauvegarde des documents'}
        </button>
      </div>
      {erreurSauvegarde && <p style={{ color: '#8a1f1f', marginBottom: 20 }}>{erreurSauvegarde}</p>}

      <div className="card">
        <p style={{ margin: 0 }}>
          <strong>{motos.length - nonVerifiees.length}</strong> vérifiée{motos.length - nonVerifiees.length > 1 ? 's' : ''} sur <strong>{motos.length}</strong> — {nonVerifiees.length} à vérifier
        </p>
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
              <strong>{m.marque} {m.modele}</strong>{' '}
              <span className="badge badge-orange" style={{ marginLeft: 8 }}>
                {motosAvecNotes.has(m.id) ? "Note(s) d'entretien en attente" : "Besoin d'entretien"}
              </span>
            </Link>
          ))}
        </>
      )}

      <h2 style={{ marginTop: 20 }}>Toutes les motos</h2>
      {motos.map((m) => (
        <div key={m.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href={`/admin/moto/${m.id}`} style={{ textDecoration: 'none', color: 'inherit', flex: 1 }}>
            <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{m.marque} {m.modele}</p>
            <p style={{ fontSize: 14, color: '#6b6a63', margin: 0 }}>{LABELS_ETAT[m.etat] || m.etat} · {m.kilometrage?.toLocaleString('fr-FR')} km</p>
          </Link>
          <button
            type="button"
            className={m.verifie ? 'btn-primary' : ''}
            onClick={() => toggleVerifie(m)}
            style={{ whiteSpace: 'nowrap' }}
          >
            {m.verifie ? '✓ Vérifiée' : 'À vérifier'}
          </button>
        </div>
      ))}
    </div>
  );
}
