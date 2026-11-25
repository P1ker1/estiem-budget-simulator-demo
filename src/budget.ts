export interface BudgetInput {
  participants: number;
  organizers: number;
  nights: number;
  targetFee: number;
  organizerFee: number;
  hostelPerPersonNight: number;
  foodPerPersonDay: number;
  localTransportTotal: number;
  activitiesSocialTotal: number;
  materialsTotal: number;
  unexpectedCostsPercent: number;
  sponsorsAndGrants: number;
}

export type BudgetInputKey = keyof BudgetInput;

export type BudgetStatusLevel = 'red' | 'green' | 'orange';

export type ExportTab = 'board' | 'funding-gap';

export interface BudgetStatus {
  level: BudgetStatusLevel;
  badge: string;
  headline: string;
  detail: string;
}

export interface BudgetBreakdown {
  foodCost: number;
  accommodationCost: number;
  activitiesCost: number;
  transportationCost: number;
  materialsCost: number;
  baseExpensesSubtotal: number;
  unexpectedCosts: number;
  participantFeeIncome: number;
  organizerFeeIncome: number;
  sponsorsIncome: number;
  totalConfirmedIncome: number;
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
  fundingGapBeforeSponsors: number;
  remainingFundingGap: number;
  status: BudgetStatus;
}

export const DEFAULT_BUDGET_INPUT: Readonly<BudgetInput> = {
  participants: 30,
  organizers: 5,
  nights: 5,
  targetFee: 130,
  organizerFee: 25,
  hostelPerPersonNight: 12,
  foodPerPersonDay: 9,
  localTransportTotal: 450,
  activitiesSocialTotal: 750,
  materialsTotal: 150,
  unexpectedCostsPercent: 3,
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
    organizers: sanitizeNonNegativeInt(raw.organizers),
    nights: sanitizeNonNegativeInt(raw.nights),
    targetFee: sanitizeNonNegative(raw.targetFee),
    organizerFee: sanitizeNonNegative(raw.organizerFee),
    hostelPerPersonNight: sanitizeNonNegative(raw.hostelPerPersonNight),
    foodPerPersonDay: sanitizeNonNegative(raw.foodPerPersonDay),
    localTransportTotal: sanitizeNonNegative(raw.localTransportTotal),
    activitiesSocialTotal: sanitizeNonNegative(raw.activitiesSocialTotal),
    materialsTotal: sanitizeNonNegative(raw.materialsTotal),
    unexpectedCostsPercent: sanitizeNonNegative(raw.unexpectedCostsPercent),
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
        ? `Short by ${shortfall}. Raise participant fee by ${formatEur(Math.max(0, breakEvenFee - input.targetFee))} to ${formatEur(breakEvenFee)}, host participants, cut costs, or pitch the Funding Gap to sponsors/university.`
        : `Short by ${shortfall} with 0 participants to cover expenses.`;

    return {
      level: 'red',
      badge: 'Loss',
      headline: 'Budget is in loss — uncovered deficit',
      detail,
    };
  }

  const isExcessSurplus =
    (totalCost > 0 && surplusDeficit > totalCost * 0.05 + 1e-9) ||
    (totalCost === 0 && surplusDeficit > 0.005);

  if (isExcessSurplus) {
    const detail =
      input.participants > 0 && breakEvenFee !== null
        ? `Surplus of ${formatEur(surplusDeficit)} (${formatEur(surplusDeficitPerParticipant ?? 0)}/participant). As a non-profit, lower the target fee toward ${formatEur(breakEvenFee)}, upgrade the experience, or refund unused funds.`
        : `Surplus of ${formatEur(surplusDeficit)} with 0 participants. Lower fees or adjust confirmed funding.`;

    return {
      level: 'orange',
      badge: 'Excess Surplus',
      headline: 'Surplus exceeds non-profit target — lower fee or refund',
      detail,
    };
  }

  if (input.participants === 0) {
    return {
      level: 'green',
      badge: 'Break-Even Target',
      headline: 'On target for ESTIEM non-profit break-even',
      detail: `Balanced at ${formatEur(surplusDeficit)}. Set at least 1 participant to calculate per-participant break-even fee.`,
    };
  }

  const bufferTip =
    input.unexpectedCostsPercent < 3
      ? ' Tip: ESTIEM BPD recommends at least 3%–5% for unexpected costs.'
      : '';

  return {
    level: 'green',
    badge: 'Break-Even Target',
    headline: 'On target for ESTIEM non-profit break-even',
    detail: `Projected balance of ${formatSignedEur(surplusDeficit)} (${formatEur(surplusDeficitPerParticipant ?? 0)}/participant) with a ${input.unexpectedCostsPercent}% unexpected costs buffer included.${bufferTip}`,
  };
}

