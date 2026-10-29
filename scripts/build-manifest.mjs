// Regenerate kit/scripts/MANIFEST.json ({ relPath: sha256 } of every engine file). Run after any change under kit/scripts/.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, MANIFEST } from '../kit/scripts/lib/install.mjs';

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'kit', 'scripts');
const manifest = buildManifest(scripts);
writeFileSync(path.join(scripts, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${MANIFEST}: ${Object.keys(manifest).length} files`);
