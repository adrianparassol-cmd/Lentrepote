import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Masthead from '../components/Masthead';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(`Erreur : ${error.message}`);
      return;
    }
    router.replace('/recap');
  }

  return (
    <div className="page" style={{ maxWidth: 400 }}>
      <Masthead />
      <h1 style={{ textAlign: 'center' }}>Connexion</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Adresse email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={{ color: '#8a1f1f' }}>{error}</p>}
        <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