export function calculateBudget(rawInput: BudgetInput): BudgetResult {
  const input = sanitizeBudgetInput(rawInput);

  const totalMealPeople = input.participants + input.organizers;
  const foodCost = normalizeZero(
    totalMealPeople * input.nights * input.foodPerPersonDay,
  );
  const accommodationCost = normalizeZero(
    input.participants * input.nights * input.hostelPerPersonNight,
  );
  const activitiesCost = normalizeZero(input.activitiesSocialTotal);
  const transportationCost = normalizeZero(input.localTransportTotal);
  const materialsCost = normalizeZero(input.materialsTotal);

  const baseExpensesSubtotal = normalizeZero(
    foodCost +
      accommodationCost +
      activitiesCost +
      transportationCost +
      materialsCost,
  );
  const unexpectedCosts = normalizeZero(
    baseExpensesSubtotal * (input.unexpectedCostsPercent / 100),
  );
  const totalCost = normalizeZero(baseExpensesSubtotal + unexpectedCosts);

  const participantFeeIncome = normalizeZero(
    input.participants * input.targetFee,
  );
  const organizerFeeIncome = normalizeZero(
    input.organizers * input.organizerFee,
  );
  const sponsorsIncome = normalizeZero(input.sponsorsAndGrants);
  const totalConfirmedIncome = normalizeZero(
    participantFeeIncome + organizerFeeIncome + sponsorsIncome,
  );

  const netCost = normalizeZero(
    Math.max(0, totalCost - sponsorsIncome - organizerFeeIncome),
  );
  const surplusDeficit = normalizeZero(totalConfirmedIncome - totalCost);

  const breakEvenFee =
    input.participants > 0 ? normalizeZero(netCost / input.participants) : null;
  const surplusDeficitPerParticipant =
    input.participants > 0
      ? normalizeZero(surplusDeficit / input.participants)
      : null;
  const marginPercent =
    totalCost > 0 ? normalizeZero((surplusDeficit / totalCost) * 100) : null;

  const fundingGapBeforeSponsors = normalizeZero(
    Math.max(0, totalCost - participantFeeIncome - organizerFeeIncome),
  );
  const remainingFundingGap = normalizeZero(
    Math.max(0, totalCost - totalConfirmedIncome),
  );

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
      foodCost,
      accommodationCost,
      activitiesCost,
      transportationCost,
      materialsCost,
      baseExpensesSubtotal,
      unexpectedCosts,
      participantFeeIncome,
      organizerFeeIncome,
      sponsorsIncome,
      totalConfirmedIncome,
    },
    totalCost,
    netCost,
    breakEvenFee,
    surplusDeficit,
    surplusDeficitPerParticipant,
    marginPercent,
    fundingGapBeforeSponsors,
    remainingFundingGap,
    status,
  };
}

export function applyHostelIncrease(
  input: BudgetInput,
  percent = 25,
): BudgetInput {
  const sanitized = sanitizeBudgetInput(input);
  const factor = 1 + sanitizeNonNegative(percent) / 100;
  const nextHostel =
    Math.round(sanitized.hostelPerPersonNight * factor * 100) / 100;
  return {
    ...sanitized,
    hostelPerPersonNight: nextHostel,
  };
}

export function applyHostParticipants(input: BudgetInput): BudgetInput {
  const sanitized = sanitizeBudgetInput(input);
  return {
    ...sanitized,
    hostelPerPersonNight: 0,
  };
}

export function applySponsorBoost(
  input: BudgetInput,
  amount = 500,
): BudgetInput {
  const sanitized = sanitizeBudgetInput(input);
  return {
    ...sanitized,
    sponsorsAndGrants:
      Math.round((sanitized.sponsorsAndGrants + sanitizeNonNegative(amount)) * 100) /
      100,
  };
}

export function createDefaultBudgetInput(): BudgetInput {
  return { ...DEFAULT_BUDGET_INPUT };
}

