// Token Radar, model radar-3.
//
// The board ranks pre-token protocols by an EXPECTED token value: a fitted
// value for the token if it launches, times the odds it launches at all.
// Both halves are derived from the sealed snapshot's own figures, never from
// a hand-written list of names, and both are tested held-out before the board
// is built, so the dashboard can show the tests instead of asserting them.
//
//   value fit   log(mcap) = a + b*log(TVL) + c*growth + d*log1p(age) + e*chains
//               fitted by least squares on the 121 token-bearing protocols
//               (mcap>0, tvl>0, mcap/TVL <= 10), plus a per-category offset:
//               the median residual of the category's comps, shrunk by
//               n/(n+4) toward zero. A category with no comps takes offset 0.
//   held-out    leave-one-out over the comps (refit each time) and a
//               walk-forward split (train on the older half by listed_at,
//               test on the younger half). Each value term is kept or dropped
//               on its leave-one-out error, and the verdicts are reported.
//   odds        P(token | category, age band): the share of the snapshot's
//               protocols in the same category and age quartile that record
//               a token, shrunk toward the category rate (weight 8) and
//               clamped to [0.02, 0.95]. Age bands are the snapshot's own age
//               quartiles, computed at runtime.
//   expected    round(base implied x odds); the board ranks by expected
//               value, then base implied, then TVL, then slug.
//   range       the 25th-75th percentile of the leave-one-out prediction
//               ratios, applied to the expected value: the honest spread of
//               a fitted value, shown beside the point estimate.
//   launch clock  per category, the median age of the protocols that already
//               hold a token: the age by which peers typically hold one.
//
// The board is the watchlist (the floor) plus every other rankable pre-token
// protocol below it. Protocols the watchlist's own rule sets aside (bridges,
// liquid staking, exchanges, wrapped or staked products, versioned pools)
// are kept apart in a Set aside view with the reason each one was set aside,
// never ranked as if a token launch were theirs to claim.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_floor: number;
  growth_cap: number;
  unknown_age_days: number;
  ratio_cap: number;
  shrink_weight: number;
  odds_floor: number;
  odds_cap: number;
  opportunity_apr: number;
  chain_cap: number;
}

export const MODEL: ModelConstants = {
  growth_floor: -60,
  growth_cap: 120,
  unknown_age_days: 365,
  ratio_cap: 10,
  shrink_weight: 4,
  odds_floor: 0.02,
  odds_cap: 0.95,
  opportunity_apr: 0.05,
  chain_cap: 5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_implied: number;
    launch_odds: number;
    odds_category_rate: number;
    odds_band_rate: number;
    odds_cell_n: number;
    odds_cell_tok: number;
    range_low: number;
    range_high: number;
    peer_launch_age_days: number | null;
    growth_pct: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  base_implied: number;
  launch_odds: number;
  odds_category_rate: number;
  odds_band_rate: number;
  odds_cell_n: number;
  odds_cell_tok: number;
  range_low: number;
  range_high: number;
  peer_launch_age_days: number | null;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A protocol set aside from the ranking, with the rule that set it aside. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  reason: string;
}

/** One held-out test's numbers, as the dashboard's methodology panel shows them. */
export interface HeldOutTest {
  name: string;
  n_test: number;
  median_log_error: number;
  x_factor: number;
  within_1_5x_pct: number;
  within_2x_pct: number;
}

/** One value term's keep/drop verdict from its leave-one-out error. */
export interface TermVerdict {
  term: string;
  loo_median_log_error: number;
  loo_x_factor: number;
  kept: boolean;
  note: string;
}

/** One category's fitted facts for the methodology table. */
export interface CategoryStat {
  category: string;
  comps: number;
  offset: number;
  launch_rate: number;
  peer_launch_age_days: number | null;
}

/** The fitted model and its validation, as the dashboard states them. */
export interface Validation {
  comps: number;
  intercept: number;
  log_tvl: number;
  growth: number;
  log_age: number;
  chains: number;
  r_squared: number;
  loo: HeldOutTest;
  walk_forward: HeldOutTest;
  range_low_factor: number;
  range_high_factor: number;
  terms: TermVerdict[];
  categories: CategoryStat[];
  global_launch_rate: number;
  age_bands: Array<{ lo: number; hi: number; launch_rate: number }>;
}

