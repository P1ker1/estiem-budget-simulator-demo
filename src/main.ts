import './style.css';
import {
  applyHostParticipants,
  applyHostelIncrease,
  applySponsorBoost,
  calculateBudget,
  createDefaultBudgetInput,
  formatEur,
  formatSignedEur,
  generateBoardExport,
  generateFundingGapExport,
  sanitizeNonNegative,
  sanitizeNonNegativeInt,
  type BudgetInput,
  type BudgetInputKey,
  type ExportTab,
} from './budget.ts';

interface FieldConfig {
  key: BudgetInputKey;
  label: string;
  hint: string;
  group: 'scope' | 'costs';
  integer?: boolean;
  sliderMax: number;
  sliderStep: number;
  inputStep: number;
  unit: string;
}

const FIELD_CONFIGS: readonly FieldConfig[] = [
  {
    key: 'participants',
    label: 'Participants',
    hint: 'Incoming paying participants',
    group: 'scope',
    integer: true,
    sliderMax: 100,
    sliderStep: 1,
    inputStep: 1,
    unit: 'people',
  },
  {
    key: 'organizers',
    label: 'Organizers',
    hint: 'Local organizing team (meals only)',
    group: 'scope',
    integer: true,
    sliderMax: 25,
    sliderStep: 1,
    inputStep: 1,
    unit: 'people',
  },
  {
    key: 'nights',
    label: 'Nights',
    hint: 'Activity Week duration',
    group: 'scope',
    integer: true,
    sliderMax: 14,
    sliderStep: 1,
    inputStep: 1,
    unit: 'nights',
  },
  {
    key: 'targetFee',
    label: 'Target Fee',
    hint: 'Planned fee per participant',
    group: 'scope',
    sliderMax: 350,
    sliderStep: 1,
    inputStep: 0.5,
    unit: '€/person',
  },
  {
    key: 'organizerFee',
    label: "Organizers' Fee",
    hint: '100% sure organizer contribution',
    group: 'scope',
    sliderMax: 150,
    sliderStep: 1,
    inputStep: 0.5,
    unit: '€/org',
  },
  {
    key: 'hostelPerPersonNight',
    label: 'Hostel / person / night',
    hint: 'Accommodation for participants',
    group: 'costs',
    sliderMax: 60,
    sliderStep: 0.5,
    inputStep: 0.01,
    unit: '€',
  },
  {
    key: 'foodPerPersonDay',
    label: 'Food / person / day',
    hint: 'Meals for participants + organizers',
    group: 'costs',
    sliderMax: 40,
    sliderStep: 0.5,
    inputStep: 0.01,
    unit: '€',
  },
  {
    key: 'localTransportTotal',
    label: 'Transportation total',
    hint: 'Group transit & public transport',
    group: 'costs',
    sliderMax: 3000,
    sliderStep: 25,
    inputStep: 1,
    unit: '€',
  },
  {
    key: 'activitiesSocialTotal',
    label: 'Activities / social total',
    hint: 'Company visits, cultural & social nights',
    group: 'costs',
    sliderMax: 3000,
    sliderStep: 25,
    inputStep: 1,
    unit: '€',
  },
  {
    key: 'materialsTotal',
    label: 'Materials total',
    hint: 'Flipcharts, markers, badges & kits',
    group: 'costs',
    sliderMax: 1000,
    sliderStep: 10,
    inputStep: 1,
    unit: '€',
  },
  {
    key: 'unexpectedCostsPercent',
    label: 'Unexpected Costs %',
    hint: 'ESTIEM BPD recommends 3%–5% buffer',
    group: 'costs',
    sliderMax: 15,
    sliderStep: 0.5,
    inputStep: 0.5,
    unit: '%',
  },
  {
    key: 'sponsorsAndGrants',
    label: 'Confirmed Sponsors & Grants',
    hint: 'Only 100% sure external incomes',
    group: 'costs',
    sliderMax: 5000,
    sliderStep: 50,
    inputStep: 1,
    unit: '€ sure',
  },
];

interface ControlRefs {
  config: FieldConfig;
  slider: HTMLInputElement;
  numberInput: HTMLInputElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy textarea copy
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
  }
  return copied;
}

