// Package PALMSHADE HEAT with Node's standard library and the kit's dossier writer.
// The game is static HTML, CSS and classic JavaScript; all art and sound are generated in code.
// Play locally: node serve.ts. Capture the four real game renders: node shots.mjs.
// Build outside the repository: MAKEFUN_OUTPUT_DIR=/tmp/gta6-out node main.ts.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TITLE = "PALMSHADE HEAT";
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

if (resolve(out) === resolve(here) || resolve(out).startsWith(resolve(here) + sep)) {
  throw new Error('Use an output directory outside the repository, such as /tmp/gta6-out.');
}
mkdirSync(out, { recursive: true });
// Repeated builds must not retain deleted starter code or obsolete screenshots.
rmSync(join(out, 'game'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log(`${TITLE}: dossier written to ${join(out, 'dossier.json')}`);
