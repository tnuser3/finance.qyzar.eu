import cron from 'node-cron';
import { runDiscoveryWorkflow } from './agents/workflows/discovery';
import { runMonitoringWorkflow } from './agents/workflows/monitoring';
import { runWatchlistReviewerWorkflow } from './agents/workflows/watchlist-reviewer';
import { refreshCoinGeckoCache } from './providers/market/coingecko';
import { detectEvents, drainEventQueue } from './domain/events/detector';
import { describeUsMarketSession, isUsMarketWeekday } from './domain/timeline/market-hours';
import { purgeExpiredCache } from './infra/db/cache';
import { runApiHealthCheck } from './providers/health-check';
import { logError } from './infra/db/error-log';

const ENABLED = process.env.SCHEDULER_ENABLED !== 'false';
const CRON_TZ = process.env.SCHEDULER_TIMEZONE ?? 'America/New_York';

const DISCOVERY_CRON = process.env.DISCOVERY_CRON ?? '0 * * * *';
const MONITOR_P1_CRON = process.env.MONITOR_P1_CRON ?? '0 * * * *';
const MONITOR_P2_CRON = process.env.MONITOR_P2_CRON ?? '0 */6 * * *';
const MONITOR_P3_CRON = process.env.MONITOR_P3_CRON ?? '0 5 * * *';
const EVENT_POLL_CRON = process.env.EVENT_POLL_CRON ?? '*/15 * * * *';
const WATCHLIST_REVIEWER_CRON =
  process.env.WATCHLIST_REVIEWER_CRON ?? '0 21 * * 1-5';
const COINGECKO_REFRESH_CRON = process.env.COINGECKO_REFRESH_CRON ?? '*/5 * * * *';
const COINGECKO_REFRESH_ON_STARTUP =
  process.env.COINGECKO_REFRESH_ON_STARTUP !== 'false';
const CACHE_PURGE_CRON = process.env.CACHE_PURGE_CRON ?? '0 3 * * *';
const API_HEALTH_CHECK_CRON = process.env.API_HEALTH_CHECK_CRON ?? '*/5 * * * *';
const API_HEALTH_CHECK_ON_STARTUP = process.env.API_HEALTH_CHECK_ON_STARTUP !== 'false';

function log(msg: string): void {
  console.log(`[scheduler] ${new Date().toISOString()} ${msg}`);
}