function formatExpenseLines(result: BudgetResult): string[] {
  const { input, breakdown } = result;
  const mealPeople = input.participants + input.organizers;
  return [
    `- Food (${mealPeople} ppl × ${input.nights}d × ${formatEur(input.foodPerPersonDay)}): ${formatEur(breakdown.foodCost)}`,
    `- Accommodation (${input.participants} pax × ${input.nights}n × ${formatEur(input.hostelPerPersonNight)}): ${formatEur(breakdown.accommodationCost)}`,
    `- Activities: ${formatEur(breakdown.activitiesCost)}`,
    `- Transportation: ${formatEur(breakdown.transportationCost)}`,
    `- Materials: ${formatEur(breakdown.materialsCost)}`,
    `- Unexpected Costs (${input.unexpectedCostsPercent}% of ${formatEur(breakdown.baseExpensesSubtotal)}): ${formatEur(breakdown.unexpectedCosts)}`,
    `Total Expenses: ${formatEur(result.totalCost)}`,
  ];
}

export function generateBoardExport(result: BudgetResult): string {
  const { input, breakdown, status } = result;
  const breakEvenText =
    result.breakEvenFee === null
      ? 'N/A (0 participants)'
      : formatEur(result.breakEvenFee);

  return [
    'ESTIEM Activity Week — Break-Even Budget (Board / Members)',
    `Scope: ${input.participants} participants, ${input.organizers} organizers, ${input.nights} nights`,
    '',
    'EXPENSES (Mastersheet Categories)',
    ...formatExpenseLines(result),
    '',
    'CONFIRMED INCOMES (100% Sure Only)',
    `- Participants' Fee (${input.participants} × ${formatEur(input.targetFee)}): ${formatEur(breakdown.participantFeeIncome)}`,
    `- Organizers' Fee (${input.organizers} × ${formatEur(input.organizerFee)}): ${formatEur(breakdown.organizerFeeIncome)}`,
    `- Confirmed Sponsors & Grants: ${formatEur(breakdown.sponsorsIncome)}`,
    `Total Confirmed Incomes: ${formatEur(breakdown.totalConfirmedIncome)}`,
    '',
    'NON-PROFIT BALANCE',
    `- Profit / Loss: ${formatSignedEur(result.surplusDeficit)}`,
    `- Break-Even Participant Fee: ${breakEvenText} (Target: ${formatEur(input.targetFee)})`,
    `- Status: ${status.badge} — ${status.headline}`,
    'Note: Per ESTIEM non-profit guidelines, unused unexpected-cost buffer is returned to participants or reinvested into the event.',
  ].join('\n');
}

export function generateFundingGapExport(result: BudgetResult): string {
  const { input, breakdown } = result;
  const grossPerParticipant =
    input.participants > 0
      ? formatEur(result.totalCost / input.participants)
      : 'N/A (0 participants)';
  const totalFeesOnly =
    breakdown.participantFeeIncome + breakdown.organizerFeeIncome;
  const gapSummaryLine =
    result.remainingFundingGap > 0
      ? `- Remaining Uncovered Funding Gap: ${formatEur(result.remainingFundingGap)} (required to reach non-profit break-even)`
      : `- Remaining Uncovered Funding Gap: ${formatEur(0)} (confirmed funding covers current gap; extra support lowers the ${formatEur(input.targetFee)} student fee)`;

  return [
    'ESTIEM Activity Week — Funding Gap Summary (University / Sponsor Pitch)',
    `Scope: ${input.participants} incoming students, ${input.organizers} local organizers, ${input.nights} nights`,
    `Total Event Cost: ${formatEur(result.totalCost)} (${grossPerParticipant} gross/participant; planned student fee: ${formatEur(input.targetFee)})`,
    '',
    'EXPENSE BREAKDOWN',
    ...formatExpenseLines(result),
    '',
    'STUDENT & ORGANIZER FEE CONTRIBUTIONS',
    `- Participants' Fee (${input.participants} × ${formatEur(input.targetFee)}): ${formatEur(breakdown.participantFeeIncome)}`,
    `- Organizers' Fee (${input.organizers} × ${formatEur(input.organizerFee)}): ${formatEur(breakdown.organizerFeeIncome)}`,
    `- Subtotal Fees Covered Internally: ${formatEur(totalFeesOnly)}`,
    '',
    'FUNDING GAP',
    `- Total External Support Needed (Pre-Sponsor Gap): ${formatEur(result.fundingGapBeforeSponsors)}`,
    `- Confirmed External Sponsors & Grants: ${formatEur(breakdown.sponsorsIncome)}`,
    gapSummaryLine,
    'Note: Only 100% confirmed incomes are counted; unconfirmed support is excluded until committed.',
  ].join('\n');
}
