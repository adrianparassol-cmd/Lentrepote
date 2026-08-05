// Chrome, Edge et Firefox ne savent pas afficher les fichiers HEIC (format par défaut
// des iPhone) — seul Safari le peut. On convertit donc systématiquement en JPEG
// avant l'envoi, pour que tout le monde puisse voir les photos/documents ensuite.
export async function convertirHeicSiNecessaire(fichier) {
  const estHeic = /\.(heic|heif)$/i.test(fichier.name) || fichier.type === 'image/heic' || fichier.type === 'image/heif';
  if (!estHeic) return fichier;

  try {
    const heic2any = (await import('heic2any')).default;
    const resultat = await heic2any({ blob: fichier, toType: 'image/jpeg', quality: 0.85 });
    const blob = Array.isArray(resultat) ? resultat[0] : resultat;
    const nomJpeg = fichier.name.replace(/\.(heic|heif)$/i, '') + '.jpg';
    return new File([blob], nomJpeg, { type: 'image/jpeg' });
  } catch (err) {
    console.error('Conversion HEIC échouée, envoi du fichier original :', err);
    return fichier;
  }
}
