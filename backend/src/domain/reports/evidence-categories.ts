import type { EvidenceItem } from '../../agents/definitions/types';
import type { SavedReport } from './reports';

export interface EvidenceByCategory {
  pr: EvidenceItem[];
  political: EvidenceItem[];
  industry: EvidenceItem[];
  supplyChain: EvidenceItem[];
}

const PR_AGENTS = new Set(['risk_reputation']);
const POLITICAL_AGENTS = new Set(['risk_political']);
const SUPPLY_CHAIN_AGENTS = new Set(['commodities']);
const INDUSTRY_AGENTS = new Set([
  'regulatory_discovery',
  'monitor_regulatory',
  'macroeconomic',
  'technical_analysis',
  'earnings_intelligence',
  'industry',
]);

export function groupEvidenceByCategory(reports: SavedReport[]): EvidenceByCategory {
  const result: EvidenceByCategory = {
    pr: [],
    political: [],
    industry: [],
    supplyChain: [],
  };

  const seen = new Set<string>();

  for (const report of reports) {
    for (const item of report.evidence) {
      const key = `${item.agent}:${item.finding}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (PR_AGENTS.has(item.agent)) {
        result.pr.push(item);
      } else if (POLITICAL_AGENTS.has(item.agent)) {
        result.political.push(item);
      } else if (SUPPLY_CHAIN_AGENTS.has(item.agent)) {
        result.supplyChain.push(item);
      } else if (INDUSTRY_AGENTS.has(item.agent) || report.industry) {
        result.industry.push(item);
      }
    }

    if (report.industry && report.evidence.length === 0) {
      result.industry.push({
        agent: 'industry',
        finding: `${report.company} operates in ${report.industry}`,
      });
    }
  }

  return result;
}

export function filterReportsByAgent(
  reports: SavedReport[],
  agentIds: string[]
): SavedReport[] {
  const set = new Set(agentIds);
  return reports.filter(
    (r) => r.agents.some((a) => set.has(a)) || r.evidence.some((e) => set.has(e.agent))
  );
}

export function isCryptoReport(report: SavedReport): boolean {
  if (report.agents.includes('crypto_analysis')) return true;
  if (report.statistics?.isCrypto === true) return true;
  return report.evidence.some((e) => e.agent === 'crypto_analysis');
}

export function isCommodityReport(report: SavedReport): boolean {
  if (report.agents.includes('commodities')) return true;
  return report.evidence.some((e) => e.agent === 'commodities');
}
