import { commandBuilderTasks } from '../scripts/command-snippets';
const cases: { name: string; failure?: string; skipped?: boolean }[] = [];
(async () => { for (const t of commandBuilderTasks(cases as never).slice(1)) await t();
const f = cases.filter((c) => c.failure); console.log('TOTAL', cases.length, 'FAIL', f.length); for (const c of f) console.log('FAILED:', c.name, c.failure); })();
