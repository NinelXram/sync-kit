import { readFileSync } from 'node:fs';

export default async function version() {
  console.log(readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim());
  return 0;
}
