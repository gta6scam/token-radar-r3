// Launch Radar dashboard: renders window.RADAR (written by main.ts from the
// same board the gate reads). Three views: board + validation evidence, one
// protocol's detail with its full derivation, and the FARM-filtered view.
// Sortable columns, segment/verdict filters and a text filter; no network.
const R = window.RADAR, M = R.meta, E = M.evidence, O = M.odds;
const $ = (s) => document.querySelector(s);
const fmt = (x) => x >= 1e9 ? '$' + (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? '$' + (x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : '$' + Math.round(x);
const fx = (x) => x.toFixed(2) + 'x';
const pc = (x) => (x * 100).toFixed(1) + '%';

// accounting strip (criterion: coverage accounting, printed on the board view)
{
  const a = M.accounting;
  const excluded = a.rankExcluded.map((r) => `${r.label} ${r.count}`).join(' · ');
  $('#strip').textContent =
    `${a.scanned} scanned · ${a.tradedAnchors} traded anchors (${a.fitEligible} fit-eligible) · ${a.ranked} ranked · watchlist ${a.watchlist}/${a.watchlist} · ` +
    `pre-token not ranked by reason: ${excluded} · ${a.parentRuleRanked} off-list protocols ranked despite the house list's parent rule (that field is not in the snapshot) · snapshot ${M.as_of}`;
}

// evidence panel: the four-layer validation stack + odds + farm counts
function evidenceHTML() {
  const c = E.conformal;
  const kpi = [
    [`${fx(E.loo_fit_universe)}`, 'LOO median fold — fit universe', `${M.accounting.fitUniverse} anchors, cats ≥3, cap ≥ $1M`],
    [`${fx(E.loo_all_eligible)}`, 'LOO disclosed — all fit-eligible', `${M.accounting.fitEligible} anchors, unedited`],
    [`${fx(E.walk_forward)}`, 'Walk-forward by listed_at', `${E.walk_forward_pairs} out-of-sample pairs, 3 origins`],
    [`${pc(O.cv_accuracy)}`, 'Launch odds held-out accuracy', `vs base rate ${pc(O.base_rate)} · AUC ${O.cv_auc.toFixed(2)}`],
    [`${pc(c.measuredCoverage)}`, 'Conformal band coverage, measured', `nominal ${pc(c.nominal)} · 80% band = value x e±${c.halfWidth.toFixed(2)}`],
    [`${M.farm_rows.farm}`, 'Rows worth farming (FARM)', `of ${M.farm_rows.total} · THIN ${M.farm_rows.thin} · SKIP ${M.farm_rows.skip}`],
  ].map(([b, s, e]) => `<div class="kpi"><b>${b}</b><span>${s}</span><em>${e}</em></div>`).join('');
  const cand = E.candidates.map((x) => `<tr><td>${x.name}</td><td class="n">${fx(x.looFitU)}</td><td class="n">${fx(x.looAll)}</td>` +
    (x.winRate === null ? '<td class="n">—</td><td class="n">—</td>' : `<td class="n">${pc(x.winRate)} wins</td><td class="n">${fx(x.pooledCand)} vs ${fx(x.pooledBase)}</td>`) +
    `<td>${x.verdict}</td></tr>`).join('');
  const miss = E.misses.map((m) => `<tr><td>${m.name}</td><td>${m.category || '—'}</td><td class="n">${fmt(m.pred)}</td><td class="n">${fmt(m.actual)}</td><td class="n">${fx(m.fold)}</td></tr>`).join('');
  return kpi + `<div class="two">
    <div class="panel"><h3>Admission — every candidate, losers printed (repeated paired CV vs baseline)</h3>
    <table><tr><th>Learner</th><th class="n">LOO fit</th><th class="n">LOO all</th><th class="n">Paired folds</th><th class="n">Pooled median</th><th>Verdict</th></tr>${cand}</table>
    <p class="note">Admission rule: a learner enters only with ≥60% paired-fold wins AND a better pooled median than the baseline. ` +
    `Within-2x share: fit universe ${pc(E.within2_fit_universe)}, all eligible ${pc(E.within2_all)}. Stress line, disclosed: single 70/30 time-split (newest cohort) ${fx(E.time_split)}. ` +
    `Bootstrap 200 refits: median rank-range width ${E.bootstrap_median_rank_width.toFixed(0)} places. Momentum winsorised to the anchors' own 5–95% band [${M.winsor_band[0]}%, ${M.winsor_band[1]}%] at prediction time only.</p></div>
    <div class="panel"><h3>The 8 worst leave-one-out misses — unedited</h3>
    <table><tr><th>Protocol</th><th>Category</th><th class="n">Predicted</th><th class="n">Actual cap</th><th class="n">Fold</th></tr>${miss}</table>
    <p class="note">Value model: ensemble of two kNN-5 learners over log cap/TVL (momentum, log age, log size, chain reach; second learner adds an Ethereum flag), category-mismatch distance penalty 0.75, fitted on the declared fit universe. Odds model: logistic regression on all ${M.accounting.scanned} protocols (label: already records a token), ${O.folds} stratified folds. Implied = value if it launches × odds. Farm verdicts net at each row's low band under a declared capture share of ${(M.capture_share * 100).toFixed(3)}% of the low band per prepared wallet.</p></div></div>`;
}

// farm panel: shown only in the farm view — the actionable book (every FARM
// row with its route, cost and days) plus the closest THIN rows and what
// they are short of a FARM verdict.
function farmPanelHTML() {
  const farms = R.rows.filter((r) => r.verdict === 'FARM').sort((a, b) => b.net_usd - a.net_usd);
  const thins = R.rows.filter((r) => r.verdict === 'THIN').sort((a, b) => b.net_usd - a.net_usd).slice(0, 10);
  const totNet = farms.reduce((s, r) => s + r.net_usd, 0);
  const book = farms.map((r) => `<tr><td><span class="pname">${r.name}</span><br><span class="pcat">${r.category || ''} · ${r.chains.slice(0, 2).join(', ')}</span></td>` +
    `<td class="num">${fmt(r.band_low_usd)}</td><td class="num">${fmt(r.capture_usd)}</td><td class="num">${fmt(r.farm_cost_usd)}</td>` +
    `<td class="num">${r.farm_days}d</td><td class="num pos">${fmt(r.net_usd)}</td><td>${r.farm_steps[1].split('.')[0]}.</td></tr>`).join('');
  const near = thins.map((r) => `<tr><td>${r.name}</td><td class="num">${fmt(r.implied_value_usd)}</td><td class="num">${fmt(r.net_usd)}</td><td class="num">${fmt(500 - r.net_usd)} short</td></tr>`).join('');
  return `<div class="two" style="margin-top:10px">
    <div class="panel"><h3>The farm book — every FARM row, costed (combined net ${fmt(totNet)})</h3>
    <table><tr><th>Protocol</th><th class="n">Low band</th><th class="n">Capture</th><th class="n">Cost</th><th class="n">Days</th><th class="n">Net</th><th>Opening move</th></tr>${book}</table></div>
    <div class="panel"><h3>Closest THIN rows — what they are short of FARM (net ≥ $500 at the low band)</h3>
    <table><tr><th>Protocol</th><th class="n">Implied</th><th class="n">Net</th><th class="n">Shortfall</th></tr>${near}</table>
    <p class="note">Verdicts are netted at each row's low band, never at the point estimate: a row earns FARM only if the pessimistic end of its calibrated band still clears its full cost by $500. SKIP rows (${M.farm_rows.skip}) lose money at the low band even before the capital is missed elsewhere.</p></div></div>`;
}

// board table
let sortKey = 'rank', sortDir = 1, view = 'board';
function rowHTML(r) {
  const chg = r.change_7d === null ? '—' : `<span class="${r.change_7d >= 0 ? 'pos' : 'neg'}">${r.change_7d >= 0 ? '+' : ''}${r.change_7d.toFixed(1)}%</span>`;
  return `<tr data-slug="${r.slug}"><td class="num">${r.rank}</td>` +
    `<td><span class="pname">${r.name}</span> <span class="seg">${r.segment}</span><br><span class="pcat">${r.category || 'uncategorised'} · ${r.chains.slice(0, 3).join(', ')}</span></td>` +
    `<td class="num">${fmt(r.tvl_usd)}</td><td class="num">${chg}</td>` +
    `<td class="num">${fmt(r.value_if_launches_usd)}</td><td class="num">${r.launch_odds_pct.toFixed(0)}%</td>` +
    `<td class="num"><b>${fmt(r.implied_value_usd)}</b></td>` +
    `<td class="num">${fmt(r.band_low_usd)} – ${fmt(r.band_high_usd)}</td>` +
    `<td><span class="v${r.verdict}">${r.verdict}</span></td>` +
    `<td class="num ${r.net_usd >= 0 ? 'pos' : 'neg'}">${fmt(r.net_usd)}</td></tr>`;
}
function renderBoard() {
  const q = $('#q').value.toLowerCase(), seg = $('#seg').value, verd = $('#verd').value || (view === 'farm' ? 'FARM' : '');
  let rows = R.rows.filter((r) => (!seg || r.segment === seg) && (!verd || r.verdict === verd) &&
    (!q || (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().includes(q)));
  rows = [...rows].sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sortDir;
  });
  if (view === 'farm' && sortKey === 'rank') rows.sort((a, b) => b.net_usd - a.net_usd);
  $('#board tbody').innerHTML = rows.map(rowHTML).join('');
  $('#rowcount').textContent = `${rows.length} of ${R.rows.length} rows shown. Click a row for its full derivation and farm plan.`;
  $('#farmpanel').innerHTML = view === 'farm' ? farmPanelHTML() : '';
  document.querySelectorAll('#board tbody tr').forEach((tr) => tr.addEventListener('click', () => showDetail(tr.dataset.slug)));
}
document.querySelectorAll('#board th[data-k]').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.k; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = k === 'name' || k === 'verdict' ? 1 : -1; } renderBoard();
}));
['q', 'seg', 'verd'].forEach((id) => $('#' + id).addEventListener('input', renderBoard));

