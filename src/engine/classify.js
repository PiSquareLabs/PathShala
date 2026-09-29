import { school } from '../ui/helpers.js';

export const ISSUE_KW = [
  ["Girls' safety", ['बेटी', 'बेटि', 'लड़कि', 'लड़की', 'छात्राओं', 'daughter', 'girl', 'harass', 'छेड़']],
  ['Route safety', ['नाला', 'नाले', 'नदी', 'बाढ़', 'फिसल', 'भूस्खलन', 'बर्फ', 'हाईवे', 'ट्रैफिक', 'stream', 'flood', 'landslide', 'slip', 'unsafe', 'snow', 'ice', 'highway', 'traffic', 'path', 'रास्त']],
  ['Capacity', ['भीड़', 'कमरे', 'कमरा', 'बरामद', 'congest', 'crowd', 'room', 'verandah', 'no space', 'seat']],
  ['Transport', ['गाड़ी', 'बस', 'वाहन', 'vehicle', 'bus', 'van', 'transport', 'escort', 'drop them']],
  ['Consultation', ['पूछे', 'पूछा', 'बिना बताए', 'without asking', 'without consulting', 'consult', 'not asked', 'nobody asked']],
  ['Young children', ['आंगनवाड़ी', 'छोटे बच्चे', 'anganwadi', 'pre-primary', 'little ones', 'small children']],
  ['School identity', ['अलग स्कूल', 'separate school', 'own staff', 'our school', 'हमारा स्कूल']],
  ['Enrolment', ['enrol', 'admission', 'दाखिला', 'students left']],
  ['Quality', ['पढ़ाई', 'अध्यापक', 'शिक्षक', 'teacher', 'lab', 'smart class', 'studies', 'learning']],
];
export const NEG = ['नहीं', 'डर', 'खतर', 'मुश्किल', 'परेशान', 'बंद', 'बिना', "can't", 'cannot', 'unsafe', 'problem', 'danger', 'afraid', 'worried', 'not safe', 'without', 'congest', 'closed', 'no one', 'nobody', 'stopped', 'dropped', 'far'];
export const POS = ['अच्छा', 'अच्छी', 'बेहतर', 'आसानी', 'खुश', 'तैयार', 'better', 'good', 'easily', 'happy', 'ready', 'safe now', 'thank'];
export function classify(text) {
  const t = (text || '').toLowerCase();
  const lang = /[ऀ-ॿ]/.test(text) ? 'hi' : 'en';
  let best = 'Other', bestN = 0;
  ISSUE_KW.forEach(([issue, kws]) => { const n = kws.filter(k => t.includes(k)).length; if (n > bestN) { best = issue; bestN = n; } });
  const neg = NEG.filter(k => t.includes(k)).length, pos = POS.filter(k => t.includes(k)).length;
  const sentiment = neg > pos ? 'negative' : pos > neg ? 'positive' : 'neutral';
  const severity = sentiment === 'negative' && ['Route safety', 'Capacity', "Girls' safety"].includes(best) ? 'high' : sentiment === 'negative' ? 'medium' : 'low';
  return { lang, issue: best, sentiment, severity, hits: bestN };
}
