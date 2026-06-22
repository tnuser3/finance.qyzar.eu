export const DISCOVERY_SELECTION_CRITERIA = `
Selection criteria (mandatory):
- Only surface companies with a credible path to industry leadership: market share, moat, regulatory tailwind, or category-defining product.
- Each opportunity MUST cite tool-backed evidence — never invent tickers or facts.
- Assign titanScore (0-100): your estimate of long-term dominance potential.
- Target at least 2 opportunities per agent pass with full evidence arrays.
- NEVER use generic phrases like "found in tool results", "evidence_fallback", or empty HOLD without a thesis.
- For unlisted/private/pre-IPO leaders, set listingStatus to emerging, pre_ipo, or foreign and use company name.
- ALL text fields MUST be English only (ASCII). Reject non-English sources; never copy foreign-language headlines into company or title fields.`;

export const ENGLISH_ONLY_AGENT_RULE = `
Language (mandatory):
- ALL output text MUST be English only (ASCII). No Hindi, Chinese, Arabic, Greek, or other scripts.
- Ignore and discard any non-English headlines or sources from tool results.
- company, title, description, evidence summaries, and summary must be written in English.`;

export const DISCOVERY_OPPORTUNITY_FORMAT = `
When finished, return ONLY valid JSON inside this block (no markdown fences):
<agent_output>
{
  "opportunities": [
    {
      "title": "Company Name — thesis headline",
      "description": "Long in-depth thesis: why this could become an industry leader and investment opportunity",
      "ticker": "SMR",
      "company": "NuScale Power",
      "industry": "Nuclear Energy",
      "listingStatus": "listed",
      "confidence": 72,
      "risk_score": 35,
      "titanScore": 68,
      "evidence": [
        {
          "source": "gdelt_search_articles",
          "rawData": "short excerpt or key fields from tool JSON",
          "reason": "why this supports the thesis",
          "summary": "one-line takeaway"
        }
      ]
    }
  ],
  "summary": "Phase executive summary",
  "shortfallNote": "optional — explain if fewer than target opportunities found"
}
</agent_output>

listingStatus values: listed | emerging | pre_ipo | foreign
${DISCOVERY_SELECTION_CRITERIA}`;

export const DISCOVERY_OUTPUT_FORMAT = `
When finished, return ONLY valid JSON inside this block (no markdown fences):
<agent_output>
{
  "findings": [
    {
      "company": "NuScale Power",
      "ticker": "SMR",
      "type": "commodity_exposure",
      "agent": "commodities",
      "industry": "Nuclear Energy",
      "title": "SMR supply chain beneficiary",
      "description": "2-4 sentence AI summary: what the company does, why it matters now, and the investment angle.",
      "evidence": [{"agent": "commodities", "finding": "Specific fact with numbers or dates from a tool result."}],
      "newsEvents": [{"at": "2026-06-20T00:00:00Z", "title": "Headline from tool", "source": "gdelt", "url": "https://..."}],
      "stats": {
        "trend": "up",
        "risk_score": 35,
        "opportunity": "AI power demand beneficiary",
        "rivals": "OKLO, NNE",
        "geopolitical": "US nuclear policy tailwind"
      }
    }
  ],
  "summary": "One-line executive summary with at least one real US ticker."
}
</agent_output>

Use tools to gather evidence before writing agent_output. Replace agent id and tickers with your actual findings. Each finding must include:
- A specific industry (use fmp_profile if unsure)
- A plain-language description (what the company is)
- Why it was added (thesis in description + evidence findings)
- stats covering risk, opportunity, rivals/peers, and geopolitics where relevant
- newsEvents or evidence citing the actual source (tool name + URL when available)`;

export const INVESTMENT_OUTPUT_FORMAT = `
When finished, return ONLY valid JSON inside this block (no markdown fences):
<agent_output>
{
  "reports": [
    {
      "company": "NVIDIA",
      "ticker": "NVDA",
      "industry": "Semiconductors",
      "recommendation": "BUY",
      "confidence": 87,
      "risk_score": 22,
      "agents": ["Macro", "Earnings"],
      "evidence": [{"agent": "Earnings", "finding": "Revenue growth 38%"}],
      "statistics": {},
      "time_horizon": "12 months",
      "generated_at": "ISO-8601 timestamp",
      "approved": true
    }
  ],
  "summary": "brief executive summary"
}
</agent_output>`;

