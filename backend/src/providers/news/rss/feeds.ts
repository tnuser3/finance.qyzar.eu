export type FeedTier = 1 | 2 | 3;
export type FeedRegion =
  | 'us'
  | 'international_central_banks'
  | 'international_regulators'
  | 'politics'
  | 'economic';

export interface RssFeedDefinition {
  id: string;
  name: string;
  source: string;
  url: string;
  tier: FeedTier;
  region: FeedRegion;
  tags: string[];
}

export const RSS_FEEDS: RssFeedDefinition[] = [

  { id: 'sec_press', name: 'SEC Press Releases', source: 'sec', url: 'https://www.sec.gov/news/pressreleases.rss', tier: 1, region: 'us', tags: ['sec', 'regulation', 'enforcement'] },
  { id: 'sec_litigation', name: 'SEC Litigation Releases', source: 'sec', url: 'https://www.sec.gov/enforcement-litigation/litigation-releases/rss', tier: 1, region: 'us', tags: ['sec', 'litigation'] },
  { id: 'sec_admin_proceedings', name: 'SEC Administrative Proceedings', source: 'sec', url: 'https://www.sec.gov/enforcement-litigation/administrative-proceedings/rss', tier: 1, region: 'us', tags: ['sec', 'enforcement'] },
  { id: 'sec_trading_suspensions', name: 'SEC Trading Suspensions', source: 'sec', url: 'https://www.sec.gov/enforcement-litigation/trading-suspensions/rss', tier: 1, region: 'us', tags: ['sec', 'trading'] },
  { id: 'ftc_press', name: 'FTC Press Releases', source: 'ftc', url: 'https://www.ftc.gov/feeds/press-release.xml', tier: 1, region: 'us', tags: ['ftc', 'antitrust', 'consumer'] },
  { id: 'ftc_competition', name: 'FTC Competition Releases', source: 'ftc', url: 'https://www.ftc.gov/feeds/press-release-competition.xml', tier: 1, region: 'us', tags: ['ftc', 'antitrust', 'merger'] },
  { id: 'ftc_consumer', name: 'FTC Consumer Protection', source: 'ftc', url: 'https://www.ftc.gov/feeds/press-release-consumer-protection.xml', tier: 1, region: 'us', tags: ['ftc', 'consumer'] },
  { id: 'ftc_hsr', name: 'FTC HSR Early Termination', source: 'ftc', url: 'https://www.ftc.gov/feeds/hsr-early-termination-notices.xml', tier: 1, region: 'us', tags: ['ftc', 'merger', 'hsr'] },
  { id: 'doj_news', name: 'DOJ News', source: 'doj', url: 'https://www.justice.gov/news/rss?m=1', tier: 1, region: 'us', tags: ['doj', 'justice', 'enforcement'] },
  { id: 'doj_atr', name: 'DOJ Antitrust Division', source: 'doj', url: 'https://www.justice.gov/feeds/opa/atr.xml', tier: 1, region: 'us', tags: ['doj', 'antitrust'] },
  { id: 'fed_press', name: 'Federal Reserve Press Releases', source: 'federal_reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml', tier: 1, region: 'us', tags: ['fed', 'rates', 'monetary'] },
  { id: 'cftc_press', name: 'CFTC Press Releases', source: 'cftc', url: 'https://www.cftc.gov/RSS/RSSGP/rssgp.xml', tier: 1, region: 'us', tags: ['cftc', 'derivatives', 'commodities'] },
  { id: 'cftc_enforcement', name: 'CFTC Enforcement', source: 'cftc', url: 'https://www.cftc.gov/RSS/RSSENF/rssenf.xml', tier: 1, region: 'us', tags: ['cftc', 'enforcement'] },
  { id: 'cftc_public', name: 'CFTC Public Documents', source: 'cftc', url: 'https://www.cftc.gov/RSS/RSSPDF/rssPDF.xml', tier: 1, region: 'us', tags: ['cftc', 'regulation'] },
  { id: 'treasury_press', name: 'US Treasury Press Releases', source: 'treasury', url: 'https://home.treasury.gov/news/press-releases/feed', tier: 1, region: 'us', tags: ['treasury', 'fiscal', 'debt'] },
  { id: 'bls_feed', name: 'Bureau of Labor Statistics', source: 'bls', url: 'https://www.bls.gov/feed', tier: 1, region: 'economic', tags: ['bls', 'employment', 'cpi', 'inflation'] },
  { id: 'eia_feed', name: 'Energy Information Administration', source: 'eia', url: 'https://www.eia.gov/rss/todayinenergy.xml', tier: 1, region: 'economic', tags: ['eia', 'energy', 'oil', 'gas'] },
  { id: 'bea_feed', name: 'Bureau of Economic Analysis', source: 'bea', url: 'https://www.bea.gov/rss.xml', tier: 1, region: 'economic', tags: ['bea', 'gdp', 'economic'] },


  { id: 'fda_press', name: 'FDA Press Announcements', source: 'fda', url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml', tier: 2, region: 'us', tags: ['fda', 'health', 'pharma'] },
  { id: 'fda_medwatch', name: 'FDA MedWatch', source: 'fda', url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml', tier: 2, region: 'us', tags: ['fda', 'safety', 'recall'] },
  { id: 'fcc_news', name: 'FCC News', source: 'fcc', url: 'https://docs.fcc.gov/rss/fcc.xml', tier: 2, region: 'us', tags: ['fcc', 'telecom', 'media'] },
  { id: 'cfpb_news', name: 'CFPB Newsroom', source: 'cfpb', url: 'https://www.consumerfinance.gov/about-us/newsroom/feed/', tier: 2, region: 'us', tags: ['cfpb', 'consumer', 'finance'] },
  { id: 'fdic_press', name: 'FDIC Press Releases', source: 'fdic', url: 'https://www.fdic.gov/news/press-releases/rss.xml', tier: 2, region: 'us', tags: ['fdic', 'banking'] },
  { id: 'occ_news', name: 'OCC News', source: 'occ', url: 'https://www.occ.treas.gov/rss/rss.xml', tier: 2, region: 'us', tags: ['occ', 'banking'] },
  { id: 'hhs_press', name: 'HHS Press Releases', source: 'hhs', url: 'https://www.hhs.gov/rss/press-room/press-releases.xml', tier: 2, region: 'us', tags: ['hhs', 'health'] },
  { id: 'usda_feed', name: 'USDA News', source: 'usda', url: 'https://www.usda.gov/rss/latest-releases.xml', tier: 2, region: 'us', tags: ['usda', 'agriculture', 'food'] },


  { id: 'epa_news', name: 'EPA News Releases', source: 'epa', url: 'https://www.epa.gov/newsreleases/search/rss', tier: 3, region: 'us', tags: ['epa', 'environment'] },
  { id: 'dol_releases', name: 'Department of Labor Releases', source: 'dol', url: 'https://www.dol.gov/rss/releases.xml', tier: 3, region: 'us', tags: ['dol', 'labor', 'employment'] },
  { id: 'nlrb_press', name: 'NLRB Press Releases', source: 'nlrb', url: 'https://www.nlrb.gov/rss/rssPressReleases.xml', tier: 3, region: 'us', tags: ['nlrb', 'labor', 'unions'] },
  { id: 'nlrb_weekly', name: 'NLRB Weekly Summaries', source: 'nlrb', url: 'https://www.nlrb.gov/rss/rssWeeklySummaries.xml', tier: 3, region: 'us', tags: ['nlrb', 'labor'] },
  { id: 'nlrb_announcements', name: 'NLRB Announcements', source: 'nlrb', url: 'https://www.nlrb.gov/rss/rssAnnouncements.xml', tier: 3, region: 'us', tags: ['nlrb'] },
  { id: 'sba_feed', name: 'SBA News', source: 'sba', url: 'https://www.sba.gov/rss', tier: 3, region: 'us', tags: ['sba', 'small_business'] },
  { id: 'census_news', name: 'Census Bureau News', source: 'census', url: 'https://www.census.gov/newsroom/rss.xml', tier: 3, region: 'economic', tags: ['census', 'demographics'] },
  { id: 'irs_news', name: 'IRS Newsroom', source: 'irs', url: 'https://www.irs.gov/newsroom/rss', tier: 3, region: 'us', tags: ['irs', 'tax'] },
  { id: 'ferc_news', name: 'FERC News', source: 'ferc', url: 'https://www.ferc.gov/news-events/news/rss', tier: 3, region: 'us', tags: ['ferc', 'energy'] },


  { id: 'ecb_press', name: 'European Central Bank', source: 'ecb', url: 'https://www.ecb.europa.eu/rss/press.html', tier: 1, region: 'international_central_banks', tags: ['ecb', 'europe', 'rates'] },
  { id: 'boe_news', name: 'Bank of England', source: 'boe', url: 'https://www.bankofengland.co.uk/rss/news', tier: 1, region: 'international_central_banks', tags: ['boe', 'uk', 'rates'] },
  { id: 'boj_news', name: 'Bank of Japan', source: 'boj', url: 'https://www.boj.or.jp/en/rss/index.xml', tier: 1, region: 'international_central_banks', tags: ['boj', 'japan', 'rates'] },
  { id: 'pbc_news', name: "People's Bank of China", source: 'pbc', url: 'http://www.pbc.gov.cn/english/rss.xml', tier: 1, region: 'international_central_banks', tags: ['pbc', 'china', 'rates'] },
  { id: 'rba_news', name: 'Reserve Bank of Australia', source: 'rba', url: 'https://www.rba.gov.au/rss/rss-cb.xml', tier: 1, region: 'international_central_banks', tags: ['rba', 'australia', 'rates'] },
  { id: 'boc_news', name: 'Bank of Canada', source: 'boc', url: 'https://www.bankofcanada.ca/feed/', tier: 1, region: 'international_central_banks', tags: ['boc', 'canada', 'rates'] },
  { id: 'snb_news', name: 'Swiss National Bank', source: 'snb', url: 'https://www.snb.ch/en/rss', tier: 1, region: 'international_central_banks', tags: ['snb', 'switzerland', 'rates'] },


  { id: 'fca_news', name: 'UK FCA News', source: 'fca', url: 'https://www.fca.org.uk/news/rss.xml', tier: 1, region: 'international_regulators', tags: ['fca', 'uk', 'regulation'] },
  { id: 'cma_cases', name: 'UK CMA Cases', source: 'cma', url: 'https://www.gov.uk/cma-cases.atom', tier: 1, region: 'international_regulators', tags: ['cma', 'uk', 'antitrust'] },
  { id: 'eu_council', name: 'European Council Press', source: 'eu_council', url: 'https://www.consilium.europa.eu/en/rss/pressreleases.ashx', tier: 1, region: 'international_regulators', tags: ['eu', 'policy'] },
  { id: 'eu_commission', name: 'European Commission Press', source: 'eu_commission', url: 'https://ec.europa.eu/commission/presscorner/api/rss', tier: 1, region: 'international_regulators', tags: ['eu', 'commission', 'regulation'] },
  { id: 'esma_news', name: 'ESMA News', source: 'esma', url: 'https://www.esma.europa.eu/rss.xml', tier: 1, region: 'international_regulators', tags: ['esma', 'eu', 'securities'] },
  { id: 'eba_news', name: 'EBA News', source: 'eba', url: 'https://www.eba.europa.eu/rss.xml', tier: 1, region: 'international_regulators', tags: ['eba', 'eu', 'banking'] },


  { id: 'white_house', name: 'White House Briefing Room', source: 'white_house', url: 'https://www.whitehouse.gov/briefing-room/feed/', tier: 1, region: 'politics', tags: ['white_house', 'policy', 'us'] },
  { id: 'state_dept', name: 'US State Department', source: 'state_dept', url: 'https://www.state.gov/feed/', tier: 1, region: 'politics', tags: ['state', 'foreign_policy', 'diplomacy'] },
  { id: 'nato_news', name: 'NATO News', source: 'nato', url: 'https://www.nato.int/rss', tier: 1, region: 'politics', tags: ['nato', 'defense', 'geopolitics'] },
  { id: 'un_news', name: 'United Nations News', source: 'un', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', tier: 1, region: 'politics', tags: ['un', 'geopolitics'] },
  { id: 'europarl', name: 'European Parliament', source: 'europarl', url: 'https://www.europarl.europa.eu/rss/en.xml', tier: 1, region: 'politics', tags: ['eu', 'parliament'] },
  { id: 'uk_parliament', name: 'UK Parliament', source: 'uk_parliament', url: 'https://www.parliament.uk/rssfeeds/', tier: 2, region: 'politics', tags: ['uk', 'parliament'] },
  { id: 'congress', name: 'US Congress', source: 'congress', url: 'https://www.congress.gov/rss/bill-status/118.xml', tier: 1, region: 'politics', tags: ['congress', 'legislation', 'us'] },
];

export function getFeedById(id: string): RssFeedDefinition | undefined {
  return RSS_FEEDS.find((feed) => feed.id === id);
}

export function listFeeds(filters?: {
  tier?: FeedTier;
  region?: FeedRegion;
  source?: string;
  query?: string;
}): RssFeedDefinition[] {
  let feeds = [...RSS_FEEDS];

  if (filters?.tier) {
    feeds = feeds.filter((feed) => feed.tier === filters.tier);
  }

  if (filters?.region) {
    feeds = feeds.filter((feed) => feed.region === filters.region);
  }

  if (filters?.source) {
    const source = filters.source.toLowerCase();
    feeds = feeds.filter((feed) => feed.source === source);
  }

  if (filters?.query) {
    const query = filters.query.toLowerCase();
    feeds = feeds.filter(
      (feed) =>
        feed.name.toLowerCase().includes(query) ||
        feed.source.includes(query) ||
        feed.tags.some((tag) => tag.includes(query))
    );
  }

  return feeds;
}
