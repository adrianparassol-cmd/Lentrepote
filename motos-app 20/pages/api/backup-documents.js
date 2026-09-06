// Génère à la demande un zip de tous les documents stockés (factures, cartes grises...)
// pour permettre une sauvegarde manuelle. Réservé à l'administrateur.

import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';

export const config = {
  api: { responseLimit: false },
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Non authentifié.' });
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    res.status(500).json({ error: 'Variable SUPABASE_SERVICE_ROLE_KEY manquante sur Vercel.' });
    return;
  }

  try {
    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      res.status(401).json({ error: 'Session invalide.' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { data: profil } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profil?.is_admin) {
      res.status(403).json({ error: "Réservé à l'administrateur." });
      return;
    }

    // Pour donner des noms de dossiers lisibles dans le zip (marque + modèle plutôt que l'identifiant technique)
    const { data: motos } = await supabaseAdmin.from('motos').select('id, marque, modele');
    const nomMoto = {};
    (motos || []).forEach((m) => { nomMoto[m.id] = `${m.marque} ${m.modele}`.replace(/[\\/:*?"<>|]/g, '-'); });

    const { data: dossiers, error: listError } = await supabaseAdmin.storage.from('documents').list('', { limit: 1000 });
    if (listError) throw new Error(listError.message);

    const zip = new JSZip();
    let nbFichiers = 0;

    for (const dossier of dossiers || []) {
      const { data: fichiers } = await supabaseAdmin.storage.from('documents').list(dossier.name, { limit: 1000 });
      for (const fichier of fichiers || []) {
        const chemin = `${dossier.name}/${fichier.name}`;
        const { data: blob } = await supabaseAdmin.storage.from('documents').download(chemin);
        if (!blob) continue;
        const arrayBuffer = await blob.arrayBuffer();
        const dossierLisible = nomMoto[dossier.name] || dossier.name;
        zip.file(`${dossierLisible}/${fichier.name}`, arrayBuffer);
        nbFichiers += 1;
      }
    }

    if (nbFichiers === 0) {
      res.status(404).json({ error: 'Aucun document trouvé à sauvegarder.' });
      return;
    }

    const contenu = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="documents-motos-${new Date().toISOString().slice(0, 10)}.zip"`
    );
    res.status(200).send(contenu);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