export const WIDGET_OUTPUT_FORMAT = `
When finished, return ONLY valid JSON inside this block (no markdown fences):
<agent_output>
{
  "widgets": [
    {
      "id": "unique-kebab-id",
      "type": "line_chart|bar_chart|timeline|list|metric_grid|progress|comparison|sparkline|donut|table|correlation_chart",
      "title": "Widget title",
      "subtitle": "optional context",
      "source": "agent or data source name",
      "priority": 1,
      "data": {}
    }
  ],
  "summary": "brief note on visualization choices"
}
</agent_output>

Widget data schemas (use the shape that matches type):
- line_chart: { "labels": ["Q1","Q2"], "series": [{ "name": "Revenue", "values": [100,120], "color": "#4CAF50" }] }
- bar_chart: { "labels": ["Risk","Growth"], "values": [68,85], "unit": "%" }
- timeline: { "events": [{ "at": "ISO-8601", "title": "...", "description": "...", "severity": "low|medium|high", "source": "sec" }] }
- list: { "items": [{ "label": "...", "value": "...", "detail": "..." }] }
- metric_grid: { "metrics": [{ "label": "Confidence", "value": 87, "delta": "+5", "trend": "up|down|flat", "unit": "%" }] }
- progress: { "items": [{ "label": "Risk Score", "value": 68, "max": 100, "color": "#FF9800" }] }
- comparison: { "left": { "label": "Bullish", "value": 72 }, "right": { "label": "Bearish", "value": 28 } }
- sparkline: { "values": [1,2,3,4], "label": "Sentiment trend" }
- donut: { "segments": [{ "label": "BUY", "value": 40, "color": "#4CAF50" }] }
- table: { "columns": ["Metric","Value"], "rows": [["PE","24.5"]] }
- correlation_chart: { "labels": ["2026-06-10"], "values": [120.5], "markers": [{ "at": "ISO-8601", "label": "News headline", "severity": "medium", "source": "gnews" }], "windowStart": "ISO", "windowEnd": "ISO", "pctChange": -4.2 }

Rules:
- Produce 3-8 widgets per company covering different evidence angles.
- Prefer timelines for dated events, line/bar charts for numeric trends, lists for qualitative findings.
- Extract numbers from evidence and statistics when possible; do not invent data.
- priority 1 = show first on mobile.`;

export const CORRELATION_TOOLS = [
  'gnews',
  'gdelt',
  'guardian',
  'currentsapi',
  'fmp',
  'alphavantage',
  'finnhub',
  'massive',
  'rss',
] as const;

export const CORRELATION_OUTPUT_FORMAT = `
When finished, return ONLY valid JSON inside this block (no markdown fences):
<agent_output>
{
  "correlations": [
    {
      "title": "Short headline linking news to price move",
      "description": "Exactly two sentences. First sentence explains the news event. Second sentence explains the market reaction and affected companies.",
      "windowStart": "ISO-8601 timestamp",
      "windowEnd": "ISO-8601 timestamp",
      "primaryTicker": "NVDA",
      "companies": [{ "ticker": "NVDA", "name": "NVIDIA" }],
      "evidence": [{ "agent": "gnews", "finding": "..." }],
      "newsEvents": [{ "at": "ISO-8601", "title": "...", "source": "gnews", "url": "..." }],
      "confidence": 75
    }
  ],
  "summary": "brief executive summary"
}
</agent_output>

Rules:
- description MUST be exactly 2 sentences.
- Do NOT invent stock prices — only dates, tickers, and news; prices are anchored in post-processing.
- Prefer watchlist P1/P2 tickers when multiple companies match a theme.
- windowStart/windowEnd must fall within the scan window provided in the prompt.
- Link news events to plausible price moves with supporting evidence.`;

