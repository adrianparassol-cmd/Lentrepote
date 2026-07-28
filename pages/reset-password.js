import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Masthead from '../components/Masthead';

export default function ResetPassword() {
  const router = useRouter();
  const [pret, setPret] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setPret(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPret(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setEnvoi(true);
    const { error } = await supabase.auth.updateUser({ password });
    setEnvoi(false);
    if (error) {
      setError("Une erreur est survenue, réessaie.");
      return;
    }
    setOk(true);
    setTimeout(() => router.replace('/recap'), 1500);
  }

  return (
    <div className="page" style={{ maxWidth: 400 }}>
      <Masthead />
      <h1 style={{ textAlign: 'center' }}>Nouveau mot de passe</h1>

      {!pret && (
        <p style={{ color: '#6b6a63' }}>
          Ce lien n'est plus valable, ou tu es arrivé ici directement. Demande un nouveau lien de récupération depuis Supabase, ou retourne à la <a href="/login">page de connexion</a>.
        </p>
      )}

      {pret && !ok && (
        <form onSubmit={handleSubmit}>
          <label htmlFor="password">Nouveau mot de passe</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <label htmlFor="confirmation">Confirme le mot de passe</label>
          <input
            id="confirmation"
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
          />
          {error && <p style={{ color: '#8a1f1f' }}>{error}</p>}
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={envoi}>
            {envoi ? 'Enregistrement...' : 'Valider'}
          </button>
        </form>
      )}

      {ok && <p>Mot de passe mis à jour, tu es connecté(e)...</p>}
    </div>
  );
}
