/* Contas do dia sobre os copos registrados. Puro, pra rodar sob node --test. */

export function daySummary(intakes, goalMl) {
  const totalMl = intakes.reduce((sum, i) => sum + i.ml, 0);
  // ISO em UTC ordena como texto.
  const lastDrinkAt = intakes.reduce((max, i) => (max && max > i.at ? max : i.at), null);
  return {
    totalMl,
    lastDrinkAt,
    progress: Math.min(totalMl / goalMl, 1),
    leftMl: Math.max(goalMl - totalMl, 0),
  };
}