function mountApp(root: HTMLElement): void {
  let state: BudgetInput = createDefaultBudgetInput();
  let activeExportTab: ExportTab = 'board';
  let currentExportText = '';
  let copyTimer: number | undefined;
  const controls = new Map<BudgetInputKey, ControlRefs>();

  const shell = el('div', 'app-shell');

  // Header + quick scenario buttons
  const header = el('header', 'page-header');
  const headerCopy = el('div', 'header-copy');
  headerCopy.append(
    el('p', 'eyebrow', 'ESTIEM Local Group Treasurer Tool'),
    el('h1', 'page-title', 'Activity Week Budget Simulator'),
    el(
      'p',
      'page-subtitle',
      'Aligned with ESTIEM Mastersheet 6. Budget & Event Organisation 101 (non-profit break-even, 100% sure incomes only).',
    ),
  );

  const actions = el('div', 'scenario-actions');
  const hostBtn = el('button', 'btn btn-host', 'Host Participants (€0 Hostel)');
  hostBtn.type = 'button';
  const sponsorBtn = el('button', 'btn btn-sponsor', '+€500 Sponsor');
  sponsorBtn.type = 'button';
  const hostelSpikeBtn = el('button', 'btn btn-scenario', 'Scenario: Hostel +25%');
  hostelSpikeBtn.type = 'button';
  const resetBtn = el('button', 'btn btn-reset', 'Reset Defaults');
  resetBtn.type = 'button';
  actions.append(hostBtn, sponsorBtn, hostelSpikeBtn, resetBtn);
  header.append(headerCopy, actions);

  // Status banner
  const statusBanner = el('section', 'status-banner');
  statusBanner.setAttribute('aria-live', 'polite');
  const statusMain = el('div', 'status-main');
  const statusBadge = el('span', 'status-badge');
  const statusCopy = el('div', 'status-copy');
  const statusHeadline = el('h2', 'status-headline');
  const statusDetail = el('p', 'status-detail');
  statusCopy.append(statusHeadline, statusDetail);
  statusMain.append(statusBadge, statusCopy);
  const statusMarginPill = el('span', 'status-margin-pill');
  statusBanner.append(statusMain, statusMarginPill);

  // Main 2-column grid
  const grid = el('main', 'workspace-grid');

  // Left card: Budget Parameters
  const inputsCard = el('section', 'card');
  inputsCard.append(el('h2', 'card-title', 'Budget Parameters'));

  const scopeGroup = el('div', 'input-group');
  scopeGroup.append(el('h3', 'group-heading', 'Event Scope & Fees'));

  const costsGroup = el('div', 'input-group');
  costsGroup.append(
    el('h3', 'group-heading', 'Mastersheet Expenses & Confirmed Income'),
  );

  for (const cfg of FIELD_CONFIGS) {
    const row = el('div', 'control-row');
    const top = el('div', 'control-top');

    const labelWrap = el('div', 'control-label-wrap');
    const label = el('label', 'control-label', cfg.label);
    const inputId = `input-${cfg.key}`;
    label.htmlFor = inputId;
    labelWrap.append(label, el('span', 'control-hint', cfg.hint));

    const numberWrap = el('div', 'number-wrap');
    const numInput = el('input', 'number-input');
    numInput.id = inputId;
    numInput.type = 'number';
    numInput.min = '0';
    numInput.step = String(cfg.inputStep);
    numInput.inputMode = cfg.integer ? 'numeric' : 'decimal';

    const unitTag = el('span', 'unit-tag', cfg.unit);
    numberWrap.append(numInput, unitTag);
    top.append(labelWrap, numberWrap);

    const slider = el('input', 'slider-input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(cfg.sliderMax);
    slider.step = String(cfg.sliderStep);
    slider.setAttribute('aria-label', `${cfg.label} slider`);

    row.append(top, slider);

    if (cfg.group === 'scope') {
      scopeGroup.append(row);
    } else {
      costsGroup.append(row);
    }

    controls.set(cfg.key, { config: cfg, slider, numberInput: numInput });

    const sanitizeField = (raw: number): number =>
      cfg.integer ? sanitizeNonNegativeInt(raw) : sanitizeNonNegative(raw);

    slider.addEventListener('input', () => {
      const nextValue = sanitizeField(Number(slider.value));
      state = { ...state, [cfg.key]: nextValue };
      numInput.value = String(nextValue);
      render();
    });

    numInput.addEventListener('input', () => {
      const parsed = numInput.value.trim() === '' ? 0 : Number(numInput.value);
      const nextValue = sanitizeField(parsed);
      state = { ...state, [cfg.key]: nextValue };
      slider.value = String(Math.min(cfg.sliderMax, nextValue));
      render();
    });

    const commitNumberField = (): void => {
      const current = state[cfg.key];
      numInput.value = String(current);
      slider.value = String(Math.min(cfg.sliderMax, current));
    };

    numInput.addEventListener('change', commitNumberField);
    numInput.addEventListener('blur', commitNumberField);
  }

  inputsCard.append(scopeGroup, costsGroup);

  // Right card: Live Summary
  const summaryCard = el('section', 'card summary-card');
  summaryCard.append(el('h2', 'card-title', 'Live Budget Summary'));

  const kpiGrid = el('div', 'kpi-grid');

  const createKpiTile = (
    labelText: string,
  ): { tile: HTMLDivElement; value: HTMLDivElement; sub: HTMLDivElement } => {
    const tile = el('div', 'kpi-tile');
    const label = el('div', 'kpi-label', labelText);
    const value = el('div', 'kpi-value');
    const sub = el('div', 'kpi-sub');
    tile.append(label, value, sub);
    return { tile, value, sub };
  };

  const totalCostKpi = createKpiTile('Total Expenses');
  const netCostKpi = createKpiTile('Net Cost (Participant Share)');
  const breakEvenKpi = createKpiTile('Break-Even Participant Fee');
  const surplusKpi = createKpiTile('Non-Profit Balance');

  kpiGrid.append(
    totalCostKpi.tile,
    netCostKpi.tile,
    breakEvenKpi.tile,
    surplusKpi.tile,
  );

  // Mastersheet Cost Breakdown section
  const breakdownSection = el('div', 'breakdown-section');
  breakdownSection.append(
    el('h3', 'section-subtitle', 'Mastersheet Cost Breakdown'),
  );

  const stackedBar = el('div', 'stacked-bar');
  const segFood = el('div', 'bar-segment bar-food');
  const segAccommodation = el('div', 'bar-segment bar-accommodation');
  const segActivities = el('div', 'bar-segment bar-activities');
  const segTransportation = el('div', 'bar-segment bar-transportation');
  const segMaterials = el('div', 'bar-segment bar-materials');
  const segUnexpected = el('div', 'bar-segment bar-unexpected');
  stackedBar.append(
    segFood,
    segAccommodation,
    segActivities,
    segTransportation,
    segMaterials,
    segUnexpected,
  );

  const breakdownList = el('ul', 'breakdown-list');

  const createBreakdownRow = (
    name: string,
    dotColor?: string,
    extraClass?: string,
    isCredit = false,
  ): { formula: HTMLSpanElement; amount: HTMLSpanElement } => {
    const li = el(
      'li',
      extraClass ? `breakdown-row ${extraClass}` : 'breakdown-row',
    );
    const left = el('div', 'breakdown-name-wrap');
    if (dotColor) {
      const dot = el('span', 'legend-dot');
      dot.style.backgroundColor = dotColor;
      left.append(dot);
    }
    const nameEl = el('span', 'breakdown-name', name);
    const formula = el('span', 'breakdown-formula');
    left.append(nameEl, formula);

    const amount = el(
      'span',
      isCredit ? 'breakdown-amount is-credit' : 'breakdown-amount',
    );
    li.append(left, amount);
    breakdownList.append(li);
    return { formula, amount };
  };

  const foodRow = createBreakdownRow('Food', 'var(--seg-food)');
  const accommodationRow = createBreakdownRow(
    'Accommodation',
    'var(--seg-accommodation)',
  );
  const activitiesRow = createBreakdownRow('Activities', 'var(--seg-activities)');
  const transportationRow = createBreakdownRow(
    'Transportation',
    'var(--seg-transportation)',
  );
  const materialsRow = createBreakdownRow('Materials', 'var(--seg-materials)');
  const unexpectedRow = createBreakdownRow(
    'Unexpected Costs',
    'var(--seg-unexpected)',
  );

  const participantRevenueRow = createBreakdownRow(
    "Participants' Fee",
    undefined,
    'breakdown-row-divider',
    true,
  );
  const organizerRevenueRow = createBreakdownRow(
    "Organizers' Fee",
    undefined,
    undefined,
    true,
  );
  const sponsorsRow = createBreakdownRow(
    'Confirmed Sponsors & Grants',
    undefined,
    undefined,
    true,
  );
  const totalIncomeRow = createBreakdownRow(
    'Total Confirmed Incomes',
    undefined,
    'breakdown-row-total',
    true,
  );

  breakdownSection.append(stackedBar, breakdownList);
  summaryCard.append(kpiGrid, breakdownSection);

  grid.append(inputsCard, summaryCard);

  // Full-width Export Summary card
  const exportCard = el('section', 'card export-card');
  const exportHeader = el('div', 'export-header');
  const exportTitleGroup = el('div', 'export-title-group');
  exportTitleGroup.append(
    el('h2', 'card-title', 'Export Summary'),
    el(
      'p',
      'export-caption',
      'Per ESTIEM Event Organisation 101: use Break-Even for your Board/Members and Funding Gap to pitch your University or Sponsors.',
    ),
  );

  const exportControls = el('div', 'export-controls');
  const tabList = el('div', 'export-tabs');
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Export summary version');

  const boardTabBtn = el('button', 'export-tab', 'Break-Even (Board)');
  boardTabBtn.type = 'button';
  boardTabBtn.setAttribute('role', 'tab');

  const gapTabBtn = el('button', 'export-tab', 'Funding Gap (Uni / Sponsor)');
  gapTabBtn.type = 'button';
  gapTabBtn.setAttribute('role', 'tab');

  tabList.append(boardTabBtn, gapTabBtn);

  const copyBtn = el('button', 'btn btn-copy', 'Copy Summary');
  copyBtn.type = 'button';

  exportControls.append(tabList, copyBtn);
  exportHeader.append(exportTitleGroup, exportControls);

  const exportPreview = el('pre', 'export-preview');
  exportCard.append(exportHeader, exportPreview);

  shell.append(header, statusBanner, grid, exportCard);
  root.replaceChildren(shell);

  const syncControlsFromState = (): void => {
    for (const [key, refs] of controls) {
      const value = state[key];
      refs.numberInput.value = String(value);
      refs.slider.value = String(Math.min(refs.config.sliderMax, value));
    }
  };

  const render = (): void => {
    const result = calculateBudget(state);
    const { input, breakdown, status } = result;

    // Status banner
    statusBanner.dataset.status = status.level;
    statusBadge.textContent = status.badge;
    statusHeadline.textContent = status.headline;
    statusDetail.textContent = status.detail;
    statusMarginPill.textContent =
      result.marginPercent === null
        ? 'No expenses entered'
        : `Balance: ${result.marginPercent >= 0 ? '+' : ''}${result.marginPercent.toFixed(1)}%`;

    // KPI tiles
    totalCostKpi.value.textContent = formatEur(result.totalCost);
    totalCostKpi.sub.textContent =
      input.participants > 0
        ? `${formatEur(result.totalCost / input.participants)} gross / participant`
        : 'Includes unexpected buffer';

    netCostKpi.value.textContent = formatEur(result.netCost);
    netCostKpi.sub.textContent = `After ${formatEur(breakdown.sponsorsIncome + breakdown.organizerFeeIncome)} sponsors + org fees`;

    if (result.breakEvenFee === null) {
      breakEvenKpi.value.textContent = 'N/A';
      breakEvenKpi.sub.textContent = 'Requires ≥ 1 participant';
    } else {
      breakEvenKpi.value.textContent = formatEur(result.breakEvenFee);
      const diff = result.breakEvenFee - input.targetFee;
      if (Math.abs(diff) < 0.005) {
        breakEvenKpi.sub.textContent = 'Matches target fee';
      } else if (diff > 0) {
        breakEvenKpi.sub.textContent = `${formatEur(diff)} above target fee`;
      } else {
        breakEvenKpi.sub.textContent = `${formatEur(Math.abs(diff))} below target fee`;
      }
    }

    surplusKpi.tile.dataset.tone = status.level;
    surplusKpi.value.textContent = formatSignedEur(result.surplusDeficit);
    surplusKpi.sub.textContent =
      result.surplusDeficitPerParticipant === null
        ? 'No participant fee revenue'
        : `${formatSignedEur(result.surplusDeficitPerParticipant)} / participant`;

    // Mastersheet 6-segment bar proportions
    const costBase = result.totalCost;
    const pct = (part: number): string =>
      costBase > 0 ? `${(part / costBase) * 100}%` : '0%';
    segFood.style.width = pct(breakdown.foodCost);
    segAccommodation.style.width = pct(breakdown.accommodationCost);
    segActivities.style.width = pct(breakdown.activitiesCost);
    segTransportation.style.width = pct(breakdown.transportationCost);
    segMaterials.style.width = pct(breakdown.materialsCost);
    segUnexpected.style.width = pct(breakdown.unexpectedCosts);

    // Itemized Mastersheet expenses & confirmed incomes
    const mealPeople = input.participants + input.organizers;
    foodRow.formula.textContent = `(${mealPeople} ppl × ${input.nights} × ${formatEur(input.foodPerPersonDay)})`;
    foodRow.amount.textContent = formatEur(breakdown.foodCost);

    accommodationRow.formula.textContent = `(${input.participants} pax × ${input.nights} × ${formatEur(input.hostelPerPersonNight)})`;
    accommodationRow.amount.textContent = formatEur(breakdown.accommodationCost);

    activitiesRow.formula.textContent = '(fixed)';
    activitiesRow.amount.textContent = formatEur(breakdown.activitiesCost);

    transportationRow.formula.textContent = '(fixed)';
    transportationRow.amount.textContent = formatEur(
      breakdown.transportationCost,
    );

    materialsRow.formula.textContent = '(fixed)';
    materialsRow.amount.textContent = formatEur(breakdown.materialsCost);

    unexpectedRow.formula.textContent = `(${input.unexpectedCostsPercent}% of ${formatEur(breakdown.baseExpensesSubtotal)})`;
    unexpectedRow.amount.textContent = formatEur(breakdown.unexpectedCosts);

    participantRevenueRow.formula.textContent = `(${input.participants} × ${formatEur(input.targetFee)})`;
    participantRevenueRow.amount.textContent = formatEur(
      breakdown.participantFeeIncome,
    );

    organizerRevenueRow.formula.textContent = `(${input.organizers} × ${formatEur(input.organizerFee)})`;
    organizerRevenueRow.amount.textContent = formatEur(
      breakdown.organizerFeeIncome,
    );

    sponsorsRow.formula.textContent = '(100% sure)';
    sponsorsRow.amount.textContent = formatEur(breakdown.sponsorsIncome);

    totalIncomeRow.formula.textContent = '';
    totalIncomeRow.amount.textContent = formatEur(breakdown.totalConfirmedIncome);

    // Export Summary tabs & preview
    boardTabBtn.setAttribute(
      'aria-selected',
      activeExportTab === 'board' ? 'true' : 'false',
    );
    gapTabBtn.setAttribute(
      'aria-selected',
      activeExportTab === 'funding-gap' ? 'true' : 'false',
    );

    currentExportText =
      activeExportTab === 'board'
        ? generateBoardExport(result)
        : generateFundingGapExport(result);
    exportPreview.textContent = currentExportText;
  };

  hostBtn.addEventListener('click', () => {
    state = applyHostParticipants(state);
    syncControlsFromState();
    render();
  });

  sponsorBtn.addEventListener('click', () => {
    state = applySponsorBoost(state, 500);
    syncControlsFromState();
    render();
  });

  hostelSpikeBtn.addEventListener('click', () => {
    state = applyHostelIncrease(state, 25);
    syncControlsFromState();
    render();
  });

  resetBtn.addEventListener('click', () => {
    state = createDefaultBudgetInput();
    syncControlsFromState();
    render();
  });

  boardTabBtn.addEventListener('click', () => {
    activeExportTab = 'board';
    render();
  });

  gapTabBtn.addEventListener('click', () => {
    activeExportTab = 'funding-gap';
    render();
  });

  copyBtn.addEventListener('click', () => {
    void copyText(currentExportText).then((copied) => {
      if (!copied) {
        return;
      }
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('is-copied');
      if (copyTimer !== undefined) {
        window.clearTimeout(copyTimer);
      }
      copyTimer = window.setTimeout(() => {
        copyBtn.textContent = 'Copy Summary';
        copyBtn.classList.remove('is-copied');
        copyTimer = undefined;
      }, 1800);
    });
  });

  syncControlsFromState();
  render();
}

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  mountApp(app);
}
