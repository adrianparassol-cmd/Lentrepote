export function formatDateFR(iso) {
  if (!iso) return null;
  const [annee, mois, jour] = iso.split('-');
  if (!annee || !mois || !jour) return iso;
  return `${jour}/${mois}/${annee}`;
}

export function ajouterMois(iso, mois) {
  if (!iso || !mois) return null;
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + mois);
  return d;
}

export function estEnRetard(dateLimite) {
  if (!dateLimite) return false;
  return dateLimite.getTime() < Date.now();
}
