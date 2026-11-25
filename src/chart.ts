import { formatEur, type BudgetResult } from './budget.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

const VIEWBOX_WIDTH = 460;
const VIEWBOX_HEIGHT = 225;
const MARGIN = {
  left: 56,
  right: 16,
  top: 20,
  bottom: 34,
} as const;

const PLOT_WIDTH = VIEWBOX_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - MARGIN.top - MARGIN.bottom;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function niceUpperBound(rawMax: number): number {
  const safeMax = Math.max(500, rawMax);
  const magnitude = Math.pow(10, Math.floor(Math.log10(safeMax)));
  const normalized = safeMax / magnitude;
  let stepMultiplier = 10;
  if (normalized <= 1) {
    stepMultiplier = 1;
  } else if (normalized <= 1.2) {
    stepMultiplier = 1.2;
  } else if (normalized <= 1.5) {
    stepMultiplier = 1.5;
  } else if (normalized <= 2) {
    stepMultiplier = 2;
  } else if (normalized <= 2.5) {
    stepMultiplier = 2.5;
  } else if (normalized <= 4) {
    stepMultiplier = 4;
  } else if (normalized <= 5) {
    stepMultiplier = 5;
  } else if (normalized <= 6) {
    stepMultiplier = 6;
  } else if (normalized <= 8) {
    stepMultiplier = 8;
  }
  return Math.ceil(stepMultiplier * magnitude);
}

