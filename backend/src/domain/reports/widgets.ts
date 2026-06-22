import { randomUUID } from 'crypto';
import type { EvidenceWidget, InvestmentReport, WidgetType } from '../../agents/definitions/types';
import { evidenceWidgetsAgent } from '../../agents/definitions/format/evidence-widgets';
import { extractEvidenceWidgets } from '../../agents/runtime/parser';
import { runSpecializedAgent } from '../../agents/runtime/subagent';
import { logError } from '../../infra/db/error-log';

const WIDGET_TYPES: WidgetType[] = [
  'line_chart',
  'bar_chart',
  'timeline',
  'list',
  'metric_grid',
  'progress',
  'comparison',
  'sparkline',
  'donut',
  'table',
  'correlation_chart',
];

const ENABLED = process.env.WIDGET_AGENT_ENABLED !== 'false';

function isWidgetType(value: string): value is WidgetType {
  return WIDGET_TYPES.includes(value as WidgetType);
}

function numericStats(stats: Record<string, unknown>): Array<{ key: string; value: number }> {
  const pairs: Array<{ key: string; value: number }> = [];

  for (const [key, raw] of Object.entries(stats)) {
    const num = Number(raw);
    if (Number.isFinite(num)) {
      pairs.push({ key, value: num });
    }
  }

  return pairs;
}

export function buildFallbackWidgets(report: InvestmentReport): EvidenceWidget[] {
  const widgets: EvidenceWidget[] = [];

  widgets.push({
    id: 'recommendation-summary',
    type: 'metric_grid',
    title: 'Recommendation',
    subtitle: report.company,
    priority: 1,
    data: {
      metrics: [
        {
          label: 'Recommendation',
          value: report.recommendation,
          trend: report.recommendation === 'BUY' ? 'up' : report.recommendation === 'SELL' ? 'down' : 'flat',
        },
        {
          label: 'Confidence',
          value: report.confidence,
          unit: '%',
          trend: report.confidence >= 70 ? 'up' : report.confidence < 50 ? 'down' : 'flat',
        },
        {
          label: 'Risk Score',
          value: report.risk_score,
          unit: '%',
          trend: report.risk_score > 60 ? 'down' : 'up',
        },
      ],
    },
  });

  widgets.push({
    id: 'score-progress',
    type: 'progress',
    title: 'Scores',
    priority: 2,
    data: {
      items: [
        { label: 'Confidence', value: report.confidence, max: 100, color: '#4CAF50' },
        { label: 'Risk', value: report.risk_score, max: 100, color: '#FF9800' },
      ],
    },
  });

  if (report.evidence.length > 0) {
    widgets.push({
      id: 'evidence-list',
      type: 'list',
      title: 'Key Evidence',
      priority: 3,
      data: {
        items: report.evidence.map((item) => ({
          label: item.agent,
          detail: item.finding,
        })),
      },
    });

    widgets.push({
      id: 'evidence-timeline',
      type: 'timeline',
      title: 'Evidence Timeline',
      subtitle: 'Ordered by review',
      priority: 4,
      data: {
        events: report.evidence.map((item, index) => ({
          at: report.generated_at,
          title: item.agent,
          description: item.finding,
          source: item.agent,
          severity: index === 0 ? 'high' : 'medium',
        })),
      },
    });
  }

  const nums = numericStats(report.statistics);

  if (nums.length >= 2) {
    widgets.push({
      id: 'statistics-bar',
      type: 'bar_chart',
      title: 'Market Statistics',
      priority: 5,
      data: {
        labels: nums.slice(0, 8).map((n) => n.key.replace(/_/g, ' ')),
        values: nums.slice(0, 8).map((n) => n.value),
      },
    });
  } else if (nums.length === 1) {
    widgets.push({
      id: 'statistics-metric',
      type: 'metric_grid',
      title: 'Market Statistics',
      priority: 5,
      data: {
        metrics: nums.map((n) => ({
          label: n.key.replace(/_/g, ' '),
          value: n.value,
        })),
      },
    });
  }

  if (report.agents.length > 0) {
    widgets.push({
      id: 'agent-contributors',
      type: 'donut',
      title: 'Contributing Agents',
      priority: 6,
      data: {
        segments: report.agents.map((agent, index) => ({
          label: agent,
          value: 1,
          color: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#607D8B'][index % 5],
        })),
      },
    });
  }

  return widgets;
}

function normalizeWidget(raw: Record<string, unknown>, index: number): EvidenceWidget | null {
  const type = String(raw.type ?? '');
  if (!isWidgetType(type)) return null;

  const data =
    raw.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>) : {};

  return {
    id: String(raw.id ?? `widget-${index + 1}`),
    type,
    title: String(raw.title ?? 'Insight'),
    subtitle: raw.subtitle ? String(raw.subtitle) : undefined,
    source: raw.source ? String(raw.source) : undefined,
    priority: raw.priority != null ? Number(raw.priority) : index + 1,
    data,
  };
}

export function normalizeWidgets(raw: unknown): EvidenceWidget[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) =>
      item && typeof item === 'object'
        ? normalizeWidget(item as Record<string, unknown>, index)
        : null
    )
    .filter((w): w is EvidenceWidget => w !== null)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

export async function enrichReportWithWidgets(
  report: InvestmentReport,
  options: {
    model: string;
    context?: string;
    onEvent?: (event: Record<string, unknown>) => void;
  }
): Promise<InvestmentReport> {
  if (!ENABLED) {
    return { ...report, widgets: buildFallbackWidgets(report) };
  }

  const payload = JSON.stringify(
    {
      company: report.company,
      ticker: report.ticker,
      industry: report.industry,
      recommendation: report.recommendation,
      confidence: report.confidence,
      risk_score: report.risk_score,
      agents: report.agents,
      evidence: report.evidence,
      statistics: report.statistics,
      time_horizon: report.time_horizon,
      generated_at: report.generated_at,
    },
    null,
    2
  );

  try {
    const result = await runSpecializedAgent({
      definition: evidenceWidgetsAgent,
      prompt: `Translate this investment report evidence into mobile widgets for ${report.ticker}.\n\n${payload}`,
      model: options.model,
      context: options.context,
      onEvent: options.onEvent,
    });

    const widgets = extractEvidenceWidgets(result.text);

    return {
      ...report,
      widgets: widgets.length > 0 ? widgets : buildFallbackWidgets(report),
    };
  } catch (error) {
      logError(error, { source: 'util/widgets.ts - enrichReportWithWidgets' });
    return { ...report, widgets: buildFallbackWidgets(report) };
  }
}

export async function enrichReportsWithWidgets(
  reports: InvestmentReport[],
  options: {
    model: string;
    context?: string;
    onEvent?: (event: Record<string, unknown>) => void;
  }
): Promise<InvestmentReport[]> {
  const enriched: InvestmentReport[] = [];

  for (const report of reports) {
    enriched.push(await enrichReportWithWidgets(report, options));
  }

  return enriched;
}

export function ensureWidgetIds(widgets: EvidenceWidget[]): EvidenceWidget[] {
  return widgets.map((widget) => ({
    ...widget,
    id: widget.id || randomUUID(),
  }));
}
