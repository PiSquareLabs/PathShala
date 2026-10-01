import { fullRow } from '../../agent/fullControl.js';
import { caseState, go } from '../helpers.js';

const STEP_FOR = { research: 'compare', field: 'investigate', answered: 'investigate', policy: 'policy', report: 'report', final: 'report' };

/* Full control is a mode of the home page, not a page. #/full opens the home page in that mode; #/full/<inv> resumes a run on its screen. */
export function renderFull(pg, inv) {
  if (inv) { const r = fullRow(inv); go(r ? `case/${inv}/${STEP_FOR[r.stage] || 'compare'}` : ''); return; }
  caseState.mode = 'full'; go('');
}