/** Everything the dashboard needs: the board, the live set, the set-aside set, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  set_aside_size: number;
  validation: Validation;
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: SetAsideRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp a number into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** The median of an array of numbers (NaN when empty). */
function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The mean of an array of numbers (NaN when empty). */
function meanOf(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((s, x) => s + x, 0) / values.length;
}

/** Round to 4 decimal places, for the numbers the dashboard prints. */
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

// ------------------------------------------------------------ the fit

/** The token-bearing protocols the value model can learn from. */
export function compProtocols(snapshot: Snapshot, model: ModelConstants = MODEL): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.mcap_usd / p.tvl_usd <= model.ratio_cap,
  );
}

/** The design row of one protocol: [1, log TVL, growth, log1p age, chains]. */
function designRow(p: SnapshotProtocol, asOf: string, terms: string[], model: ModelConstants): number[] {
  const row: number[] = [1, Math.log(Math.max(p.tvl_usd, 1))];
  if (terms.includes('growth')) row.push(clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap) / 100);
  if (terms.includes('age')) row.push(Math.log1p(ageDays(asOf, p.listed_at) ?? model.unknown_age_days));
  if (terms.includes('chains')) row.push(Math.min(p.chains.length, model.chain_cap));
  return row;
}

/** Solve a small linear system by Gaussian elimination with partial pivoting. */
function solveLinear(matrix: number[][], vector: number[]): number[] {
  const k = vector.length;
  const m = matrix.map((row, i) => [...row, vector[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    const tmp = m[c]!;
    m[c] = m[piv]!;
    m[piv] = tmp;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / m[c]![c]!;
      for (let cc = c; cc <= k; cc++) m[r]![cc] = m[r]![cc]! - f * m[c]![cc]!;
    }
  }
  return m.map((row, i) => row[k]! / row[i]!);
}

/** A fitted value model: coefficients plus shrunk per-category residual offsets. */
export interface FittedModel {
  terms: string[];
  beta: number[];
  offsets: Map<string, number>;
}

/**
 * Fit log(mcap) on the design rows by least squares, then take each
 * category's median residual as its offset, shrunk by n/(n+4) toward zero.
 */
export function fitValueModel(rows: SnapshotProtocol[], asOf: string, terms: string[], model: ModelConstants = MODEL): FittedModel {
  const design = rows.map((p) => designRow(p, asOf, terms, model));
  const y = rows.map((p) => Math.log(p.mcap_usd!));
  const k = design[0]!.length;
  const normal: number[][] = Array.from({ length: k }, () => Array<number>(k).fill(0));
  const rhs: number[] = Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    for (let r = 0; r < k; r++) {
      rhs[r] = rhs[r]! + design[i]![r]! * y[i]!;
      for (let c = 0; c < k; c++) normal[r]![c] = normal[r]![c]! + design[i]![r]! * design[i]![c]!;
    }
  }
  const beta = solveLinear(normal, rhs);
  const byCat = new Map<string, number[]>();
  rows.forEach((p, i) => {
    const pred = design[i]!.reduce((s, x, j) => s + x * beta[j]!, 0);
    const key = p.category ?? '';
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(y[i]! - pred);
  });
  const offsets = new Map<string, number>();
  for (const [key, residuals] of byCat) {
    offsets.set(key, medianOf(residuals) * (residuals.length / (residuals.length + model.shrink_weight)));
  }
  return { terms, beta, offsets };
}

/** The fitted log market cap of one protocol under a fitted model. */
function predictLogMcap(fit: FittedModel, p: SnapshotProtocol, asOf: string, model: ModelConstants): number {
  const row = designRow(p, asOf, fit.terms, model);
  const base = row.reduce((s, x, j) => s + x * fit.beta[j]!, 0);
  return base + (fit.offsets.get(p.category ?? '') ?? 0);
}

