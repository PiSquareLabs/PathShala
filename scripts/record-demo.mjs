/* Records the hackathon demo video (webm) by driving the built app with Playwright, with captions.
   Usage: PW_CHROMIUM=... node scripts/record-demo.mjs [baseUrl]   then convert with ffmpeg (see scripts/make-demo.sh). */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
/* Two passes. DRY=1: run the flow quickly and write docs/demo/texts.json (every caption and card). Then
   scripts/narrate.py makes a voice clip per text. The real pass holds each caption until its clip has finished and
   writes docs/demo/timeline.json (when each clip starts) so the clips can be mixed into the video. */
const DRY = !!process.env.DRY, texts = [], timeline = [];
const key = t => createHash('sha1').update(t).digest('hex').slice(0, 12);
const dur = existsSync('docs/demo/tts/durations.json') ? JSON.parse(readFileSync('docs/demo/tts/durations.json', 'utf8')) : {};
const base = process.argv[2] || 'http://localhost:4175/';
const W = 1280, H = 720;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(DRY ? {} : { recordVideo: { dir: 'docs/demo/raw', size: { width: W, height: H } } }) });
const page = await ctx.newPage();
// public news pages are fetched by Node (which trusts the proxy CA) and handed to the browser; the app itself is served locally
await ctx.route(u => !u.href.startsWith(base) && /^https?:/.test(u.protocol), async r => { try { await r.fulfill({ response: await r.fetch({ timeout: 30000 }) }); } catch (e) { await r.abort(); } });
const t0 = Date.now();
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
const hold = ms => page.waitForTimeout(DRY ? Math.min(ms, 150) : ms);
const speak = async (text, ms) => {                       // returns how long to hold so the narration finishes
  const k = key(text); texts.push({ k, text });
  if (DRY) return ms;
  timeline.push({ k, at: (Date.now() - t0) / 1000 });
  return Math.max(ms, Math.round(((dur[k] || 0) + 0.45) * 1000));
};
const cap = async (t, ms = 3000) => { ms = await speak(t, ms); await page.evaluate(t => { document.getElementById('cap').textContent = t; document.getElementById('toast')?.classList.remove('show'); }, t); await hold(ms); };
const card = async (h, p, ms) => { ms = await speak(`${h}. ${p}`, ms); await page.evaluate(([h, p]) => { const k = document.getElementById('card'); k.innerHTML = `<h1>${h}</h1><p>${p}</p>`; k.style.display = 'flex'; }, [h, p]); await hold(ms); await page.evaluate(() => { document.getElementById('card').style.display = 'none'; }); };
const click = async (loc, pause = 600) => { const b = await loc.first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 }); await hold(300); await loc.first().click(); await hold(pause); };
const scrollTo = async (loc, block = 'center') => { await loc.first().evaluate((e, b) => e.scrollIntoView({ block: b, behavior: 'smooth' }), block); await hold(900); };
const step = name => page.locator('.steps a', { hasText: name });
const tab = name => page.locator('.opttabs button', { hasText: name });


const badge = async t => page.evaluate(t => { let b = document.getElementById('srcb'); if (!b) { b = document.createElement('div'); b.id = 'srcb'; b.style.cssText = 'position:fixed;top:14px;right:14px;z-index:99999;background:#f5b301;color:#111;font:700 18px system-ui,sans-serif;padding:8px 14px;border-radius:10px'; document.body.appendChild(b); } b.textContent = t; b.style.display = t ? 'block' : 'none'; }, t);
/* A real public news article: headline first, then a slow scroll to the first paragraphs. */
const news = async (url, source, text, ms = 7000) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}); await hold(3500);
  await page.evaluate(() => { document.querySelectorAll('[class*="popup"],[class*="modal"],[id*="consent"],[class*="cookie"]').forEach(e => { e.style.display = 'none'; }); window.scrollTo(0, 0); });
  await badge(source); await cap(text, ms);
  await page.evaluate(() => window.scrollTo({ top: 520, behavior: 'smooth' })); await hold(1800); await badge('');
};
const waitShow = async sel => { await page.waitForSelector(sel, { timeout: 240000 }); await hold(600); };
const nowOn = async () => { const p = page.locator('#fc-pause'); if (await p.count() && /Pause/.test(await p.innerText())) await p.click(); };

// ---------- 1. title and the real-world problem ----------
await page.goto(base); await page.waitForSelector('#hmap'); await hold(500);
await card('PathShala', 'A multilingual citizen-feedback platform that turns fragmented development requests into evidence for public investment decisions. Shown on school consolidation in Himachal Pradesh, India. BRICS theme: Innovation. A Digital Public Good.', 8000);
await card('The problem is real', 'Governments are merging and closing small schools. Here is what the news says.', 4500);
await news('https://thenewshimachal.com/2025/06/103-zero-admission-schools-in-himachal-to-be-closed-443-others-merged/', 'Source: The News Himachal, 7 June 2025', 'June 2025: Himachal decides to close 103 schools with no students and to merge 443 schools that have ten or fewer students into schools two to five kilometres away.', 9000);
await news('https://www.tribuneindia.com/news/himachal/villagers-join-hands-to-set-up-wooden-bridge-over-tirthan-river-for-third-time/amp', 'Source: The Tribune, 21 September 2025', 'But the way to the new school matters. In the Tirthan valley, villagers rebuilt a wooden bridge over the river on their own, for the third time, after floods washed it away.', 9000);
await news('https://www.tribuneindia.com/news/himachal/unsafe-schools-of-tirthan-valley/', 'Source: The Tribune, 2 September 2026', 'And the buildings are unsafe. At Government Middle School Nahin, twenty-one students sit in classes under three tin sheds, and the building was declared unsafe last year.', 9000);
await news('https://www.livelaw.in/high-court/himachal-pradesh-high-court/hp-high-court-upholds-merger-government-middle-school-551937', 'Source: LiveLaw, 26 September 2026', 'Courts now ask about access. The High Court upheld one merger because the new school was just one and a half kilometres away by road, and five hundred metres on foot.', 9000);
await card('The gap', 'Officers must decide with feedback scattered across WhatsApp, phone calls, gram sabhas and portals, and almost never lined up with the map, the hazards, the policy or the cost. PathShala closes that gap.', 8500);

