export const OPTIONS_TRI = [
  { valeur: 'marque', label: 'Marque (A→Z)' },
  { valeur: 'annee_desc', label: 'Année (récente → ancienne)' },
  { valeur: 'annee_asc', label: 'Année (ancienne → récente)' },
  { valeur: 'km_asc', label: 'Kilométrage (croissant)' },
  { valeur: 'km_desc', label: 'Kilométrage (décroissant)' },
  { valeur: 'roulage_recent', label: "Dernière utilisation (récente d'abord)" },
  { valeur: 'roulage_ancien', label: 'Plus vieille utilisation (en premier)' },
  { valeur: 'note_desc', label: 'Note moyenne (meilleure d\'abord)' },
  { valeur: 'sorties_desc', label: 'Nombre de sorties (plus utilisées d\'abord)' },
  { valeur: 'etat', label: 'État (disponibles d\'abord)' },
];

function prioriteEtat(moto, sortiesEnCours) {
  if (moto.etat === 'roulante') {
    const enCours = sortiesEnCours.some((s) => s.moto_id === moto.id);
    return enCours ? 1 : 0;
  }
  if (moto.etat === 'entretien' || moto.etat === 'restauration') return 2;
  return 3; // non_roulante
}

export function calculerStatsParMoto(sortiesTerminees) {
  const brut = {};
  (sortiesTerminees || []).forEach((s) => {
    if (!brut[s.moto_id]) brut[s.moto_id] = { total: 0, count: 0, nbSorties: 0 };
    brut[s.moto_id].nbSorties += 1;
    if (s.note_sur_10 != null) {
      brut[s.moto_id].total += s.note_sur_10;
      brut[s.moto_id].count += 1;
    }
  });
  const resultat = {};
  Object.entries(brut).forEach(([id, v]) => {
    resultat[id] = { moyenne: v.count ? v.total / v.count : null, nbSorties: v.nbSorties };
  });
  return resultat;
}

export function trierMotos(motos, critere, { sortiesEnCours = [], statsParMoto = {} } = {}) {
  const liste = [...motos];
  const stat = (id) => statsParMoto[id] || { moyenne: null, nbSorties: 0 };

  switch (critere) {
    case 'annee_desc':
      return liste.sort((a, b) => (b.annee || 0) - (a.annee || 0));
    case 'annee_asc':
      return liste.sort((a, b) => (a.annee || 9999) - (b.annee || 9999));
    case 'km_asc':
      return liste.sort((a, b) => (a.kilometrage || 0) - (b.kilometrage || 0));
    case 'km_desc':
      return liste.sort((a, b) => (b.kilometrage || 0) - (a.kilometrage || 0));
    case 'roulage_recent':
      return liste.sort((a, b) => new Date(b.dernier_roulage || 0) - new Date(a.dernier_roulage || 0));
    case 'roulage_ancien':
      return liste.sort((a, b) => new Date(a.dernier_roulage || 0) - new Date(b.dernier_roulage || 0));
    case 'note_desc':
      return liste.sort((a, b) => {
        const na = stat(a.id).moyenne;
        const nb = stat(b.id).moyenne;
        if (na == null && nb == null) return 0;
        if (na == null) return 1;
        if (nb == null) return -1;
        return nb - na;
      });
    case 'sorties_desc':
      return liste.sort((a, b) => stat(b.id).nbSorties - stat(a.id).nbSorties);
    case 'etat':
      return liste.sort((a, b) => prioriteEtat(a, sortiesEnCours) - prioriteEtat(b, sortiesEnCours) || a.marque.localeCompare(b.marque));
    case 'marque':
    default:
      return liste.sort((a, b) => a.marque.localeCompare(b.marque) || a.modele.localeCompare(b.modele));
  }
}
