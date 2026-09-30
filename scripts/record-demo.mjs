/* Records the hackathon demo video (webm) by driving the built app with Playwright, with captions.
   Usage: PW_CHROMIUM=... node scripts/record-demo.mjs [baseUrl]   then convert with ffmpeg (see scripts/make-demo.sh). */
import { chromium } from '@playwright/test';
const base = process.argv[2] || 'http://localhost:4175/';
const W = 1280, H = 720;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: 'docs/demo/raw', size: { width: W, height: H } } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const mk = () => {
    if (document.getElementById('cap')) return;
    const s = document.createElement('style'); s.textContent = `
      #cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:1000px;z-index:99999;background:rgba(15,25,35,.92);color:#fff;font:600 21px/1.35 system-ui,sans-serif;padding:12px 22px;border-radius:12px;text-align:center;transition:opacity .3s}
      #cap:empty{opacity:0}
      #card{position:fixed;inset:0;z-index:100000;background:#12232f;color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:system-ui,sans-serif;text-align:center;padding:40px}
      #card h1{font-size:64px;margin:0} #card p{font-size:26px;margin:0;max-width:900px;color:#cfe0ea;line-height:1.4}
      #dot{position:fixed;width:22px;height:22px;border-radius:50%;background:rgba(245,179,1,.75);border:2px solid #fff;z-index:100001;pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px}`;
    document.head.appendChild(s);
    const c = document.createElement('div'); c.id = 'cap'; document.body.appendChild(c);
    const k = document.createElement('div'); k.id = 'card'; document.body.appendChild(k);
    const d = document.createElement('div'); d.id = 'dot'; document.body.appendChild(d);
    addEventListener('mousemove', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
  };
  if (document.body) mk(); else addEventListener('DOMContentLoaded', mk);
});
const hold = ms => page.waitForTimeout(ms);
const cap = async (t, ms = 3000) => { await page.evaluate(t => { document.getElementById('cap').textContent = t; document.getElementById('toast')?.classList.remove('show'); }, t); await hold(ms); };
const card = async (h, p, ms) => { await page.evaluate(([h, p]) => { const k = document.getElementById('card'); k.innerHTML = `<h1>${h}</h1><p>${p}</p>`; k.style.display = 'flex'; }, [h, p]); await hold(ms); await page.evaluate(() => { document.getElementById('card').style.display = 'none'; }); };
const click = async (loc, pause = 600) => { const b = await loc.first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 }); await hold(300); await loc.first().click(); await hold(pause); };
const scrollTo = async (loc, block = 'center') => { await loc.first().evaluate((e, b) => e.scrollIntoView({ block: b, behavior: 'smooth' }), block); await hold(900); };
const step = name => page.locator('.steps a', { hasText: name });
const tab = name => page.locator('.opttabs button', { hasText: name });

await page.goto(base); await page.waitForSelector('#hmap'); await hold(500);
await card('PathShala', 'A multilingual citizen-feedback platform that turns fragmented development requests into evidence for public investment decisions. Demonstrated on school consolidation in Himachal Pradesh, India. BRICS theme: Innovation.', 7000);
await card('The problem', 'Citizen feedback lives in fragmented channels: WhatsApp, calls, gram sabhas, portals. It is rarely aligned with infrastructure data, so spending is misaligned and gaps go unaddressed.', 6500);
// intake: multilingual, multi-channel
await cap('INTAKE: requests arrive by WhatsApp, phone, gram sabha and portal, in Hindi or English.', 3500);
await page.evaluate(() => { location.hash = '#/inbox'; }); await page.waitForSelector('#fb-t'); await hold(1200);
await click(page.locator('.samples button').first(), 1500);
await cap('A Hindi WhatsApp message is structured on arrival: issue, sentiment, severity and language.', 4500);
await scrollTo(page.locator('#fb-cls'), 'center'); await hold(2500);
await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector('#hmap'); await hold(1200);
await cap('Now the analysis: an officer investigates one proposed school closure.', 3000);

// 1. pick sender, several receivers
await cap('Data from UDISE+ (India school register) sets the context: GPS Pekhri-2, 27 students, building in poor condition.', 3500);
await click(page.locator('.srow[data-s="PK2"]'), 1200);
await cap('Then ticks SEVERAL receiving schools to compare side by side.', 2500);
await click(page.locator('.pickrow[data-b="GSH"] input'), 500); await click(page.locator('.pickrow[data-b="NGN"] input'), 800);
await click(page.locator('#cp-go'), 1500);

// 2. compare
await cap('Compare: distance, climb, hazards, free seats and facilities. Every row names its data source.', 3500);
await scrollTo(page.locator('.cmptbl'), 'start'); await hold(2500);
await cap('Nothing is chosen yet. The choice comes last, after field answers and costs.', 3000);