export const WATCHLIST_REVIEWER_OUTPUT_FORMAT = `
When finished, return ONLY valid JSON inside this block (no markdown fences):
<agent_output>
{
  "reviews": [
    {
      "ticker": "NVDA",
      "name": "NVIDIA",
      "headline": "Short daily headline",
      "summary": "Exactly two sentences. First sentence covers the main news. Second sentence covers market reaction context.",
      "sentiment": "bullish|bearish|neutral|mixed",
      "confidence": 75,
      "newsHighlights": [
        { "at": "ISO-8601", "title": "Headline", "source": "gnews", "url": "https://..." }
      ],
      "evidence": [{ "agent": "gnews", "finding": "..." }]
    }
  ],
  "correlations": [
    {
      "title": "Short headline linking news to price move",
      "description": "Exactly two sentences. First sentence explains the news event. Second sentence explains the market reaction and affected companies.",
      "windowStart": "ISO-8601 timestamp",
      "windowEnd": "ISO-8601 timestamp",
      "primaryTicker": "NVDA",
      "companies": [{ "ticker": "NVDA", "name": "NVIDIA" }],
      "evidence": [{ "agent": "gnews", "finding": "..." }],
      "newsEvents": [{ "at": "ISO-8601", "title": "...", "source": "gnews", "url": "..." }],
      "confidence": 75
    }
  ],
  "daySummary": "Executive summary of the trading session for the watchlist."
}
</agent_output>

Rules:
- Every review.summary must be exactly 2 sentences.
- Every correlation.description must be exactly 2 sentences.
- Cover each watchlist ticker supplied in context unless there was truly no news or price activity.
- Do NOT invent stock prices — only dates, tickers, and news; prices are anchored in post-processing.`;

export const SUBAGENT_RULES = `
Subagent protocol:
- For parallel work, emit one or more blocks:
<spawn_subagent>
{"label":"task name","prompt":"focused research question"}
</spawn_subagent>
- Wait for subagent results before final agent_output.
- Each subagent should use tools for its focused scope.`;

export const RISK_OUTPUT_FORMAT = `
Output format:
<agent_output>
{
  "summary": "risk overview",
  "safetyNets": ["rule1"],
  "restrictions": ["restriction1"],
  "companyAssessments": [
    {
      "company": "name",
      "ticker": "TICK",
      "risk_score": 45,
      "profitable": true,
      "recommendation": "approve|restrict|reject",
      "reasons": ["reason"]
    }
  ]
}
</agent_output>

Discovery validation rules:
- risk_score is 0-100 (higher = riskier). Reject if risk_score > 80 or profitable is false.
- Every candidate in the prompt must receive an assessment.`;

export const DISCOVERY_TOOLS = [
  'gdelt',
  'currentsapi',
  'guardian',
  'alphavantage',
  'fmp',
  'finnhub',
  'massive',
  'reddit',
  'googletrends',
  'rss',
  'fred',
  'census',
  'lda',
  'gnews',
  'usaspending',
  'edgar',
  'stocktwits',
  'coingecko',
] as const;

export const MONITORING_TOOLS = [
  'edgar',
  'rss',
  'lda',
  'gnews',
  'currentsapi',
  'gdelt',
  'guardian',
  'reddit',
  'googletrends',
  'stocktwits',
  'alphavantage',
  'fred',
  'fmp',
  'finnhub',
  'massive',
] as const;

export const MONITORING_OUTPUT_FORMAT = `
When finished, return ONLY valid JSON inside this block:
<agent_output>
{
  "company": "NVIDIA",
  "ticker": "NVDA",
  "risk_score": 68,
  "sentiment_score": 72,
  "growth_score": 85,
  "severity": "medium",
  "signals": [{"source": "sec", "finding": "Recent 8-K filing"}],
  "summary": "brief summary"
}
</agent_output>`;

export const DISCOVERY_WORKFLOW_OUTPUT_FORMAT = `
When finished, return ONLY valid JSON inside this block:
<agent_output>
{
  "new_opportunities": ["Nuclear Energy", "AI Datacenters"],
  "companies": [
    {"ticker": "SMR", "name": "NuScale Power", "industry": "Nuclear", "confidence": 75}
  ],
  "summary": "brief executive summary"
}
</agent_output>`;