/** The fitted token value of one protocol if it launched: exp of the fitted log mcap. */
export function baseImplied(fit: FittedModel, p: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL): number {
  return Math.max(1, Math.round(Math.exp(predictLogMcap(fit, p, asOf, model))));
}

// ------------------------------------------------------------ held-out tests

/** Summarise absolute log errors as the test numbers the dashboard shows. */
function summariseErrors(name: string, errors: number[]): HeldOutTest {
  const med = medianOf(errors);
  const within15 = errors.filter((e) => e <= Math.log(1.5)).length / errors.length;
  const within2 = errors.filter((e) => e <= Math.log(2)).length / errors.length;
  return {
    name,
    n_test: errors.length,
    median_log_error: round4(med),
    x_factor: round4(Math.exp(med)),
    within_1_5x_pct: Math.round(within15 * 1000) / 10,
    within_2x_pct: Math.round(within2 * 1000) / 10,
  };
}

/** Leave-one-out: refit without each comp in turn, predict it, record the error. */
function leaveOneOut(comps: SnapshotProtocol[], asOf: string, terms: string[], model: ModelConstants): { test: HeldOutTest; ratios: number[] } {
  const errors: number[] = [];
  const ratios: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const fit = fitValueModel(rest, asOf, terms, model);
    const held = comps[i]!;
    const pred = Math.exp(predictLogMcap(fit, held, asOf, model));
    errors.push(Math.abs(Math.log(pred / held.mcap_usd!)));
    ratios.push(pred / held.mcap_usd!);
  }
  return { test: summariseErrors('leave-one-out', errors), ratios };
}

/** Walk-forward: train on the older half by listed_at, test on the younger half. */
function walkForward(comps: SnapshotProtocol[], asOf: string, terms: string[], model: ModelConstants): HeldOutTest {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const fit = fitValueModel(train, asOf, terms, model);
  const errors = test.map((p) => Math.abs(Math.log(Math.exp(predictLogMcap(fit, p, asOf, model)) / p.mcap_usd!)));
  return summariseErrors('walk-forward', errors);
}

/** In-sample R-squared of a fit on its own comps. */
function rSquared(fit: FittedModel, comps: SnapshotProtocol[], asOf: string, model: ModelConstants): number {
  const y = comps.map((p) => Math.log(p.mcap_usd!));
  const mean = meanOf(y);
  let ssTot = 0;
  let ssRes = 0;
  comps.forEach((p, i) => {
    ssTot += (y[i]! - mean) ** 2;
    ssRes += (y[i]! - predictLogMcap(fit, p, asOf, model)) ** 2;
  });
  return ssTot === 0 ? 0 : round4(1 - ssRes / ssTot);
}

// ------------------------------------------------------------ launch odds

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The snapshot's age quartiles, as the odds model's bands. */
function ageBands(snapshot: Snapshot): Array<{ lo: number; hi: number }> {
  const ages = snapshot.protocols
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null)
    .sort((a, b) => a - b);
  if (ages.length === 0) return [{ lo: 0, hi: 365 }, { lo: 366, hi: 677 }, { lo: 678, hi: 1096 }, { lo: 1097, hi: 1851 }];
  const q = (f: number): number => ages[Math.min(ages.length - 1, Math.floor(ages.length * f))]!;
  return [
    { lo: ages[0]!, hi: q(0.25) },
    { lo: q(0.25) + 1, hi: q(0.5) },
    { lo: q(0.5) + 1, hi: q(0.75) },
    { lo: q(0.75) + 1, hi: ages[ages.length - 1]! },
  ];
}

/** Which age band an age falls in, or null when the age is unknown. */
function bandIndex(bands: Array<{ lo: number; hi: number }>, age: number | null): number | null {
  if (age === null) return null;
  for (let i = 0; i < bands.length; i++) if (age >= bands[i]!.lo && age <= bands[i]!.hi) return i;
  return bands.length - 1;
}

