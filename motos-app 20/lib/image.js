import { convertirHeicSiNecessaire } from './heic';

// Redimensionne et compresse une image côté navigateur avant envoi,
// pour limiter l'usage du stockage (important avec ~60 motos à photographier).
// Convertit aussi les fichiers HEIC en JPEG au passage (voir lib/heic.js).
export async function compresserImage(fichier, tailleMax = 1600, qualite = 0.8) {
  const fichierConverti = await convertirHeicSiNecessaire(fichier);

  return new Promise((resolve) => {
    if (!fichierConverti.type.startsWith('image/')) {
      resolve(fichierConverti);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(fichierConverti);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > tailleMax || height > tailleMax) {
        if (width > height) {
          height = Math.round((height * tailleMax) / width);
          width = tailleMax;
        } else {
          width = Math.round((width * tailleMax) / height);
          height = tailleMax;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(fichierConverti);
            return;
          }
          const nomJpeg = fichierConverti.name.replace(/\.[^/.]+$/, '') + '.jpg';
          resolve(new File([blob], nomJpeg, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        qualite
      );
    };
    img.onerror = () => resolve(fichierConverti);
    img.src = url;
  });
}
