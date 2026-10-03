// Runs Full control headlessly for each closing school given on the command line and prints the outcome (for tuning the demo data).
import { chromium } from '@playwright/test';
const ids = process.argv.slice(2), url = process.env.URL || 'http://localhost:4173/';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await b.newPage(); await page.goto(url); await page.waitForSelector('#hmap');
for (const id of ids) {
  const r = await page.evaluate(async id => {
    const P = window.__pathshala, FC = P.FC;
    const inv = FC.startFull(id);
    for (const step of ['feedback', 'evidence', 'investigate']) await FC.runWork(inv, step);
    const forms = FC.fieldForm(inv), ans = {};
    forms.forEach((f, i) => { ans[f.track.case_id] = Object.fromEntries(f.questions.map(x => [x.qid, { v: x.type === 'choice' ? (x.qid === 'Q1' ? ['No', 'Seasonal', 'Yes'][i % 3] : x.qid === 'Q3' ? ['No', 'No', 'Yes'][i % 3] : ['Confirmed', 'Not confirmed', 'Confirmed'][i % 3]) : x.type === 'number' || x.type === 'minutes' ? '22' : '', note: 'Demo answer' }])); });
    FC.submitFieldForm(inv, ans);
    for (const step of ['investigate', 'policy', 'report']) await FC.runWork(inv, step);
    const o = FC.fullRow(inv).out;
    return { closing: o.closing_school, students: o.students, rec: o.recommended_name, ranking: o.ranking, scores: Object.fromEntries(Object.entries(o.scores).map(([k, v]) => [k, v.total])), edge: o.edge, cands: o.comparison.options.map(x => ({ n: x.name, walk: x.walk_km, min: x.walk_min, seats: x.seats_available, conc: `${x.confirmed_concerns}/${x.concerns_total}`, terr: x.terrain, first: x.first_year_total })), stance: o.budget.columns.map(c => [c.name, c.stance.support, c.stance.oppose]), cost: o.budget.columns.map(c => [c.name, c.items.map(i => i.code).join('+'), c.firstYear]) };
  }, id);
  console.log(JSON.stringify(r, null, 1));
}
await b.close();