function formatCompactEur(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    const formatted = Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, '');
    return `€${formatted}k`;
  }
  return `€${Math.round(value)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function renderBreakEvenChart(
  svg: SVGSVGElement,
  result: BudgetResult,
): void {
  const { input, costStructure } = result;
  const {
    fixedCosts,
    variableCostPerParticipant,
    fixedIncome,
    incomePerParticipant,
    breakEvenParticipants,
  } = costStructure;

  const maxX = Math.max(50, Math.ceil((input.participants + 15) / 10) * 10);
  const expensesAtMax = fixedCosts + maxX * variableCostPerParticipant;
  const incomeAtMax = fixedIncome + maxX * incomePerParticipant;
  const maxY = niceUpperBound(
    Math.max(expensesAtMax, incomeAtMax, fixedCosts, fixedIncome, 500),
  );

  const mapX = (participants: number): number =>
    MARGIN.left + (participants / maxX) * PLOT_WIDTH;
  const mapY = (amount: number): number =>
    MARGIN.top + PLOT_HEIGHT - (clamp(amount, 0, maxY) / maxY) * PLOT_HEIGHT;

  const nodes: SVGElement[] = [];

  // Horizontal gridlines & Y-axis ticks
  const yRatios = [0, 0.25, 0.5, 0.75, 1];
  for (const ratio of yRatios) {
    const val = maxY * ratio;
    const y = mapY(val);
    nodes.push(
      svgEl('line', {
        x1: MARGIN.left,
        y1: y.toFixed(1),
        x2: MARGIN.left + PLOT_WIDTH,
        y2: y.toFixed(1),
        stroke: ratio === 0 ? '#a5afab' : '#e8eaea',
        'stroke-width': ratio === 0 ? 1.2 : 1,
      }),
    );
    nodes.push(
      svgEl(
        'text',
        {
          x: MARGIN.left - 7,
          y: (y + 3.5).toFixed(1),
          'text-anchor': 'end',
          fill: '#525956',
          'font-size': '10.5',
          'font-family': 'inherit',
        },
        formatCompactEur(val),
      ),
    );
  }

  // X-axis ticks & label
  const xTickCount = 5;
  const baselineY = mapY(0);
  for (let i = 0; i <= xTickCount; i += 1) {
    const pax = Math.round((maxX / xTickCount) * i);
    const x = mapX(pax);
    nodes.push(
      svgEl('line', {
        x1: x.toFixed(1),
        y1: baselineY.toFixed(1),
        x2: x.toFixed(1),
        y2: (baselineY + 4).toFixed(1),
        stroke: '#a5afab',
        'stroke-width': 1,
      }),
    );
    nodes.push(
      svgEl(
        'text',
        {
          x: x.toFixed(1),
          y: (baselineY + 15).toFixed(1),
          'text-anchor':
            i === 0 ? 'start' : i === xTickCount ? 'end' : 'middle',
          fill: '#525956',
          'font-size': '10.5',
          'font-family': 'inherit',
        },
        String(pax),
      ),
    );
  }

  nodes.push(
    svgEl(
      'text',
      {
        x: (MARGIN.left + PLOT_WIDTH / 2).toFixed(1),
        y: VIEWBOX_HEIGHT - 4,
        'text-anchor': 'middle',
        fill: '#525956',
        'font-size': '10.5',
        'font-weight': '600',
        'font-family': 'inherit',
      },
      'Participants',
    ),
  );

  // Shaded Fixed Costs band (0 -> fixedCosts)
  const fixedY = mapY(fixedCosts);
  if (fixedCosts > 0) {
    nodes.push(
      svgEl('rect', {
        x: MARGIN.left,
        y: fixedY.toFixed(1),
        width: PLOT_WIDTH,
        height: Math.max(0, baselineY - fixedY).toFixed(1),
        fill: 'rgba(128, 130, 133, 0.11)',
      }),
    );
  }

  // Shaded Variable Costs triangle above fixedCosts
  const expMaxY = mapY(expensesAtMax);
  if (variableCostPerParticipant > 0) {
    const x0 = mapX(0).toFixed(1);
    const xMax = mapX(maxX).toFixed(1);
    const yFixed = fixedY.toFixed(1);
    const yExpMax = expMaxY.toFixed(1);
    nodes.push(
      svgEl('polygon', {
        points: `${x0},${yFixed} ${xMax},${yExpMax} ${xMax},${yFixed}`,
        fill: 'rgba(118, 18, 20, 0.08)',
      }),
    );
  }

  // Fixed Costs dashed baseline + label
  nodes.push(
    svgEl('line', {
      x1: MARGIN.left,
      y1: fixedY.toFixed(1),
      x2: MARGIN.left + PLOT_WIDTH,
      y2: fixedY.toFixed(1),
      stroke: '#808285',
      'stroke-width': 1.4,
      'stroke-dasharray': '4 3',
    }),
  );

  const fixedLabelY = clamp(fixedY - 5, MARGIN.top + 10, baselineY - 5);
  nodes.push(
    svgEl(
      'text',
      {
        x: MARGIN.left + PLOT_WIDTH - 4,
        y: fixedLabelY.toFixed(1),
        'text-anchor': 'end',
        fill: '#525956',
        'font-size': '10',
        'font-weight': '600',
        'font-family': 'inherit',
      },
      'Fixed',
    ),
  );

  // Total Expenses line (ESTIEM Red)
  nodes.push(
    svgEl('line', {
      x1: mapX(0).toFixed(1),
      y1: fixedY.toFixed(1),
      x2: mapX(maxX).toFixed(1),
      y2: expMaxY.toFixed(1),
      stroke: '#761214',
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
    }),
  );

  // Confirmed Incomes line (ESTIEM Green)
  nodes.push(
    svgEl('line', {
      x1: mapX(0).toFixed(1),
      y1: mapY(fixedIncome).toFixed(1),
      x2: mapX(maxX).toFixed(1),
      y2: mapY(incomeAtMax).toFixed(1),
      stroke: '#205e44',
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
    }),
  );

  // Current Participants vertical guide + dots
  const curX = mapX(input.participants);
  const curExpY = mapY(result.totalCost);
  const curIncY = mapY(result.breakdown.totalConfirmedIncome);

  nodes.push(
    svgEl('line', {
      x1: curX.toFixed(1),
      y1: MARGIN.top,
      x2: curX.toFixed(1),
      y2: baselineY.toFixed(1),
      stroke: '#3491bd',
      'stroke-width': 1.3,
      'stroke-dasharray': '3 3',
    }),
  );

  const curLabelX = clamp(curX, MARGIN.left + 22, MARGIN.left + PLOT_WIDTH - 22);
  nodes.push(
    svgEl(
      'text',
      {
        x: curLabelX.toFixed(1),
        y: MARGIN.top - 5,
        'text-anchor': 'middle',
        fill: '#195e7f',
        'font-size': '10',
        'font-weight': '700',
        'font-family': 'inherit',
      },
      `${input.participants} pax`,
    ),
  );

  nodes.push(
    svgEl('circle', {
      cx: curX.toFixed(1),
      cy: curExpY.toFixed(1),
      r: 4.2,
      fill: '#761214',
      stroke: '#ffffff',
      'stroke-width': 1.5,
    }),
  );

  nodes.push(
    svgEl('circle', {
      cx: curX.toFixed(1),
      cy: curIncY.toFixed(1),
      r: 4.2,
      fill: '#205e44',
      stroke: '#ffffff',
      'stroke-width': 1.5,
    }),
  );

  // Break-Even intersection marker (ESTIEM Orange)
  if (
    breakEvenParticipants !== null &&
    breakEvenParticipants >= 0 &&
    breakEvenParticipants <= maxX
  ) {
    const beX = mapX(breakEvenParticipants);
    const beAmount =
      fixedCosts + breakEvenParticipants * variableCostPerParticipant;
    const beY = mapY(beAmount);

    nodes.push(
      svgEl('line', {
        x1: beX.toFixed(1),
        y1: beY.toFixed(1),
        x2: beX.toFixed(1),
        y2: baselineY.toFixed(1),
        stroke: '#f78f1e',
        'stroke-width': 1.3,
        'stroke-dasharray': '3 3',
      }),
    );

    nodes.push(
      svgEl('circle', {
        cx: beX.toFixed(1),
        cy: beY.toFixed(1),
        r: 4.8,
        fill: '#f78f1e',
        stroke: '#ffffff',
        'stroke-width': 1.6,
      }),
    );

    const beCount = Math.ceil(breakEvenParticipants);
    const beLabel = `BE: ${beCount}`;
    const beLabelX = clamp(beX, MARGIN.left + 20, MARGIN.left + PLOT_WIDTH - 24);
    const beLabelY = beY > MARGIN.top + 18 ? beY - 9 : beY + 16;
    nodes.push(
      svgEl(
        'text',
        {
          x: beLabelX.toFixed(1),
          y: beLabelY.toFixed(1),
          'text-anchor': 'middle',
          fill: '#8a4805',
          'font-size': '10',
          'font-weight': '750',
          'font-family': 'inherit',
        },
        beLabel,
      ),
    );
  }

  svg.replaceChildren(...nodes);

  const beSummary =
    breakEvenParticipants === null
      ? 'no break-even point because target fee is at or below variable cost per participant'
      : `break-even at ${Math.ceil(breakEvenParticipants)} participants`;
  svg.setAttribute(
    'aria-label',
    `Break-even chart: Fixed costs ${formatEur(fixedCosts)}, variable cost ${formatEur(variableCostPerParticipant)} per participant, current attendance ${input.participants} participants, ${beSummary}.`,
  );
}
