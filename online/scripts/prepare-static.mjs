import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export const OFFICIAL_FILES = [
  'src/engine.mjs', 'src/turnPolicies.mjs', 'src/turnDraft.mjs', 'src/boardView.mjs', 'src/boardTargets.mjs',
  'src/styles.css', 'src/gameShell.css', 'src/experience.css', 'assets/Cerconexo_wordmark_transparente.png'
];
// A reproducible static package, not a second implementation of the rules.
// Never serve the repository root, private SQLite state or backend source.
export async function prepareStatic({ check = false } = {}) {
  const destination = path.resolve(root, 'public/official');
  if (!destination.startsWith(path.resolve(root, 'public') + path.sep)) throw new Error('Destino estático fuera del laboratorio.');
  const existing = await lstat(destination).catch(() => null);
  if (existing?.isSymbolicLink()) throw new Error('El destino estático no puede ser un enlace.');
  for (const name of OFFICIAL_FILES) {
    const source = path.join(path.dirname(root), name), target = path.join(destination, name);
    const bytes = await readFile(source), current = await readFile(target).catch(() => null);
    if (check) { if (!current?.equals(bytes)) throw new Error(`Recurso oficial no coincide: ${name}`); }
    else if (!current?.equals(bytes)) { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes); }
  }
  return { files: OFFICIAL_FILES.length, exactSourceBytes: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await prepareStatic({ check: process.argv.includes('--check') })));
