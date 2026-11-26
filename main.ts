// Token Radar — the entry program (model radar-3).
//
// One run turns the sealed snapshot into the whole entry:
//
//   board.json     the ranked board: every row with its farm plan
//   data.js        the dashboard's dataset, as window.RADAR
//   dashboard/     the page itself: index.html, app.css, app.js
//   screenshots/   the three 1440x900 views the dossier shows first
//   dossier.json   buildDossier's dossier of dashboard/ + screenshots/
//
// The order matters and is kept on purpose. The board is gated before anything
// is written, the screenshots are checked before they are copied, and the
// dossier is built last — then rebuilt once more from what was written, and
// the two copies compared, so a run that prints "done" has proved its own
// dossier is the one buildDossier writes from its own output.
//
// The run is deterministic: the same snapshot in gives the same bytes out.
// No clock, no randomness, no locale-shaped number ever reaches a file, so
// the scorer's two runs land byte for byte on each other. The only thing that
// varies between runs is the directory the files land in.
//
// Usage (from the repository root, or anywhere: the page and the screenshots
// are found beside this file, not beside the working directory):
//
//   node main.ts [--input path/to/snapshot.json] [--output dir]
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// With no flags the snapshot is read from /input/snapshot.json and the entry
// is written to /output, the paths the grading sandbox provides. The model
// itself lives in lib/model.ts; the dossier writer is vendor/makefun-board.ts,
// the scorer's own copy, imported and never edited.

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
} from './lib/model.ts';
import { formatBuildSummary, leadersOf } from './lib/report.ts';
import type { BuildSummary, WrittenFile } from './lib/report.ts';
import { buildDossier } from './vendor/makefun-board.ts';

// ------------------------------------------------------------------ limits

/** The dossier text's cap, in UTF-8 bytes: the scorer's own number. */
const DOSSIER_TEXT_BYTES = 65536;
/** A screenshot past this size is refused, as the gate refuses it. */
const SCREENSHOT_MAX_BYTES = 512 * 1024;
/** A dossier past this size is refused, as the gate refuses it. */
const DOSSIER_MAX_BYTES = Math.floor(1.5 * 1024 * 1024);
/** How many screenshots the entry carries: board, detail, filtered. */
const SCREENSHOT_COUNT = 3;
/** The screenshots' long side, in pixels. */
const SHOT_LONG_SIDE = 1440;
/** The screenshots' short side, in pixels. */
const SHOT_SHORT_SIDE = 900;
/** How many board leaders the summary names. */
const LEADERS_SHOWN = 5;

// ------------------------------------------------------------------ inputs

/** Where the snapshot comes from and where the entry goes. */
interface RunPaths {
  snapshotPath: string;
  outputDir: string;
}

/**
 * The run's paths from its flags and its environment. --input and --output
 * take either `--flag value` or `--flag=value`; the output directory may also
 * come from MAKEFUN_OUTPUT_DIR, which wins over the default but not the flag.
 * With neither, the grading sandbox's /input/snapshot.json and /output apply.
 */
function runPaths(argv: string[], env: NodeJS.ProcessEnv): RunPaths {
  let snapshotPath = '/input/snapshot.json';
  let outputDir = env.MAKEFUN_OUTPUT_DIR ?? '/output';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inline] = arg.split('=', 2);
    const value = inline !== undefined ? inline : argv[i + 1];
    if (flag === '--input' && value !== undefined) {
      snapshotPath = value;
      if (inline === undefined) i++;
    } else if (flag === '--output' && value !== undefined) {
      outputDir = value;
      if (inline === undefined) i++;
    } else if (flag === '--help' || flag === '-h') {
      console.log('usage: node main.ts [--input snapshot.json] [--output dir]');
      process.exit(0);
    } else if (arg.startsWith('--')) {
      throw new Error(`token radar: unknown flag ${arg}`);
    }
  }
  return { snapshotPath: resolve(snapshotPath), outputDir: resolve(outputDir) };
}

/** The directory this file lives in: the page and the screenshots sit beside it. */
function repoDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

// ------------------------------------------------------------------ bytes

/** The sha256 hex of a buffer, for the summary and the self-check. */
function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ------------------------------------------------------------- screenshots

/** A JPEG's pixel size from its first frame header, or null when unreadable. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2;
      continue;
    }
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (length < 2 || at + 2 + length > bytes.length) return null;
    if (marker === 0xc0 || marker === 0xc2) {
      const height = (bytes[at + 5]! << 8) | bytes[at + 6]!;
      const width = (bytes[at + 7]! << 8) | bytes[at + 8]!;
      return { width, height };
    }
    at += 2 + length;
  }
  return null;
}

/** A PNG's pixel size from its IHDR chunk, or null when unreadable. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!magic.every((b, i) => bytes[i] === b)) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return { width, height };
}

/**
 * The screenshots a run may copy: exactly three, each a whole JPEG or PNG
 * within the byte cap, 1440 on the long side and 900 on the short one. Any
 * failure is a loud refusal — a screenshot the gate would reject must never
 * reach the dossier, where it would fail the whole entry instead.
 */