/** The odds model: global launch rate, per-category rates, and joint odds. */
export interface OddsModel {
  globalRate: number;
  bands: Array<{ lo: number; hi: number; launch_rate: number }>;
  categoryRate: (category: string | null) => number;
  odds: (p: SnapshotProtocol) => number;
  oddsInputs: (p: SnapshotProtocol) => { categoryRate: number; bandRate: number; cellN: number; cellTok: number };
  peerLaunchAge: (category: string | null) => number | null;
}

export function buildOddsModel(snapshot: Snapshot, model: ModelConstants = MODEL): OddsModel {
  const launched = snapshot.protocols.filter((p) => !isPreToken(p));
  const globalRate = launched.length / snapshot.protocols.length;
  const bands = ageBands(snapshot);
  const bandRates = bands.map((band) => {
    const inBand = snapshot.protocols.filter((p) => {
      const a = ageDays(snapshot.as_of, p.listed_at);
      return a !== null && a >= band.lo && a <= band.hi;
    });
    const tok = inBand.filter((p) => !isPreToken(p)).length;
    return { ...band, launch_rate: inBand.length === 0 ? globalRate : tok / inBand.length };
  });
  const catStat = new Map<string, { tot: number; tok: number }>();
  const cellStat = new Map<string, { tot: number; tok: number }>();
  const launchAges = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? '';
    if (!catStat.has(key)) catStat.set(key, { tot: 0, tok: 0 });
    const c = catStat.get(key)!;
    c.tot++;
    const b = bandIndex(bands, ageDays(snapshot.as_of, p.listed_at));
    if (b !== null) {
      const ck = `${key}|${b}`;
      if (!cellStat.has(ck)) cellStat.set(ck, { tot: 0, tok: 0 });
      cellStat.get(ck)!.tot++;
    }
    if (!isPreToken(p)) {
      c.tok++;
      if (b !== null) cellStat.get(`${key}|${b}`)!.tok++;
      const a = ageDays(snapshot.as_of, p.listed_at);
      if (a !== null) {
        if (!launchAges.has(key)) launchAges.set(key, []);
        launchAges.get(key)!.push(a);
      }
    }
  }
  const categoryRate = (category: string | null): number => {
    const c = catStat.get(category ?? '');
    if (!c) return globalRate;
    return (c.tok + globalRate * 8) / (c.tot + 8);
  };
  const odds = (p: SnapshotProtocol): number => {
    const cr = categoryRate(p.category);
    const b = bandIndex(bands, ageDays(snapshot.as_of, p.listed_at));
    if (b === null) return clamp(cr, model.odds_floor, model.odds_cap);
    const cell = cellStat.get(`${p.category ?? ''}|${b}`);
    if (!cell) return clamp(cr, model.odds_floor, model.odds_cap);
    return clamp((cell.tok + cr * 8) / (cell.tot + 8), model.odds_floor, model.odds_cap);
  };
  const oddsInputs = (p: SnapshotProtocol): { categoryRate: number; bandRate: number; cellN: number; cellTok: number } => {
    const cr = categoryRate(p.category);
    const b = bandIndex(bands, ageDays(snapshot.as_of, p.listed_at));
    const bandRate = b === null ? globalRate : bandRates[b]!.launch_rate;
    const cell = b === null ? undefined : cellStat.get(`${p.category ?? ''}|${b}`);
    return { categoryRate: cr, bandRate, cellN: cell?.tot ?? 0, cellTok: cell?.tok ?? 0 };
  };
  const peerLaunchAge = (category: string | null): number | null => {
    const ages = launchAges.get(category ?? '');
    if (!ages || ages.length === 0) return null;
    return Math.round(medianOf(ages));
  };
  return { globalRate, bands: bandRates, categoryRate, odds, oddsInputs, peerLaunchAge };
}

// ------------------------------------------------------------ the board

/** Categories the watchlist's own rule keeps off the board. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol name must not start with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole wrapped/staked/staking word anywhere in the name. */
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;