// 3. FEEDBACK
await click(step('Feedback'), 1500);
await cap('THE FEEDBACK STEP: what do citizens say about these schools?', 3000);
await cap('Messages about BOTH the closing and the receiving school are pooled. They are about schools, not always about merging.', 4000);
await click(tab('Gushaini'), 1200);
await cap('GPS Gushaini: 87 citizen messages, in Hindi and English, from villagers, parents and SMC members.', 3500);
await click(page.locator('#fb-classify'), 1500);
await cap('Step 1: every message is classified, with a fixed hardcoded table: Transportation, Safety, Terrain and weather, Social, Others.', 4500);
await scrollTo(page.locator('#cats'), 'center'); await hold(1500);
await cap('Each message also gets a sentiment, and a stance: does it support merging, or not?', 3500);
await click(page.locator('.cat', { hasText: 'Transportation' }), 1200);
await scrollTo(page.locator('#fb-Transportation .msg'), 'center'); await hold(1500);
await cap('Good about the receiving school, or bad about the closing school, supports merging. The reverse does not. A rule decides this, never a model.', 5500);
await scrollTo(page.locator('.stanceall'), 'center'); await hold(2000);
await cap('Overall stance of the community, at a glance.', 2500);

await scrollTo(page.locator('#fb-agents'), 'center');
await cap('Step 2: one agent per category summarises the concerns. Gemini writes the summaries when connected; the counts always come from the database.', 5000);
await click(page.locator('#fb-agents'), 1500);
await scrollTo(page.locator('.ctile').first(), 'center'); await hold(3500);
await cap('Transport, Safety, Terrain and weather, Social, Others: each with a verdict, a summary and its main concerns.', 4500);
await click(tab('Nagini'), 1200);
await cap('GPS Nagini has its own feedback. Each candidate school is judged on its own messages.', 3500);
await click(page.locator('#fb-classify'), 1000); await click(page.locator('#fb-agents'), 1500);
await scrollTo(page.locator('.ctile').first(), 'center'); await hold(3000);

// 4. evidence carries the concerns and shows demand hotspots
await click(step('Evidence'), 1500);
await cap('The concerns are carried forward into the Evidence step...', 3000);
await click(tab('Gushaini'), 1000);
await scrollTo(page.locator('#concerns'), 'start'); await hold(3000);
await cap('Citizen demand by habitation: click a theme to see where it concentrates. These are the demand hotspots.', 3500);
await scrollTo(page.locator('.themes'), 'center'); await click(page.locator('.theme').first(), 1500);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await hold(2500);
await cap('Hotspot map: circles grow with the number of responses from each habitation.', 3500);

// 5. investigate
await click(step('Investigate'), 1200);
await cap('...and into the investigation. Agents check students, routes, map layers, transport and gaps. Every step is a visible tool call.', 4500);
await click(page.locator('#ag-run-all'), 500);
await cap('Running all schools...', 1000);
await page.waitForSelector('.fq', { timeout: 120000 }); await hold(1500);
await scrollTo(page.locator('#findings'), 'start'); await hold(2500);
await cap('Findings are only potential issues until the officer verifies them in the field.', 3500);
await scrollTo(page.locator('#fq'), 'start');
await cap('Targeted field questions, specific to this route. The officer answers them.', 3000);
const answer = async () => {
  await click(page.locator('.fq[data-q="Q1"] .opts button', { hasText: 'No' }), 300);
  await page.locator('.fq[data-q="Q2"] .fv').fill('20'); await hold(300);
  await click(page.locator('.fq[data-q="Q3"] .opts button', { hasText: 'No' }), 300);
  await page.locator('.fq[data-q="Q4"] .fv').fill('45'); await hold(300);
  await click(page.locator('.fq[data-q="Q5"] .opts button', { hasText: 'Photo' }), 300);
  await click(page.locator('#fq-go'), 1500);
};
await answer(); await cap('Answers update the evidence: reported claims become verified.', 3000);
await click(tab('Nagini'), 1000); await scrollTo(page.locator('#fq'), 'start'); await answer();

// 6. policy
await click(step('Policy'), 1500);
await cap('Policy and cost: interventions come from retrieved government policy text; costs come from a calculator, never a model.', 4500);
await click(page.locator('.ivsel input').first(), 1000);
await click(tab('Gushaini'), 1000); await click(page.locator('.ivsel input').first(), 1000);
await scrollTo(page.locator('#opt-wrap'), 'center'); await hold(2500);
await cap('Total cost of each option, side by side.', 2500);

// 7. choose + report
await click(step('Report'), 1500);
await cap('Only now does the officer choose ONE school, with evidence and costs in view.', 3500);
await click(page.locator('[data-final]', { hasText: 'Choose' }).first(), 1500);
await scrollTo(page.locator('#rp-text'), 'center'); await hold(1500);
await cap('The report draft cites its evidence. The community feedback summaries reach the report, with their stance counts.', 5000);
await page.locator('#rp-text').evaluate(e => { e.scrollTop = e.scrollHeight; }); await hold(2500);
await cap('A critic agent checks every sentence has a reference and no invented numbers. The officer decides and submits.', 4500);

// 8. sources + close
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })); await hold(1200);
await page.locator('#srcs summary').click(); await hold(500);
await cap('Every page lists its data sources. Synthesised data names PathShala as the source.', 4500);
await card('What is built', 'Multilingual intake, hardcoded classification with stance, per-category agents, hotspot maps, policy-linked project options with costs, and a report that cites its evidence. Open source, no server needed: it runs in the browser.', 7500);
await card('Next: scale to BRICS', 'Add national demographic and infrastructure indices and public investment plans as data layers, voice transcription, and more languages (Portuguese, Russian, Chinese, Hindi, Arabic and others) using the same pipeline.', 7500);
await ctx.close(); await browser.close();
console.log('recorded');
