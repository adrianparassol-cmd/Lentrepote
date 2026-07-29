// Route API (côté serveur uniquement) : lit un document stocké dans le bucket privé
// "documents" et demande à Claude d'en extraire les informations utiles.
// Les clés utilisées ici (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY) restent
// côté serveur et ne sont jamais envoyées au navigateur.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  const { chemin } = req.body || {};
  if (!chemin) {
    res.status(400).json({ error: 'chemin manquant' });
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!serviceKey) {
    res.status(500).json({ error: 'Variable SUPABASE_SERVICE_ROLE_KEY manquante sur Vercel.' });
    return;
  }
  if (!anthropicKey) {
    res.status(500).json({ error: 'Variable ANTHROPIC_API_KEY manquante sur Vercel.' });
    return;
  }

  try {
    const cheminEncode = chemin.split('/').map(encodeURIComponent).join('/');
    const fileRes = await fetch(
      `${supabaseUrl}/storage/v1/object/documents/${cheminEncode}`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }
    );
    if (!fileRes.ok) {
      throw new Error(`Téléchargement du document échoué (${fileRes.status})`);
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const contentType = fileRes.headers.get('content-type') || '';
    const estPdf = contentType.includes('pdf') || chemin.toLowerCase().endsWith('.pdf');

    const blocDocument = estPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: contentType || 'image/jpeg', data: base64 } };

    const consigne = `Tu regardes un document scanné concernant une moto ancienne (facture, carte grise, certificat d'immatriculation...).
Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, sans balises markdown, avec exactement ces champs :
{"type": "achat" | "entretien" | "carte_grise" | "autre", "montant": nombre ou null (montant total TTC en euros si c'est une facture), "date": "AAAA-MM-JJ" ou null (date de la facture, ou date d'immatriculation/de délivrance si c'est une carte grise), "annee": nombre ou null (année de 1ère mise en circulation si carte grise), "marque": chaîne ou null, "modele": chaîne ou null, "immatriculation": chaîne ou null (numéro d'immatriculation/plaque du véhicule, ex. "AB-123-CD")}
Si une information est absente ou illisible, mets null pour ce champ précis. N'invente jamais une valeur.`;

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: [blocDocument, { type: 'text', text: consigne }] }],
      }),
    });

    const data = await apiRes.json();
    if (data.error) {
      throw new Error(data.error.message || 'Erreur API Anthropic');
    }
    const texte = (data.content || []).map((bloc) => bloc.text || '').join('').trim();
    const nettoye = texte.replace(/```json|```/g, '').trim();
    const resultat = JSON.parse(nettoye);
    res.status(200).json(resultat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
