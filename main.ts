// Solmar Bay for the make.fun "Make GTA 6" bounty (gta6-01).
// Copies game/ and screenshots/ into the output directory and writes
// dossier.json with the bounty's exact caps. Node 22, standard library only.
import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function main(): void {
  const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? process.argv[2] ?? '/output');
  const repoDir = resolve(import.meta.dirname ?? '.');
  mkdirSync(outDir, { recursive: true });

  // Deterministic copy: game/ first, then screenshots/, fresh output dir.
  for (const sub of ['game', 'screenshots']) {
    const dest = join(outDir, sub);
    rmSync(dest, { recursive: true, force: true });
    const src = join(repoDir, sub);
    if (existsSync(src)) cpSync(src, dest, { recursive: true });
  }

  const dossier = buildDossier(outDir, CAPS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  const files = readdirSync(join(outDir, 'game'), { recursive: true }) as string[];
  const shots = existsSync(join(outDir, 'screenshots'))
    ? readdirSync(join(outDir, 'screenshots')).filter((f) => f.endsWith('.png'))
    : [];
  console.log(`Solmar Bay dossier written to ${join(outDir, 'dossier.json')} (${dossier.length} bytes, ${files.length} game entries, ${shots.length} screenshots).`);
}

main();