export function startScheduler(): void {
  if (!ENABLED) {
    log('disabled (SCHEDULER_ENABLED=false)');
    return;
  }

  cron.schedule(DISCOVERY_CRON, async () => {
    log('starting discovery workflow');
    try {
      const result = await runDiscoveryWorkflow({ trigger: 'scheduled' });
      log(`discovery complete: ${result.companiesAdded} companies added`);
    } catch (error) {
      logError(error, { source: 'scheduler.ts - discovery' });
      log(`discovery failed: ${error instanceof Error ? error.message : error}`);
    }
  });

  cron.schedule(MONITOR_P1_CRON, async () => {
    log('starting P1 monitoring');
    try {
      const result = await runMonitoringWorkflow({ priority: 1, trigger: 'scheduled' });
      log(`P1 monitoring: ${result.companiesScanned} scanned, ${result.reportsSaved} reports`);
    } catch (error) {
      logError(error, { source: 'scheduler.ts - monitorP1' });
      log(`P1 monitoring failed: ${error instanceof Error ? error.message : error}`);
    }
  });

  cron.schedule(MONITOR_P2_CRON, async () => {
    log('starting P2 monitoring');
    try {
      const result = await runMonitoringWorkflow({ priority: 2, trigger: 'scheduled' });
      log(`P2 monitoring: ${result.companiesScanned} scanned`);
    } catch (error) {
      logError(error, { source: 'scheduler.ts - monitorP2' });
      log(`P2 monitoring failed: ${error instanceof Error ? error.message : error}`);
    }
  });

  cron.schedule(MONITOR_P3_CRON, async () => {
    log('starting P3 monitoring');
    try {
      const result = await runMonitoringWorkflow({ priority: 3, trigger: 'scheduled' });
      log(`P3 monitoring: ${result.companiesScanned} scanned`);
    } catch (error) {
      logError(error, { source: 'scheduler.ts - monitorP3' });
      log(`P3 monitoring failed: ${error instanceof Error ? error.message : error}`);
    }
  });

  cron.schedule(EVENT_POLL_CRON, async () => {
    log('polling events');
    try {
      const detected = await detectEvents();
      const processed = await drainEventQueue();
      log(`events: ${detected} detected, ${processed} processed`);
    } catch (error) {
      logError(error, { source: 'scheduler.ts - eventPoll' });
      log(`event poll failed: ${error instanceof Error ? error.message : error}`);
    }
  });

  cron.schedule(WATCHLIST_REVIEWER_CRON, async () => {
    if (!isUsMarketWeekday()) {
      log(`skipping watchlist reviewer — ${describeUsMarketSession()}`);
      return;
    }

    log('starting watchlist reviewer workflow');
    try {
      const result = await runWatchlistReviewerWorkflow({ trigger: 'scheduled' });
      log(
        `watchlist reviewer: ${result.reviewsSaved} reviews, ${result.correlationsSaved} correlations for ${result.tradingDay}`
      );
    } catch (error) {
      logError(error, { source: 'scheduler.ts - watchlistReviewer' });
      log(`watchlist reviewer failed: ${error instanceof Error ? error.message : error}`);
    }
  }, { timezone: CRON_TZ });

  cron.schedule(COINGECKO_REFRESH_CRON, async () => {
    log('refreshing CoinGecko cache');
    try {
      const result = await refreshCoinGeckoCache();
      log(
        `CoinGecko cache: ${result.tickerCount} ticker quotes, ${result.chartsSucceeded}/${result.chartsAttempted} charts warmed`
      );
    } catch (error) {
      logError(error, { source: 'scheduler.ts - coingeckoRefresh' });
      log(`CoinGecko refresh failed: ${error instanceof Error ? error.message : error}`);
    }
  });

  cron.schedule(CACHE_PURGE_CRON, async () => {
    log('purging expired cache rows');
    try {
      const removed = await purgeExpiredCache();
      log(`cache purge: removed ${removed} expired rows`);
    } catch (error) {
      logError(error, { source: 'scheduler.ts - cachePurge' });
      log(`cache purge failed: ${error instanceof Error ? error.message : error}`);
    }
  });

  cron.schedule(API_HEALTH_CHECK_CRON, async () => {
    log('API health check');
    try {
      const result = await runApiHealthCheck({ broadcast: true });
      const ready = result.providers.length;
      const probed = result.probes.length;
      const failed = result.probes.filter((probe) => !probe.ok).length;
      log(`API health: ${ready} operational, ${probed} probed, ${failed} probe failures`);
    } catch (error) {
      logError(error, { source: 'scheduler.ts - apiHealthCheck' });
      log(`API health check failed: ${error instanceof Error ? error.message : error}`);
    }
  });

  if (API_HEALTH_CHECK_ON_STARTUP) {
    void runApiHealthCheck({ broadcast: true })
      .then((result) => {
        log(`API startup health: ${result.providers.length} operational platforms`);
      })
      .catch((error) => {
        logError(error, { source: 'scheduler.ts - apiStartupHealth' });
        log(`API startup health failed: ${error instanceof Error ? error.message : error}`);
      });
  }

  if (COINGECKO_REFRESH_ON_STARTUP) {
    void refreshCoinGeckoCache()
      .then((result) => {
        log(
          `CoinGecko startup warm: ${result.tickerCount} ticker quotes, ${result.chartsSucceeded}/${result.chartsAttempted} charts`
        );
      })
      .catch((error) => {
        logError(error, { source: 'scheduler.ts - coingeckoStartupWarm' });
        log(`CoinGecko startup warm failed: ${error instanceof Error ? error.message : error}`);
      });
  }

  log('started');
  log(`discovery: ${DISCOVERY_CRON}`);
  log(`monitor P1: ${MONITOR_P1_CRON}, P2: ${MONITOR_P2_CRON}, P3: ${MONITOR_P3_CRON}`);
  log(`events: ${EVENT_POLL_CRON}`);
  log(`watchlist reviewer: ${WATCHLIST_REVIEWER_CRON} (${CRON_TZ})`);
  log(`coingecko refresh: ${COINGECKO_REFRESH_CRON}`);
  log(`cache purge: ${CACHE_PURGE_CRON}`);
  log(`api health check: ${API_HEALTH_CHECK_CRON}`);
}