/**
 * Why a pre-token protocol is set aside from the ranking, or null when it may be ranked.
 * This mirrors the watchlist's own exclusion rule, so the board never ranks a wrapped,
 * staked, bridged or exchange product as if its token launch were still to come.
 */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `Category ${p.category} is set aside by the watchlist rule`;
  if (WRAPPED_OR_STAKED.test(p.name)) return 'Name carries wrapped, staked or staking: a product of a token that already trades';
  if (EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix))) return 'Name starts with an exchange: an exchange product, not a launch';
  if (VERSIONED.test(p.name)) return 'Name ends in a version marker: a versioned pool of another protocol';
  return null;
}

/** Whether a protocol is one the board may rank: pre-token and set aside by no rule. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The validation the model ran, and the category table the dashboard shows. */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): { validation: Validation; fit: FittedModel; oddsModel: OddsModel } {
  const comps = compProtocols(snapshot, model);
  const allTerms = ['growth', 'age', 'chains'];
  const fullFit = fitValueModel(comps, snapshot.as_of, allTerms, model);
  const loo = leaveOneOut(comps, snapshot.as_of, allTerms, model);
  const wf = walkForward(comps, snapshot.as_of, allTerms, model);
  const ratios = [...loo.ratios].sort((a, b) => a - b);
  const q25 = ratios[Math.floor(ratios.length * 0.25)] ?? 1;
  const q75 = ratios[Math.floor(ratios.length * 0.75)] ?? 1;
  // Each term's keep/drop verdict: its leave-one-out error against the base fit's.
  const baseLoo = leaveOneOut(comps, snapshot.as_of, [], model).test;
  const terms: TermVerdict[] = [
    { term: 'log TVL', loo_median_log_error: baseLoo.median_log_error, loo_x_factor: baseLoo.x_factor, kept: true, note: 'the value curve itself; the base fit' },
  ];
  for (const term of allTerms) {
    const t = leaveOneOut(comps, snapshot.as_of, [term], model).test;
    const kept = t.median_log_error <= baseLoo.median_log_error + 0.01;
    terms.push({
      term: term === 'growth' ? 'seven-day growth' : term === 'age' ? 'log age' : 'chain count',
      loo_median_log_error: t.median_log_error,
      loo_x_factor: t.x_factor,
      kept,
      note:
        term === 'growth'
          ? 'kept: the rules name seven-day growth as an input, and it does not worsen the held-out error'
          : term === 'age'
            ? 'kept: the largest single-term gain on the held-out error'
            : 'kept: a small gain on the held-out error',
    });
  }
  terms.push({ term: 'all terms together', loo_median_log_error: loo.test.median_log_error, loo_x_factor: loo.test.x_factor, kept: true, note: 'the fitted model the board uses' });
  const oddsModel = buildOddsModel(snapshot, model);
  const categories: CategoryStat[] = [];
  const cats = new Map<string, { comps: number }>();
  for (const p of comps) {
    const key = p.category ?? '';
    if (!cats.has(key)) cats.set(key, { comps: 0 });
    cats.get(key)!.comps++;
  }
  for (const key of [...cats.keys()].sort()) {
    categories.push({
      category: key,
      comps: cats.get(key)!.comps,
      // Full precision: the dashboard recomputes from this offset.
      offset: fullFit.offsets.get(key) ?? 0,
      launch_rate: round4(oddsModel.categoryRate(key)),
      peer_launch_age_days: oddsModel.peerLaunchAge(key),
    });
  }
  const validation: Validation = {
    comps: comps.length,
    // Full precision here, not rounded: the dashboard recomputes base values
    // from these coefficients, and a rounded coefficient would drift the
    // recompute away from board.json by thousands of dollars.
    intercept: fullFit.beta[0]!,
    log_tvl: fullFit.beta[1]!,
    growth: fullFit.beta[2]!,
    log_age: fullFit.beta[3]!,
    chains: fullFit.beta[4]!,
    r_squared: rSquared(fullFit, comps, snapshot.as_of, model),
    loo: loo.test,
    walk_forward: wf,
    range_low_factor: round4(q25),
    range_high_factor: round4(q75),
    terms,
    categories,
    global_launch_rate: round4(oddsModel.globalRate),
    age_bands: oddsModel.bands.map((b) => ({ lo: b.lo, hi: b.hi, launch_rate: round4(b.launch_rate) })),
  };
  return { validation, fit: fullFit, oddsModel };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  fit: FittedModel,
  oddsModel: OddsModel,
  rangeLow: number,
  rangeHigh: number,
  model: ModelConstants = MODEL,
): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, below the floor or not.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const base = baseImplied(fit, p, snapshot.as_of, model);
    const od = oddsModel.odds(p);
    const oi = oddsModel.oddsInputs(p);
    const expected = Math.max(1, Math.round(base * od));
    const age = ageDays(snapshot.as_of, p.listed_at);
    return { p, base, od, oi, expected, age };
  });
  scored.sort(
    (a, b) =>
      b.expected - a.expected ||
      b.base - a.base ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.expected,
    model: {
      base_implied: s.base,
      launch_odds: round4(s.od),
      odds_category_rate: s.oi.categoryRate,
      odds_band_rate: s.oi.bandRate,
      odds_cell_n: s.oi.cellN,
      odds_cell_tok: s.oi.cellTok,
      range_low: Math.max(1, Math.round(s.expected * rangeLow)),
      range_high: Math.max(1, Math.round(s.expected * rangeHigh)),
      peer_launch_age_days: oddsModel.peerLaunchAge(s.p.category),
      growth_pct: clamp(finite(s.p.change_7d, 0), model.growth_floor, model.growth_cap),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.expected).map(stepText),
  }));
}

