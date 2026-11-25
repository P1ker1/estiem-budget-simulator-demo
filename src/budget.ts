export interface BudgetInput {
  participants: number;
  nights: number;
  targetFee: number;
  hostelPerPersonNight: number;
  foodPerPersonDay: number;
  localTransportTotal: number;
  activitiesSocialTotal: number;
  sponsorsAndGrants: number;
}

export type BudgetInputKey = keyof BudgetInput;

export type BudgetStatusLevel = 'green' | 'amber' | 'red';

export interface BudgetStatus {
  level: BudgetStatusLevel;
  badge: string;
  headline: string;
  detail: string;
}

export interface BudgetBreakdown {
  hostelCost: number;
  foodCost: number;
  transportCost: number;
  activitiesCost: number;
  sponsorsOffset: number;
  feeRevenue: number;
}

export interface BudgetResult {
  input: BudgetInput;
  breakdown: BudgetBreakdown;
  totalCost: number;
  netCost: number;
  breakEvenFee: number | null;
  surplusDeficit: number;
  surplusDeficitPerParticipant: number | null;
  marginPercent: number | null;
  status: BudgetStatus;
}

export const DEFAULT_BUDGET_INPUT: Readonly<BudgetInput> = {
  participants: 30,
  nights: 5,
  targetFee: 130,
  hostelPerPersonNight: 12,
  foodPerPersonDay: 9,
  localTransportTotal: 450,
  activitiesSocialTotal: 750,
  sponsorsAndGrants: 900,
};

const EUR_FORMATTER = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function normalizeZero(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) {
    return 0;
  }
  return value;
}

export function sanitizeNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function sanitizeNonNegativeInt(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export function sanitizeBudgetInput(raw: BudgetInput): BudgetInput {
  return {
    participants: sanitizeNonNegativeInt(raw.participants),
    nights: sanitizeNonNegativeInt(raw.nights),
    targetFee: sanitizeNonNegative(raw.targetFee),
    hostelPerPersonNight: sanitizeNonNegative(raw.hostelPerPersonNight),
    foodPerPersonDay: sanitizeNonNegative(raw.foodPerPersonDay),
    localTransportTotal: sanitizeNonNegative(raw.localTransportTotal),
    activitiesSocialTotal: sanitizeNonNegative(raw.activitiesSocialTotal),
    sponsorsAndGrants: sanitizeNonNegative(raw.sponsorsAndGrants),
  };
}

export function formatEur(value: number): string {
  if (!Number.isFinite(value)) {
    return EUR_FORMATTER.format(0);
  }
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  return EUR_FORMATTER.format(normalized);
}

export function formatSignedEur(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) {
    return EUR_FORMATTER.format(0);
  }
  const formatted = formatEur(Math.abs(value));
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

function evaluateStatus(
  input: BudgetInput,
  totalCost: number,
  breakEvenFee: number | null,
  surplusDeficit: number,
  surplusDeficitPerParticipant: number | null,
): BudgetStatus {
  if (surplusDeficit < -1e-9) {
    const shortfall = formatEur(Math.abs(surplusDeficit));
    const detail =
      input.participants > 0 && breakEvenFee !== null
        ? `Short by ${shortfall}. Raise target fee by ${formatEur(Math.max(0, breakEvenFee - input.targetFee))} to ${formatEur(breakEvenFee)}, reduce costs, or secure more sponsors.`
        : `Short by ${shortfall} with 0 participants to cover fixed costs.`;

    return {
      level: 'red',
      badge: 'Deficit',
      headline: 'Budget is in deficit',
      detail,
    };
  }

  if (input.participants === 0) {
    return {
      level: 'amber',
      badge: 'No Participants',
      headline: 'Add participants to calculate break-even fee',
      detail: 'Set at least 1 participant to evaluate per-participant fee viability.',
    };
  }

  if (totalCost > 0 && surplusDeficit < totalCost * 0.05 - 1e-9) {
    const isExactBreakEven = Math.abs(surplusDeficit) < 0.005;
    return {
      level: 'amber',
      badge: 'Tight Margin',
      headline: isExactBreakEven
        ? 'Exact break-even — zero contingency buffer'
        : 'Tight budget margin (under 5% buffer)',
      detail: `Buffer is ${formatEur(surplusDeficit)} (${formatEur(surplusDeficitPerParticipant ?? 0)}/participant). Aim for at least 5% (${formatEur(totalCost * 0.05)}) to absorb unexpected costs.`,
    };
  }

  return {
    level: 'green',
    badge: 'Healthy Budget',
    headline: 'Budget works with a healthy contingency buffer',
    detail: `Projected surplus of ${formatEur(surplusDeficit)} (${formatEur(surplusDeficitPerParticipant ?? 0)}/participant) at the ${formatEur(input.targetFee)} target fee.`,
  };
}

export function calculateBudget(rawInput: BudgetInput): BudgetResult {
  const input = sanitizeBudgetInput(rawInput);

  const hostelCost = normalizeZero(
    input.participants * input.nights * input.hostelPerPersonNight,
  );
  const foodCost = normalizeZero(
    input.participants * input.nights * input.foodPerPersonDay,
  );
  const transportCost = normalizeZero(input.localTransportTotal);
  const activitiesCost = normalizeZero(input.activitiesSocialTotal);

  const totalCost = normalizeZero(
    hostelCost + foodCost + transportCost + activitiesCost,
  );
  const sponsorsOffset = normalizeZero(input.sponsorsAndGrants);
  const netCost = normalizeZero(Math.max(0, totalCost - sponsorsOffset));
  const feeRevenue = normalizeZero(input.participants * input.targetFee);
  const surplusDeficit = normalizeZero(feeRevenue + sponsorsOffset - totalCost);

  const breakEvenFee =
    input.participants > 0 ? normalizeZero(netCost / input.participants) : null;
  const surplusDeficitPerParticipant =
    input.participants > 0
      ? normalizeZero(surplusDeficit / input.participants)
      : null;
  const marginPercent =
    totalCost > 0 ? normalizeZero((surplusDeficit / totalCost) * 100) : null;

  const status = evaluateStatus(
    input,
    totalCost,
    breakEvenFee,
    surplusDeficit,
    surplusDeficitPerParticipant,
  );

  return {
    input,
    breakdown: {
      hostelCost,
      foodCost,
      transportCost,
      activitiesCost,
      sponsorsOffset,
      feeRevenue,
    },
    totalCost,
    netCost,
    breakEvenFee,
    surplusDeficit,
    surplusDeficitPerParticipant,
    marginPercent,
    status,
  };
}

export function applyHostelIncrease(
  input: BudgetInput,
  percent = 25,
): BudgetInput {
  const sanitized = sanitizeBudgetInput(input);
  const factor = 1 + sanitizeNonNegative(percent) / 100;
  const nextHostel = Math.round(sanitized.hostelPerPersonNight * factor * 100) / 100;
  return {
    ...sanitized,
    hostelPerPersonNight: nextHostel,
  };
}

export function createDefaultBudgetInput(): BudgetInput {
  return { ...DEFAULT_BUDGET_INPUT };
}
