import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function NavBar({ isAdmin }) {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 14,
        borderBottom: '1px solid var(--gris)',
      }}
    >
      <Link href="/recap">L'Entrepotes</Link>
      <Link href="/profil">Mon profil</Link>
      {isAdmin && <Link href="/admin" className="admin-highlight">Gestion</Link>}
      <button onClick={handleLogout} style={{ marginLeft: 'auto', minHeight: 40 }}>
        Déconnexion
      </button>
    </div>
  );
}