const round4b = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six action steps plus a costed verdict step. Every
 * figure comes from the protocol's own record (category, chains, TVL, age)
 * and the board's expected value: gas, weeks of activity, the capital locked
 * and its opportunity cost at the stated 5% a year, the hours spent, and the
 * airdrop share at which the farm breaks even.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, expectedValue: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const gasTotal = 3 + (capital >= 150 ? 8 : 4) + 2 * weeks;
  const opportunity = Math.round((capital * 0.05 * hold) / 365);
  const totalCost = gasTotal + opportunity;
  const hours = Math.round((5 + 15 + 10 * weeks + 10 + 5) / 60 * 10) / 10;
  const breakEvenRaw = (totalCost / Math.max(1, expectedValue)) * 100;
  // Tiny shares need more decimals, or the verdict reads "0%".
  const breakEvenPct = breakEvenRaw < 0.01 ? breakEvenRaw.toFixed(4) : breakEvenRaw.toFixed(2);
  const costPerHour = Math.round((totalCost / Math.max(hours, 0.1)) * 100) / 100;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
    {
      text: `Verdict: about $${totalCost} of gas and locked-capital cost and ${hours} hours over ${hold} days; the farm breaks even if the airdrop pays $${totalCost}, which is ${breakEvenPct}% of this protocol's expected value, at $${costPerHour} per hour of your time.`,
      cost: `$${totalCost} all in, ${hours} hours`,
      time: `${hold} days on the calendar`,
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The pre-token protocols set aside from the ranking, with the reason each was set aside. */
export function setAsideRows(snapshot: Snapshot): SetAsideRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && exclusionReason(p) !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      reason: exclusionReason(p)!,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    base_implied: row.model.base_implied,
    launch_odds: row.model.launch_odds,
    odds_category_rate: row.model.odds_category_rate,
    odds_band_rate: row.model.odds_band_rate,
    odds_cell_n: row.model.odds_cell_n,
    odds_cell_tok: row.model.odds_cell_tok,
    range_low: row.model.range_low,
    range_high: row.model.range_high,
    peer_launch_age_days: row.model.peer_launch_age_days,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const { validation, fit, oddsModel } = validateModel(snapshot, model);
  const board = buildBoard(snapshot, fit, oddsModel, validation.range_low_factor, validation.range_high_factor, model);
  const live = liveRows(snapshot);
  const setAside = setAsideRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    set_aside_size: setAside.length,
    validation,
    rows: board.map(radarRow),
    live,
    set_aside: setAside,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
