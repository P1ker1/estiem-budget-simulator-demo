import './style.css';
import {
  applyHostelIncrease,
  calculateBudget,
  createDefaultBudgetInput,
  formatEur,
  formatSignedEur,
  sanitizeNonNegative,
  sanitizeNonNegativeInt,
  type BudgetInput,
  type BudgetInputKey,
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
    hint: 'Paying attendees',
    group: 'scope',
    integer: true,
    sliderMax: 100,
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
    key: 'hostelPerPersonNight',
    label: 'Hostel / person / night',
    hint: 'Accommodation rate per bed-night',
    group: 'costs',
    sliderMax: 60,
    sliderStep: 0.5,
    inputStep: 0.01,
    unit: '€',
  },
  {
    key: 'foodPerPersonDay',
    label: 'Food / person / day',
    hint: 'Meals & catering per participant-day',
    group: 'costs',
    sliderMax: 40,
    sliderStep: 0.5,
    inputStep: 0.01,
    unit: '€',
  },
  {
    key: 'localTransportTotal',
    label: 'Local transport total',
    hint: 'Fixed group transit & bus passes',
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
    key: 'sponsorsAndGrants',
    label: 'Sponsors & grants',
    hint: 'External funding subtracted from costs',
    group: 'costs',
    sliderMax: 5000,
    sliderStep: 50,
    inputStep: 1,
    unit: '€ credit',
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

function mountApp(root: HTMLElement): void {
  let state: BudgetInput = createDefaultBudgetInput();
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
      'Stress-test participant fees, accommodation rates, and sponsorship coverage in real time.',
    ),
  );

  const actions = el('div', 'scenario-actions');
  const hostelSpikeBtn = el('button', 'btn btn-scenario', 'Scenario: Hostel +25%');
  hostelSpikeBtn.type = 'button';
  const resetBtn = el('button', 'btn btn-reset', 'Reset Defaults');
  resetBtn.type = 'button';
  actions.append(hostelSpikeBtn, resetBtn);
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
  scopeGroup.append(el('h3', 'group-heading', 'Event Scope & Target'));

  const costsGroup = el('div', 'input-group');
  costsGroup.append(el('h3', 'group-heading', 'Costs & Funding'));

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

  const totalCostKpi = createKpiTile('Total Cost');
  const netCostKpi = createKpiTile('Net Cost (after sponsors)');
  const breakEvenKpi = createKpiTile('Break-Even Fee');
  const surplusKpi = createKpiTile('Surplus / Deficit');

  kpiGrid.append(
    totalCostKpi.tile,
    netCostKpi.tile,
    breakEvenKpi.tile,
    surplusKpi.tile,
  );

  // Breakdown section
  const breakdownSection = el('div', 'breakdown-section');
  breakdownSection.append(el('h3', 'section-subtitle', 'Cost & Funding Breakdown'));

  const stackedBar = el('div', 'stacked-bar');
  const segHostel = el('div', 'bar-segment bar-hostel');
  const segFood = el('div', 'bar-segment bar-food');
  const segTransport = el('div', 'bar-segment bar-transport');
  const segActivities = el('div', 'bar-segment bar-activities');
  stackedBar.append(segHostel, segFood, segTransport, segActivities);

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

  const hostelRow = createBreakdownRow('Hostel', 'var(--seg-hostel)');
  const foodRow = createBreakdownRow('Food', 'var(--seg-food)');
  const transportRow = createBreakdownRow(
    'Local transport',
    'var(--seg-transport)',
  );
  const activitiesRow = createBreakdownRow(
    'Activities / social',
    'var(--seg-activities)',
  );
  const sponsorsRow = createBreakdownRow(
    'Sponsors & grants',
    undefined,
    'breakdown-row-divider',
    true,
  );
  const revenueRow = createBreakdownRow('Target fee revenue');

  breakdownSection.append(stackedBar, breakdownList);
  summaryCard.append(kpiGrid, breakdownSection);

  grid.append(inputsCard, summaryCard);
  shell.append(header, statusBanner, grid);
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
        ? 'No costs entered'
        : `Margin: ${result.marginPercent >= 0 ? '+' : ''}${result.marginPercent.toFixed(1)}%`;

    // KPI tiles
    totalCostKpi.value.textContent = formatEur(result.totalCost);
    totalCostKpi.sub.textContent =
      input.participants > 0
        ? `${formatEur(result.totalCost / input.participants)} gross / person`
        : 'Fixed + variable costs';

    netCostKpi.value.textContent = formatEur(result.netCost);
    netCostKpi.sub.textContent = `After ${formatEur(breakdown.sponsorsOffset)} sponsors`;

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
        ? 'No fee revenue at 0 participants'
        : `${formatSignedEur(result.surplusDeficitPerParticipant)} / participant`;

    // Stacked bar proportions
    const costBase = result.totalCost;
    const pct = (part: number): string =>
      costBase > 0 ? `${(part / costBase) * 100}%` : '0%';
    segHostel.style.width = pct(breakdown.hostelCost);
    segFood.style.width = pct(breakdown.foodCost);
    segTransport.style.width = pct(breakdown.transportCost);
    segActivities.style.width = pct(breakdown.activitiesCost);

    // Itemized breakdown
    hostelRow.formula.textContent = `(${input.participants} × ${input.nights} × ${formatEur(input.hostelPerPersonNight)})`;
    hostelRow.amount.textContent = formatEur(breakdown.hostelCost);

    foodRow.formula.textContent = `(${input.participants} × ${input.nights} × ${formatEur(input.foodPerPersonDay)})`;
    foodRow.amount.textContent = formatEur(breakdown.foodCost);

    transportRow.formula.textContent = '(fixed)';
    transportRow.amount.textContent = formatEur(breakdown.transportCost);

    activitiesRow.formula.textContent = '(fixed)';
    activitiesRow.amount.textContent = formatEur(breakdown.activitiesCost);

    sponsorsRow.formula.textContent = '(subtracted from costs)';
    sponsorsRow.amount.textContent =
      breakdown.sponsorsOffset > 0
        ? `-${formatEur(breakdown.sponsorsOffset)}`
        : formatEur(0);

    revenueRow.formula.textContent = `(${input.participants} × ${formatEur(input.targetFee)})`;
    revenueRow.amount.textContent = formatEur(breakdown.feeRevenue);
  };

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

  syncControlsFromState();
  render();
}

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  mountApp(app);
}