function checkedScreenshots(dir: string): Array<{ name: string; bytes: number; sha256: string }> {
  if (!existsSync(dir)) throw new Error(`token radar: no screenshots/ beside main.ts (${dir})`);
  const names = readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (names.length !== SCREENSHOT_COUNT) {
    throw new Error(`token radar: screenshots/ holds ${names.length} images, not ${SCREENSHOT_COUNT}`);
  }
  return names.map((name) => {
    const path = join(dir, name);
    const bytes = readFileSync(path);
    if (bytes.length > SCREENSHOT_MAX_BYTES) {
      throw new Error(`token radar: screenshots/${name} is ${bytes.length} bytes, over the ${SCREENSHOT_MAX_BYTES} cap`);
    }
    const size = bytes[0] === 0xff ? jpegSize(bytes) : pngSize(bytes);
    if (size === null) throw new Error(`token radar: screenshots/${name} is neither a whole JPEG nor a whole PNG`);
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long !== SHOT_LONG_SIDE || short !== SHOT_SHORT_SIDE) {
      throw new Error(`token radar: screenshots/${name} is ${size.width}x${size.height}, not ${SHOT_LONG_SIDE}x${SHOT_SHORT_SIDE}`);
    }
    return { name, bytes: bytes.length, sha256: sha256Hex(bytes) };
  });
}

// ------------------------------------------------------------------ files

/** Copy a directory tree into place, files in name order, directories recursed. */
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else if (entry.isFile()) copyFileSync(src, dst);
    else throw new Error(`token radar: ${src} is neither a file nor a directory`);
  }
}

/** Write a file and describe it for the summary: name, bytes, digest. */
function writeCounted(path: string, bytes: Uint8Array | string): WrittenFile {
  const data = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  writeFileSync(path, data);
  return { name: basename(path), bytes: data.length, sha256: sha256Hex(data) };
}

// ------------------------------------------------------------------ the run

/** Build the whole entry into `paths.outputDir`, and print its summary. */
function run(paths: RunPaths): void {
  const root = repoDir();
  const snapshot = parseSnapshot(readFileSync(paths.snapshotPath, 'utf8'));
  const { board, radar } = buildRadar(snapshot);

  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new Error(`token radar: the board is refused — ${issue}`);

  // The screenshots are checked before anything is written, so a bad image
  // fails the run here instead of failing the entry at the gate.
  const shots = checkedScreenshots(join(root, 'screenshots'));

  mkdirSync(paths.outputDir, { recursive: true });
  const written: WrittenFile[] = [];
  written.push(writeCounted(join(paths.outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`));
  written.push(writeCounted(join(paths.outputDir, 'data.js'), dataScript(radar)));
  copyTree(join(root, 'dashboard'), join(paths.outputDir, 'dashboard'));
  copyTree(join(root, 'screenshots'), join(paths.outputDir, 'screenshots'));

  // The dossier is built last, from the output directory exactly as the
  // scorer will read it — dashboard/ and screenshots/ already in place.
  const dossier = buildDossier(paths.outputDir, { text_max_bytes: DOSSIER_TEXT_BYTES });
  written.push(writeCounted(join(paths.outputDir, 'dossier.json'), dossier));
  if (dossier.length > DOSSIER_MAX_BYTES) {
    throw new Error(`token radar: dossier.json is ${dossier.length} bytes, over the ${DOSSIER_MAX_BYTES} cap`);
  }

  // Self-check: build the dossier again from the written files and demand
  // the same bytes. A run that cannot reproduce its own dossier has not
  // written one the scorer will accept.
  const rebuilt = buildDossier(paths.outputDir, { text_max_bytes: DOSSIER_TEXT_BYTES });
  if (sha256Hex(rebuilt) !== sha256Hex(dossier)) {
    throw new Error('token radar: the dossier does not survive a rebuild from the written output');
  }

  const summary: BuildSummary = {
    asOf: snapshot.as_of,
    protocols: snapshot.protocols.length,
    watchlist: snapshot.watchlist.length,
    boardRows: board.length,
    earlyRows: radar.early_size,
    liveRows: radar.live_size,
    setAsideRows: radar.set_aside_size,
    comps: radar.validation.comps,
    looX: radar.validation.loo.x_factor,
    walkForwardX: radar.validation.walk_forward.x_factor,
    rSquared: radar.validation.r_squared,
    leaders: leadersOf(board, LEADERS_SHOWN),
    outputDir: paths.outputDir,
    files: written,
    shots,
    dossierBytes: dossier.length,
  };
  console.log(formatBuildSummary(summary));
}

/** Fail loudly, on stderr, with a non-zero exit: a silent bad entry is worse than none. */
function main(): void {
  try {
    run(runPaths(process.argv.slice(2), process.env));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

main();