// detail view: full derivation of one row, re-derivable from the row alone
function showDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  const ratio = r.value_if_launches_usd / r.tvl_usd;
  $('#boardwrap').hidden = true; $('#evidence').style.display = 'none';
  const d = $('#detail'); d.hidden = false;
  d.innerHTML = `<button class="back" onclick="backToBoard()">← back to board</button>
  <h2>#${r.rank} ${r.name} <span class="seg">${r.segment}</span> <span class="v${r.verdict}">${r.verdict}</span></h2>
  <p class="note">${r.category || 'uncategorised'} · ${r.chains.join(', ')} · TVL ${fmt(r.tvl_usd)} · 7d change ${r.change_7d === null ? 'not reported' : r.change_7d.toFixed(1) + '%'} · bootstrap rank range ${r.rank_range[0]}–${r.rank_range[1]} (200 refits)</p>
  <h3>Derivation — every number from the snapshot</h3>
  <div class="deriv">TVL ${fmt(r.tvl_usd)}
x fitted cap/TVL ratio ${ratio.toFixed(4)}  (median log-ratio of the 5 nearest traded anchors, ensemble of two kNN learners)
= value if it launches ${fmt(r.value_if_launches_usd)}
x launch odds ${r.launch_odds_pct.toFixed(1)}%  (logit on size, age, reach, momentum, category; held-out ${pc(O.cv_accuracy)} vs base ${pc(O.base_rate)})
= implied value ${fmt(r.implied_value_usd)}
band ${fmt(r.band_low_usd)} – ${fmt(r.band_high_usd)}  (80% conformal, half-width e±${E.conformal.halfWidth.toFixed(2)}, measured coverage ${pc(E.conformal.measuredCoverage)})</div>
  <h3>Farm plan — cost built from category + chain + chase surcharge</h3>
  <ol class="steps">${r.farm_steps.map((s) => `<li>${s}</li>`).join('')}</ol>
  <p class="note">Total cost ${fmt(r.farm_cost_usd)} over ~${r.farm_days} days · expected capture ${fmt(r.capture_usd)} at the low band · net ${fmt(r.net_usd)} → ${r.verdict}.</p>`;
  window.scrollTo(0, 0);
}
function backToBoard() { $('#detail').hidden = true; $('#boardwrap').hidden = false; $('#evidence').style.display = ''; window.scrollTo(0, 0); }

// tabs + screenshot hash modes (#farm, #detail-<slug>)
function setView(v) {
  view = v;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  $('#evidence').innerHTML = v === 'board' ? evidenceHTML() : '';
  $('#evidence').style.display = v === 'board' ? '' : 'none';
  backToBoard();
  if (v !== 'board') { $('#detail').hidden = true; $('#boardwrap').hidden = false; }
  renderBoard();
}
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('#foot').textContent = `Snapshot: ${M.source}. Implied values are this radar's own fitted claims, not predictions that a launch will happen. Farm plans are stated with their costs so the verdict arithmetic can be checked from any row.`;

setView('board');
const h = location.hash;
if (h === '#farm') setView('farm');
else if (h.startsWith('#detail-')) showDetail(h.slice(8));
