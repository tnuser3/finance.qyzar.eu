# finance.qyzar.eu

**finance.qyzar.eu** is the first sub-project under the [Qyzar](https://qyzar.eu) umbrella — historically an online shop, now expanding into financial AI prediction. This project is a free, AI-powered market predictor for crypto and the stock market.

> Some information in this repository is intentionally redacted for security — including the AI provider implementation and certain environment variables.

---

## What it is

A WebSocket-first market intelligence platform. AI agents continuously monitor equities, crypto, macroeconomic signals, news, and regulatory data to surface insights, correlate events to price movements, and run a live company discovery pipeline — all streamed in real time to connected clients.

---

## Project goals

1. **Discovery pipeline** — complete the company discovery workflow and broadcast live discovery status to all connected clients in real time.
2. **Event timelines** — identify real-world news events (earnings, regulatory actions, macro data releases, geopolitical events) and correlate them to observed stock price movements.
3. **DeFi expansion** — extend crypto analysis beyond spot prices to cover DeFi lending protocols and liquidity pool dynamics (utilisation rates, APY shifts, impermanent loss signals).

## Future roadmap

- Public **docs site** with full API reference for the WebSocket protocol.
- **Blog** for research notes and methodology posts.

---

## Architecture overview

```
finance.qyzar.eu/
├── backend/          Node.js + TypeScript — WebSocket server, AI agents, data providers
│   └── src/
│       ├── agents/       AI agent definitions, commands, and orchestration
│       ├── discovery/    Company discovery pipeline
│       ├── domain/       Watchlist, timeline, crypto and market domain logic
│       ├── infra/        Database pool, caching, error log, rate limiting
│       ├── listeners/    WebSocket event handlers (one file per event)
│       ├── providers/    Third-party API integrations (FMP, Alpha Vantage, Reddit, …)
│       └── ws/           WebSocket server, session management, broadcast helpers
└── frontend/         Next.js + TypeScript — client UI
    └── src/
        ├── app/          App Router pages and layouts
        ├── components/   Shared React components
        └── lib/          API helpers, WebSocket client, store
```

---

## Algorithms

### Discovery pipeline

Discovery is the core daily workflow. It runs in three sequential phases, each building on the last. Agents within a phase run in parallel; the next phase only starts after the current one completes.

```
Phase 1 — Broad market scan  (parallel)
  ├── Commodities Analyst
  ├── Crypto Analysis
  └── Macroeconomic Research

        ↓ findings fed forward

Phase 2 — Opportunity identification  (parallel)
  ├── Future Opportunist
  ├── Conservationist
  └── Industry Surge Detector

        ↓ combined opportunity set

Phase 3 — Risk assessment  (parallel, per company from P1+P2)
  ├── Regulatory Discovery
  ├── Political Risk
  ├── Corporate Governance
  ├── Financial Risk
  ├── Market Risk
  └── Reputation Risk

        ↓ risk-cleared candidates

Synthesis
  └── Dossier  →  Shortfall  →  Master Investment Committee
```

**Phase 1 — Broad market scan**

| Agent | Mission | Key signals |
|---|---|---|
| Commodities Analyst | Global supply chains and spot prices for oil, metals, grain, chips, lithium, gas | GDELT, Guardian, RSS, FRED, FMP, Alpha Vantage |
| Crypto Analysis | Crypto sentiment, protocol narratives, DeFi lending pools ranked by APY / risk / stability | CoinGecko, Reddit, StockTwits, GDELT |
| Macroeconomic Research | Fed / ECB / BOJ policy, CPI, employment, GDP, treasury yields, FX, trade flows | FRED, Census, GDELT, RSS, Alpha Vantage |

**Phase 2 — Opportunity identification**

| Agent | Mission | Key signals |
|---|---|---|
| Future Opportunist | IPO pipeline, emerging markets, demand-shift modeling over 3-10 year horizons | GDELT, Currents, Guardian, Google Trends, Reddit |
| Conservationist | Low-volatility compounders — utilities, grid, telecom, healthcare staples, data center infra | FMP, Finnhub, Alpha Vantage, FRED |
| Industry Surge Detector | Industries gaining public or government attention; maps search spikes + media volume to companies, including pre-IPO and foreign leaders | Google Trends, GDELT, Reddit, USASpending, LDA |

Discovery also includes two specialist agents that can run alongside or be triggered independently:
- **Earnings Intelligence** — earnings calendar, EPS surprises, analyst revisions, insider activity
- **Technical Analysis** — RSI, MACD, Bollinger Bands, support/resistance levels, volume trends

**Phase 3 — Risk assessment**

All five risk agents receive the full discovery output and assess each candidate company independently:

| Agent | Assesses |
|---|---|
| Regulatory Discovery | SEC/FTC/DOJ/Fed RSS feeds, LDA lobbying filings, emerging regulatory themes mapped to tickers |
| Political Risk | Elections, trade wars, sanctions, geopolitical exposure |
| Corporate Governance | CEO behavior, board independence, insider trading patterns, accounting red flags |
| Financial Risk | Debt load, maturity walls, cash runway, bankruptcy signals |
| Market Risk | Volatility, liquidity, drawdown potential, correlation risk |
| Reputation Risk | Scandals, PR crises, labor disputes, litigation, social-political state |

Each risk agent returns an `approve / restrict / reject` verdict per company. Companies that clear all five gates proceed to synthesis.

---

### Correlation system

The Market Correlation agent runs independently on a recurring schedule (default: every hour). Its goal is to build a continuously growing timeline that links real-world news events to observed price movements — not predictions, but verified historical correlations anchored to actual OHLCV data.

**How it works:**

```
1. Ingest context
   └── Watchlist tickers + recent discovery themes + prior report evidence

2. News scan  (scan window = since last run)
   └── GNews · GDELT · The Guardian · Currents API

3. Event matching
   └── Link each headline to one or more watchlist companies via causal reasoning

4. Price validation
   └── Pull historical OHLCV for the matching tickers and window
       (exact prices are never invented — the agent only confirms the ticker
        was trading; post-processing anchors real data to the event)

5. Output correlations
   └── Each result: title · 2-sentence description · evidence items · companies · news events
```

**Design constraints:**
- The agent never invents price numbers — all price data is sourced from FMP or Alpha Vantage historical series
- Descriptions are strictly two sentences to keep the timeline scannable
- Priority is given to P1/P2 watchlist tickers when multiple companies match
- Subagents are spawned per ticker cluster or macro theme to run lookups in parallel

The correlation timeline is one of the three core goals of the project — pairing qualitative news events with quantitative market data to surface the causal links that drive stock movements.

---

## Quick start

### Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 15 running locally (or a remote connection string)
- Git Bash (Windows) or any bash-compatible shell (Mac/Linux)

### Option A — Setup wizard (recommended)

An interactive setup script handles the AI provider, all environment variables, dependency installation, and a connectivity debug check in one go:

```bash
bash setup.sh
```

The wizard will:
1. Ask you to choose an AI provider (OpenAI, Anthropic, Groq, Ollama, or any custom OpenAI-compatible endpoint) and generate a working `deepai.ts` for it
2. Walk through every API key with a description and a direct signup link
3. Run `npm install` in both `backend/` and `frontend/`
4. Run debug checks (TypeScript compile, database, AI provider ping) and show a colored pass/fail summary

> **Note for contributors:** `backend/src/providers/ai/deepai.ts` is gitignored. If that file already exists when you run the wizard, the AI provider step is skipped automatically — your existing implementation is never touched.

### Option B — Manual setup

```bash
# Backend
cd backend
cp .env.example .env          # fill in DATABASE_URL and your AI provider key
npm install
npm run dev

# Frontend (separate terminal)
cd frontend
cp .env.example .env.local    # set NEXT_PUBLIC_WS_URL if backend is not on port 3000
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## AI provider (`deepai.ts`)

The file `backend/src/providers/ai/deepai.ts` is **gitignored** — it contains a proprietary implementation and is not included in this repository.

**The easiest way** to configure your own provider is to run `bash setup.sh`, which generates a complete, working `deepai.ts` for your chosen provider automatically.

If you prefer to set it up manually, a drop-in stub is provided at `backend/src/providers/ai/deepai.boilerplate.ts`:

```bash
cp backend/src/providers/ai/deepai.boilerplate.ts \
   backend/src/providers/ai/deepai.ts
```

Then implement `callDeepAI` and `streamDeepAI` using your preferred LLM provider. The function signatures must remain unchanged — every agent in the codebase calls through these two functions.

**Supported out of the box by `setup.sh`:**

| Provider   | npm package              | Model examples                          |
|------------|--------------------------|-----------------------------------------|
| OpenAI     | `openai`                 | `gpt-4o`, `gpt-4.1`, `o3`, `o4-mini`   |
| Anthropic  | `@anthropic-ai/sdk`      | `claude-opus-4-5`, `claude-sonnet-4-5`  |
| Groq       | `groq-sdk`               | `llama-3.3-70b-versatile`, `mixtral-*`  |
| Ollama     | *(none — uses fetch)*    | `llama3.2`, `mistral`, `gemma3`         |
| Custom     | `openai`                 | any OpenAI-compatible endpoint          |

The model name comes from the `AGENT_MODEL` environment variable (and per-agent overrides like `AGENT_MODEL_CRYPTO_ANALYSIS`).

---

## Environment variables

All variables are documented in [`backend/.env.example`](backend/.env.example) with comments, free-tier signup links, and sensible defaults. Real values are not included in this repository.

At minimum you need:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AGENT_MODEL` | Default model name for AI agents (e.g. `gpt-4o`) |
| `WS_PORT` | Port for the WebSocket server (default `3000`) |

Most data-provider keys (Alpha Vantage, FMP, Finnhub, etc.) have free tiers — links are in the example file.

---

## WebSocket protocol

The backend exposes a single WebSocket endpoint. Each message is a JSON object with the shape:

```json
{ "event": "<event-name>", "data": { ... } }
```

**Client → server events** include `ping`, `subscribe`, `agent:run`, and more.  
**Server → client events** include `pong`, `agent:chunk`, `agent:done`, `discovery:status`, `timeline:update`, and more.

A full protocol reference will be published in the future docs site.

---

## Data providers

The backend aggregates data from multiple sources. Each integration lives under `backend/src/providers/`:

| Provider | Data |
|---|---|
| Alpha Vantage | Equities, technicals, fundamentals |
| FMP | Quotes, financials, news, technicals |
| Polygon / Massive | Market aggregates, snapshots |
| Finnhub | Quotes, candles, news, sentiment |
| CoinGecko | Crypto prices and market data |
| Reddit | Retail sentiment |
| GDELT | Geopolitical events and media tone |
| FRED | U.S. macroeconomic time-series |
| SEC EDGAR | Filings and XBRL financial data |
| The Guardian | International editorial news |
| Currents API | Global news headlines |
| SerpAPI | Google Trends signals |
| USAspending | Federal contracts and grants |
| LDA.gov | Federal lobbying disclosures |

---

## License

Proprietary — all rights reserved.
