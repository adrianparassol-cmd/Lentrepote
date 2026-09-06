import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') router.replace('/reset-password');
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      // Laisse une fraction de seconde à onAuthStateChange pour détecter
      // un éventuel lien de récupération présent dans l'URL avant de trancher.
      setTimeout(() => {
        if (!router.asPath.includes('type=recovery')) {
          router.replace(session ? '/recap' : '/login');
        }
      }, 150);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return null;
}
