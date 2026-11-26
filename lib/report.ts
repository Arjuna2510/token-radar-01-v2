// Token Radar, build summary.
//
// One short report printed at the end of a run: what the snapshot held, what
// the fitted model found, who leads the board, and what was written where.
// The summary is a report, never a gate: a run that prints it has already
// passed the board gate and the dossier self-check in main.ts.

import type { BoardRow } from './model.ts';

/** One file the run wrote, with its size and digest. */
export interface WrittenFile {
  name: string;
  bytes: number;
  sha256: string;
}

/** The run's whole summary, as main.ts prints it. */
export interface BuildSummary {
  asOf: string;
  protocols: number;
  watchlist: number;
  boardRows: number;
  earlyRows: number;
  liveRows: number;
  setAsideRows: number;
  comps: number;
  looX: number;
  walkForwardX: number;
  rSquared: number;
  leaders: Array<{ rank: number; slug: string; expected: number; base: number; odds: number }>;
  outputDir: string;
  files: WrittenFile[];
  shots: Array<{ name: string; bytes: number; sha256: string }>;
  dossierBytes: number;
}

/** The board's first `count` rows, as leader lines. */
export function leadersOf(board: BoardRow[], count: number): BuildSummary['leaders'] {
  return board.slice(0, count).map((r) => ({
    rank: r.rank,
    slug: r.slug,
    expected: r.implied_value_usd,
    base: r.model.base_implied,
    odds: r.model.launch_odds,
  }));
}

/** Format a whole number with thousands separators. */
function whole(n: number): string {
  return n.toLocaleString('en-US');
}

/** The summary as the lines main.ts prints. */
export function formatBuildSummary(s: BuildSummary): string {
  const lines: string[] = [];
  lines.push(`token radar radar-3: snapshot ${s.asOf}, ${whole(s.protocols)} protocols, watchlist ${s.watchlist}`);
  lines.push(`board: ${s.boardRows} rows (${s.earlyRows} early, ${s.liveRows} live shown separately, ${s.setAsideRows} set aside)`);
  lines.push(
    `fit: ${s.comps} traded comps, R² ${s.rSquared}, leave-one-out x${s.looX}, walk-forward x${s.walkForwardX}`,
  );
  for (const l of s.leaders) {
    lines.push(`  #${l.rank} ${l.slug}: expected $${whole(l.expected)} (base $${whole(l.base)} x odds ${l.odds})`);
  }
  lines.push(`output: ${s.outputDir} (${s.files.length} files, dossier ${whole(s.dossierBytes)} bytes)`);
  for (const f of s.files) lines.push(`  ${f.name}: ${whole(f.bytes)} bytes, sha256 ${f.sha256.slice(0, 16)}…`);
  for (const shot of s.shots) lines.push(`  ${shot.name}: ${whole(shot.bytes)} bytes`);
  return lines.join('\n');
}
