// Senja Rescue — hand-in program (Node 22, standard library only).
//
// It assembles the submission payload in /output (or $MAKEFUN_OUTPUT_DIR
// outside the grader): a verified mirror of game/ and screenshots/ plus
// the dossier.json the vendored make.fun library writes from them. The
// grader runs this program twice and requires both runs to write the
// same bytes, so the mirror is checked, not just copied: every file is
// hashed before and after the copy, the screenshot caps are measured
// from the image headers, and the dossier is built twice in memory and
// compared before anything is written to disk.

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  copyFileSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Gate caps from the competition (see competition.yaml, "The gate").
const SHOT_MAX_BYTES = 262144;
const SHOT_MAX_LONG = 1280;
const SHOT_MIN_SHORT = 480;
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// Dimensions straight from the image header: PNG IHDR, or the first
// JPEG frame marker. No decoder, no dependency.
function imageSize(bytes, name) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) throw new Error(`${name}: bad JPEG marker`);
      const marker = bytes[i + 1];
      const len = bytes.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: bytes.readUInt16BE(i + 7), h: bytes.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  throw new Error(`${name}: unknown image format`);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
    else throw new Error(`not a plain file: ${full}`);
  }
  return out.sort();
}

// Mirror one tree into the output, hashing every file on both sides.
function mirrorTree(srcDir, dstDir) {
  const files = walk(srcDir);
  let total = 0;
  for (const src of files) {
    const rel = relative(srcDir, src);
    const dst = join(dstDir, rel);
    const bytes = readFileSync(src);
    total += bytes.length;
    mkdirSync(join(dst, '..'), { recursive: true });
    copyFileSync(src, dst);
    const back = readFileSync(dst);
    if (sha256(back) !== sha256(bytes)) throw new Error(`mirror mismatch: ${rel}`);
  }
  return { count: files.length, bytes: total };
}

function checkShots(dir) {
  const shots = walk(dir);
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`need 3-4 screenshots, found ${shots.length}`);
  }
  for (const shot of shots) {
    const bytes = readFileSync(shot);
    if (bytes.length > SHOT_MAX_BYTES) {
      throw new Error(`${shot}: ${bytes.length} bytes over the 256 KiB cap`);
    }
    const { w, h } = imageSize(bytes, shot);
    if (Math.max(w, h) > SHOT_MAX_LONG || Math.min(w, h) < SHOT_MIN_SHORT) {
      throw new Error(`${shot}: ${w}x${h} outside the 1280x480 gate`);
    }
  }
  return shots.length;
}

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(gameDir)) throw new Error('game/ missing from the repository');
if (!existsSync(shotsDir)) throw new Error('screenshots/ missing from the repository');

mkdirSync(outDir, { recursive: true });
const game = mirrorTree(gameDir, join(outDir, 'game'));
if (game.count > GAME_MAX_FILES || game.bytes > GAME_MAX_BYTES) {
  throw new Error(`game/ over its cap: ${game.count} files, ${game.bytes} bytes`);
}
const shotCount = checkShots(shotsDir);
mirrorTree(shotsDir, join(outDir, 'screenshots'));

// Build the dossier twice and demand identical bytes: the grader runs
// this program twice and compares, so a wobble here is a failed entry.
const dossierOpts = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: SHOT_MAX_BYTES },
  game_max_files: GAME_MAX_FILES,
  game_max_bytes: GAME_MAX_BYTES,
  game_path_max_bytes: 1000,
};
const first = Buffer.from(buildDossier(outDir, dossierOpts));
const second = Buffer.from(buildDossier(outDir, dossierOpts));
// buildDossier returns a Uint8Array: compare by bytes, not identity.
if (!first.equals(second)) throw new Error('dossier is not deterministic across builds');
writeFileSync(join(outDir, 'dossier.json'), first);

console.log(
  `Senja Rescue hand-in ready: game ${game.count} files / ${game.bytes} bytes, ` +
  `${shotCount} screenshots, dossier ${first.length} bytes -> ${outDir}`,
);
