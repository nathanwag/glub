/* Estimativa de quanta agua beber por dia a partir do perfil. Puro. */

// Regra de ml por kg por faixa etaria, a mais usada nas calculadoras
// brasileiras. Sem idade informada, vale a de adulto.
function mlPerKg(age) {
  if (age == null) return 35;
  if (age <= 17) return 40;
  if (age <= 55) return 35;
  if (age <= 65) return 30;
  return 25;
}

const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

// Piso da faixa de suor do ACSM (500 a 2000 ml por hora de exercicio).
const EXERCISE_ML_PER_HOUR = 500;

// Acrescimos da EFSA (2010) sobre a ingestao de referencia.
const PREGNANCY = {
  pregnant: { label: 'Gestação', ml: 300 },
  lactating: { label: 'Amamentação', ml: 700 },
};

// Ingestao adequada de agua total da EFSA (2010), de 14 anos em diante.
const EFSA_ML = { f: 2000, m: 2500 };

const roundTo50 = (ml) => Math.round(ml / 50) * 50;

/** null quando falta o unico dado indispensavel, o peso. Os demais campos
 *  sao opcionais: ausentes, simplesmente nao entram na conta. */
export function estimateWater({
  weightKg, heightCm = null, age = null, sex = '',
  exerciseMin = null, hotClimate = false, pregnancy = '',
}) {
  if (!positive(weightKg)) return null;

  const perKg = mlPerKg(age);
  const kg = String(weightKg).replace('.', ',');
  const steps = [{ label: `${kg} kg × ${perKg} ml`, ml: Math.round(weightKg * perKg) }];
  if (positive(exerciseMin)) {
    steps.push({
      label: `Exercício, ${exerciseMin} min`,
      ml: Math.round((exerciseMin / 60) * EXERCISE_ML_PER_HOUR),
    });
  }

  // Ajuste de calor usual das calculadoras; nao ha numero oficial unico.
  if (hotClimate) steps.push({ label: 'Clima quente', ml: 500 });
  const extra = PREGNANCY[pregnancy];
  if (extra) steps.push({ ...extra });

  const totalMl = roundTo50(steps.reduce((sum, s) => sum + s.ml, 0));

  // Outros metodos, so pra comparar: cada um aparece se houver os dados dele.
  const compare = [];
  if (positive(heightCm)) {
    const bsa = Math.sqrt((heightCm * weightKg) / 3600);
    compare.push({
      key: 'bsa',
      label: 'Superfície corporal (peso + altura)',
      ml: roundTo50(bsa * 1500),
      note: `${bsa.toFixed(2).replace('.', ',')} m² × 1.500 ml, método clínico`,
    });
  }
  const efsaBase = EFSA_ML[sex];
  if (efsaBase && (age == null || age >= 14)) {
    compare.push({
      key: 'efsa',
      label: 'Referência EFSA',
      ml: efsaBase + (extra?.ml ?? 0),
      note: 'água total do dia; cerca de 20% vem da comida',
    });
  }
  return { totalMl, steps, compare };
}