// ---------- 2. multilingual intake ----------
await page.goto(base + '#/inbox'); await page.waitForSelector('#fb-t'); await hold(1200);
await cap('Step one: citizens speak in their own language. A Hindi WhatsApp message is read and structured on arrival: the issue, the sentiment, how serious it is.', 6500);
await click(page.locator('.samples button').first(), 1500);
await scrollTo(page.locator('#fb-cls'), 'center'); await hold(2500);

// ---------- 3. Full control on GPS Kasta ----------
await page.goto(base + '#/'); await page.waitForSelector('#hmap'); await hold(1200);
await cap('Now the investigation. The officer chooses Full control: pick one school, and the AI does the research.', 5500);
await click(page.locator('#mode-full'), 900);
await cap('GPS Kasta has twenty-two students on a steep hillside. The AI will pick its best candidate schools.', 5000);
await click(page.locator('#demo-school'), 1000);
await cap('The officer only chooses the closing school. Everything else is the AI.', 4000);
await click(page.locator('#cp-full'), 1500);
await waitShow('#fc-banner'); await nowOn();
await cap('The AI picked three candidate schools: Dobhi, Kukari and Soyal. It has already started researching them in the background.', 6500);
await scrollTo(page.locator('.cmptbl'), 'start'); await hold(2000);
await click(page.locator('#fc-now'), 800);

// feedback
await waitShow('.fbrow');
await cap('The feedback step. The AI read what parents and villagers say about each school and sorted it into transportation, safety, terrain and weather, social and others.', 7500);
await scrollTo(page.locator('.fbrow').first(), 'start'); await hold(2500);
await cap('Each category shows who supports merging and who does not. These are real concerns, grouped, not a pile of messages.', 5500);
await click(page.locator('.opttabs button').nth(1), 1500); await hold(2000);
await cap('Every school has different feedback, because every school has different ground: rivers, snow, landslides, roads.', 5500);
await waitShow('#fc-now'); await click(page.locator('#fc-now'), 800);

// evidence
await waitShow('#rs-transportPlanner .rstep');
await cap('The evidence step. Here the AI plans how the children could travel, and shows its work in plain words: why it looked, and what it found.', 7000);
await scrollTo(page.locator('#rs-transportPlanner .rstep').first(), 'start'); await hold(3500);
await cap('It studied the geography around both schools, the road route, the bus timetable, pickup stops, the government rules and the cost.', 7000);
await waitShow('#fc-now'); await click(page.locator('#fc-now'), 800);

// investigate: field form
await waitShow('#fc-form');
await cap('Now the only stop. The AI wrote a short field form for each school, with questions from that school’s own terrain. The field officer fills it in.', 7500);
await scrollTo(page.locator('#fc-form'), 'start'); await hold(2500);
await click(page.locator('#fc-demo-fill'), 1500);
await cap('For the demo we fill in sample answers: a river crossing passable, a bus available, how many children use the route.', 6000);
await scrollTo(page.locator('#fc-submit'), 'center'); await hold(1500);
await click(page.locator('#fc-submit'), 1500);
await cap('The AI now updates the picture with those answers.', 3000);
await waitShow('#fc-now'); await click(page.locator('#fc-now'), 800);

// policy
await waitShow('.aiwhy');
await cap('Policy and cost. The AI picks the best policies for each school, and explains why it chose each one, or why not.', 6500);
await scrollTo(page.locator('.aiwhy').first(), 'center'); await hold(3000);
await cap('The officer can change anything. Untick a policy, and the report will use the officer’s choice.', 5500);
const first = page.locator('.ivsel input:checked').first(); if (await first.count()) { await click(first, 1200); await click(first, 1200); }
await waitShow('#fc-now'); await click(page.locator('#fc-now'), 800);

// report
await waitShow('.fcrec');
await cap('The final report. The AI compares all the schools and gives the reason for its recommendation, in plain words. It is a suggestion; the officer decides.', 8000);
await scrollTo(page.locator('.fcrec'), 'start'); await hold(3500);
await scrollTo(page.locator('#fc-compare'), 'start');
await cap('Side by side: walking time, terrain on the way, confirmed concerns, community support, and the cost of the chosen policies.', 6500);
await hold(2500);
await click(page.locator('#fc-score-fold summary'), 1200);
await cap('And the working is open to inspect: how each school scored on each criterion.', 4500);
await scrollTo(page.locator('#fc-budget'), 'start');
await cap('The budget compares every school, and the cost of keeping and repairing the closing school.', 5000);
await scrollTo(page.locator('#fc-report'), 'start');
await cap('A full report with a source on every sentence, ready to download or print for the district office.', 5500);
await badge('');
await card('Why this matters', 'Citizen voices, in any language, are lined up with maps, hazards, policy and cost, so a decision about a child’s school rests on evidence. Everything runs in the browser, so any district can use it: a Digital Public Good for the BRICS innovation theme.', 9500);

if (!DRY) { writeFileSync('docs/demo/timeline.json', JSON.stringify(timeline)); }
else writeFileSync('docs/demo/texts.json', JSON.stringify(texts));
await ctx.close(); await browser.close();
