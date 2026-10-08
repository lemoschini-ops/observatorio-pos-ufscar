/* Painel de Indicadores · UFSCar — interface dinâmica.
   Estado na URL (#tab=ouv&de=2022...), então links, voltar/avançar e "copiar link" preservam os filtros. */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const dark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
const cv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
/* Paleta de dados do guia de design: ordem fixa; amarelo = entidade em foco (UFSCar); demais = azul-marinho. */
const PALETTE = ['#244578', '#1b8fd2', '#f2b705', '#2a9d8f', '#e76f51', '#7b5ea7', '#0f4a85', '#8ab17d', '#c44569', '#64748b'];
const C = {get navy() { return dark() ? '#6db3f2' : '#244578'; }, get base() { return dark() ? '#6db3f2' : '#244578'; }, blue: '#0f4a85', sky: '#1b8fd2', ice: '#8794a8', gray: '#8794a8', yellow: '#f2b705', hi: '#f2b705', teal: '#2a9d8f', coral: '#e76f51', purple: '#7b5ea7',
  get ok() { return cv('--good'); }, get bad() { return cv('--bad'); }, get warn() { return cv('--warn'); }};
const fmt = (v, d = 1) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', {minimumFractionDigits: d, maximumFractionDigits: d});
const pct = v => v == null ? '—' : fmt(v * 100, 1) + '%';
const brl = v => 'R$ ' + fmt(v / 1e6, 1) + ' mi';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const FAIXA = {Inexpressivo: C.bad, Iniciando: C.warn, Intermediário: C.blue, Aprimorado: C.ok};
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const TABS = ['home', 'tcu', 'iesgo', 'lai', 'ouv', 'cor', 'integ', 'aud'];
let D, charts = {}, csvStore = {}, tab = 'home';
Chart.defaults.font.family = '"Open Sans",sans-serif';
function themeCharts() { Chart.defaults.color = cv('--muted'); Chart.defaults.borderColor = cv('--border'); }

/* ---------- estado na URL ---------- */
const getS = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
function setS(patch, {push = false} = {}) {
  const st = {...getS(), ...patch};
  for (const k of Object.keys(st)) if (st[k] == null || st[k] === '') delete st[k];
  const h = '#' + new URLSearchParams(st);
  history[push ? 'pushState' : 'replaceState'](null, '', h);
  render();
}
const go = (t, patch = {}) => { setS({tab: t, ...patch}, {push: true}); scrollTo({top: 0}); };
window.addEventListener('hashchange', render);

/* ---------- utilitários de interface ---------- */
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1800); }
/* Rótulos de dados: desenha o valor em barras, linhas e fatias. Desliga com options.plugins.rotulos = false. */
Chart.register({
  id: 'rotulos',
  afterDatasetsDraw(ch, _, opt) {
    if (opt === false) return;
    const tipo = ch.config.type, horiz = ch.options.indexAxis === 'y', ctx = ch.ctx, ds = ch.data.datasets;
    if (tipo === 'line' && ds.length > 2) return;
    const f = v => Number(v).toLocaleString('pt-BR', {maximumFractionDigits: Math.abs(v) < 10 && v % 1 ? 1 : 0});
    ctx.save(); ctx.font = '600 10.5px system-ui, sans-serif'; ctx.fillStyle = Chart.defaults.color;
    ds.forEach((d, i) => {
      const meta = ch.getDatasetMeta(i); if (meta.hidden || meta.data.length > 40) return;
      meta.data.forEach((el, k) => {
        const v = d.data[k]; if (v == null || typeof v === 'object' || (tipo !== 'doughnut' && tipo !== 'pie' && v === 0 && tipo === 'bar')) return;
        const t = f(v);
        if (tipo === 'doughnut' || tipo === 'pie') { if (!v) return; const p = el.tooltipPosition(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(t, p.x, p.y); return; }
        ctx.fillStyle = Chart.defaults.color;
        if (horiz) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, el.x + 4, el.y); }
        else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(t, el.x, el.y - 4); }
      });
    });
    ctx.restore();
  },
});
function chart(id, cfg) {
  charts[id]?.destroy();
  cfg.options = {maintainAspectRatio: false, ...cfg.options};
  charts[id] = new Chart($('#' + id), cfg);
  return charts[id];
}
const kpi = (l, v, d, o = {}) => `<${o.go ? 'a href="#' + new URLSearchParams(o.go) + '"' : 'div'} class="card kpi ${o.go ? 'click' : ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d || ''}</div>${o.x || ''}${o.go ? '<div class="go">Ver detalhes →</div>' : ''}</${o.go ? 'a' : 'div'}>`;
const src = o => `<a href="${o.url}" target="_blank" rel="noopener">${esc(o.nome || o.fonte)}</a>`;
const delta = (a, b, menorMelhor = false, d = 1, un = '') => { if (a == null || b == null) return ''; const dif = a - b, bom = menorMelhor ? dif < 0 : dif > 0;
  return `<span class="delta ${Math.abs(dif) < 1e-9 ? '' : bom ? 'up' : 'dn'}">${dif > 0 ? '▲' : dif < 0 ? '▼' : '='} ${fmt(Math.abs(dif), d)}${un}</span>`; };
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
const setCsv = (key, name, header, rows) => csvStore[key] = {name, header, rows};
document.addEventListener('click', e => {
  const p = e.target.closest('[data-png]'), c = e.target.closest('[data-csv]');
  if (p && charts[p.dataset.png]) { const a = document.createElement('a'); a.href = charts[p.dataset.png].toBase64Image('image/png', 1); a.download = p.dataset.png + '.png'; a.click(); }
  if (c && csvStore[c.dataset.csv]) { const s = csvStore[c.dataset.csv]; const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    download(s.name + '.csv', new Blob(['﻿' + [s.header, ...s.rows].map(r => r.map(q).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'})); }
});
addEventListener('scroll', () => $('#top').style.display = scrollY > 500 ? 'block' : 'none');
$('#nav').addEventListener('keydown', e => { const i = TABS.indexOf(tab); if (e.key === 'ArrowRight') go(TABS[(i + 1) % TABS.length]); if (e.key === 'ArrowLeft') go(TABS[(i + TABS.length - 1) % TABS.length]); });
$$('#nav .tab').forEach(b => b.onclick = () => go(b.dataset.t));
try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
$('#bTheme').onclick = () => { const t = dark() ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try { localStorage.setItem('tema', t); } catch (e) {} render(); };

/* Tabela ordenável, com busca opcional. cols: {k,label,n,fmt,get}. */
function dtable(el, cols, rows, o = {}) {
  el = typeof el === 'string' ? $(el) : el;
  const st = el._st = el._st || {col: o.sort ?? null, dir: o.dir ?? -1, q: ''};
  if (o.search && !el._search) {
    const i = document.createElement('input'); i.type = 'search'; i.placeholder = 'Buscar…'; i.style.margin = '0 0 8px'; i.setAttribute('aria-label', 'Buscar na tabela');
    el.closest('.scroll, .card')?.insertAdjacentElement(el.closest('.scroll') ? 'beforebegin' : 'afterbegin', i);
    i.oninput = () => { st.q = i.value.toLowerCase(); el._redraw(); }; el._search = i;
  }
  el._redraw = () => {
    let r = rows.slice();
    if (st.q) r = r.filter(x => cols.some(c => String(c.get ? c.get(x) : x[c.k]).toLowerCase().includes(st.q)));
    if (st.col != null) { const c = cols[st.col], g = c.get || (x => x[c.k]);
      r.sort((a, b) => { const x = g(a), y = g(b); if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y) * st.dir; }); }
    el.innerHTML = '<thead><tr>' + cols.map((c, i) => `<th class="s ${c.n ? 'n' : ''}" data-i="${i}" title="Ordenar">${c.label}${st.col === i ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr></thead><tbody>' +
      (r.length ? r.map((x, k) => `<tr data-k="${k}" class="${[o.cls?.(x), o.onRow ? 'pick' : '', o.sel?.(x) ? 'sel' : ''].filter(Boolean).join(' ')}">` + cols.map(c => { const v = c.get ? c.get(x) : x[c.k]; return `<td class="${c.n ? 'n' : ''}">${c.fmt ? c.fmt(v, x) : esc(v)}</td>`; }).join('') + '</tr>').join('') : `<tr><td colspan="${cols.length}" class="empty">Nada encontrado</td></tr>`) + '</tbody>';
    el._rows = r;
  };
  el.onclick = e => { const th = e.target.closest('th.s'); if (th) { const i = +th.dataset.i; st.dir = st.col === i ? -st.dir : (cols[i].n ? -1 : 1); st.col = i; el._redraw(); return; }
    const tr = e.target.closest('tbody tr[data-k]'); if (tr && o.onRow) o.onRow(el._rows[+tr.dataset.k]); };
  el._redraw();
}
function chips(el, items, sel, onToggle) {
  $(el).innerHTML = items.map(([v, l]) => `<button class="chip ${sel.includes(v) ? 'on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('');
  $(el).onclick = e => { const b = e.target.closest('.chip'); if (b) onToggle(b.dataset.v); };
}
function seg(el, val, onPick) { $$(el + ' button').forEach(b => { b.classList.toggle('on', b.dataset.v === val); b.onclick = () => onPick(b.dataset.v); }); }
function fillSelect(el, opts, val, onChange) { const s = $(el), sig = opts.map(o => o[0]).join('|'); if (s._f !== sig) { s.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); s._f = sig; } s.onchange = () => onChange(s.value); s.value = val; }

/* ---------- carga ---------- */
fetch('/api/painel').then(r => { if (!r.ok) throw new Error(r.status === 404 ? 'Dados ainda não coletados. Rode: py -m etl.build' : 'Erro ' + r.status); return r.json(); })
  .then(async d => { D = d; D.auditoria = await fetch('/api/auditoria').then(r => r.ok ? r.json() : null).catch(() => null); $('#loading').remove(); $('#gerado').textContent = 'atualizado em ' + new Date(d.gerado_em).toLocaleDateString('pt-BR'); render(); })
  .catch(e => { $('#loading')?.remove(); const x = $('#err'); x.style.display = 'block'; x.textContent = e.message; });

function render() {
  if (!D) return;
  themeCharts();
  const s = getS(); tab = TABS.includes(s.tab) ? s.tab : 'home';
  $$('#nav .tab').forEach(b => { const on = b.dataset.t === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  $$('main > section').forEach(e => e.classList.toggle('on', e.id === tab));
  document.title = ({home: 'Visão geral', tcu: 'Indicadores TCU', comp: 'Comparativo', iesgo: 'iESGo', lai: 'Acesso à Informação', ouv: 'Ouvidoria', cor: 'Corregedoria', integ: 'Integridade', aud: 'Auditoria Interna'})[tab] + ' · Painel UFSCar';
  ({home, tcu, comp, iesgo, lai, ouv, cor, integ, aud})[tab](s);
}

/* ======================= VISÃO GERAL ======================= */
function home() {
  const K = D.tcu?.comparativo, I = D.tcu?.iesgo, L = D.cgu?.lai, O = D.cgu?.ouvidoria, T = D.tcu?.indicadores_ufscar;
  const cards = [];
  const ie = K?.iesgo?.resumo?.iESGo;
  if (ie) { const f = I.indices.find(x => x.sigla === 'iESGo').faixa; cards.push(kpi('iESGo 2024 (TCU)', pct(ie.ufscar), `${ie.Brasil.posicao}º de ${ie.Brasil.n} universidades federais · média ${pct(ie.Brasil.media)}`, {go: {tab: 'iesgo'}, x: `<span class="tag" style="background:${FAIXA[f]}">${f}</span>`})); }
  const R = K?.resumo?.[K.ano_referencia];
  if (R) for (const [k, l] of [['iqcd', 'Qualificação docente (IQCD)'], ['capes', 'Conceito CAPES médio']]) cards.push(kpi(l, fmt(R[k].ufscar, 2), `${R[k].Brasil.posicao}º de ${R[k].Brasil.n} · média Brasil ${fmt(R[k].Brasil.media, 2)}`, {}));
  const cc = T?.indicadores.find(x => x.codigo === '9.1.2.1.1')?.serie; if (cc) cards.push(kpi('Custo corrente por aluno equivalente', 'R$ ' + fmt(cc['2025'], 0), `2024: R$ ${fmt(cc['2024'], 0)} (série ProPlan)`, {go: {tab: 'tcu'}}));
  if (L?.anos.length) { const u = L.anos.at(-1); cards.push(kpi(`Pedidos LAI ${u.ano}`, fmt(u.ufscar.pedidos, 0), `Tempo médio ${fmt(u.ufscar.tempo_medio_dias)} d (universidades: ${fmt(u.universidades_federais.tempo_medio_dias)} d)`, {go: {tab: 'lai'}})); }
  if (O) { const a = Math.max(...O.linhas.filter(r => r[3] === 0).map(r => r[0])), rs = O.linhas.filter(r => r[3] === 0 && r[0] === a), p = rs.filter(r => r[7] != null), ref = O.referencia[a]?.universidades_federais;
    cards.push(kpi(`Manifestações de Ouvidoria ${a}`, fmt(rs.length, 0), `${fmt(100 * mean(p.map(r => r[7])), 1)}% no prazo (universidades: ${fmt(ref?.pct_no_prazo)}%)`, {go: {tab: 'ouv'}})); }
  $('#homeKpis').innerHTML = cards.join('');
  if (ie) { $('#heroNum').textContent = pct(ie.ufscar); $('#heroLbl').textContent = `iESGo 2024 · ${ie.Brasil.posicao}º de ${ie.Brasil.n} universidades federais`; }
  $('#quick').innerHTML = [['tcu', 'Indicadores TCU'], ['iesgo', 'iESGo'], ['lai', 'Acesso à Informação'], ['ouv', 'Ouvidoria']].map(([t, l]) => `<button data-q="${t}">${l}</button>`).join('');
  $('#quick').onclick = e => { const b = e.target.closest('[data-q]'); if (b) go(b.dataset.q); };
  if (R) {
    const ks = Object.keys(K.metricas).filter(k => R[k]?.Brasil), pc = k => { const g = R[k].Brasil; return g.n > 1 ? 100 * (g.n - g.posicao) / (g.n - 1) : 50; };
    chart('cPerfil', {type: 'bar', data: {labels: ks.map(k => K.metricas[k].nome), datasets: [{data: ks.map(pc), backgroundColor: ks.map(k => pc(k) >= 66 ? C.base : pc(k) >= 33 ? C.sky : C.gray)}]},
      options: {indexAxis: 'y', plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => `Posição ${R[ks[c.dataIndex]].Brasil.posicao}º de ${R[ks[c.dataIndex]].Brasil.n} (percentil ${fmt(c.parsed.x, 0)})`}}}, scales: {x: {min: 0, max: 100}, y: {ticks: {font: {size: 11}}}}}});
  }
  const ins = [];
  if (R) for (const [k, m] of Object.entries(K.metricas)) { const g = R[k]?.Brasil; if (!g || !m.melhor) continue; const t = g.posicao / g.n;
    if (t <= 1 / 3) ins.push([1, `${m.nome}: <b>${g.posicao}º de ${g.n}</b> universidades federais (${fmt(R[k].ufscar, 2)}).`, null]);
    else if (t > 2 / 3) ins.push([-1, `${m.nome}: <b>${g.posicao}º de ${g.n}</b> (${fmt(R[k].ufscar, 2)}; média ${fmt(g.media, 2)}).`, null]); }
  if (I) for (const x of I.indices) { const t = x.posicao_ifes / x.n_ifes; if (!['iESGo', 'iGG', 'iES', 'Lid', 'Estr', 'Cont', 'iGestPessoas', 'iGestTI', 'iGestContrat', 'iGestOrcament'].includes(x.sigla)) continue;
    if (t <= 1 / 3) ins.push([1, `iESGo · ${x.nome}: <b>${x.posicao_ifes}º de ${x.n_ifes}</b> instituições de ensino (${pct(x.ufscar)}).`, {tab: 'iesgo', idx: x.sigla}]);
    else if (t > 2 / 3) ins.push([-1, `iESGo · ${x.nome}: <b>${x.posicao_ifes}º de ${x.n_ifes}</b> instituições de ensino (${pct(x.ufscar)}; média ${pct(x.media_ifes)}).`, {tab: 'iesgo', idx: x.sigla}]); }
  if (L?.anos.length) { const u = L.anos.at(-1); if (u.ufscar.pct_no_prazo != null && u.universidades_federais.pct_no_prazo != null) ins.push([u.ufscar.pct_no_prazo >= u.universidades_federais.pct_no_prazo ? 1 : -1, `LAI ${u.ano}: ${fmt(u.ufscar.pct_no_prazo)}% respondidos no prazo (universidades federais: ${fmt(u.universidades_federais.pct_no_prazo)}%).`, {tab: 'lai'}]); }
  ins.sort((a, b) => b[0] - a[0]);
  $('#insights').innerHTML = ins.length ? ins.map((x, i) => `<div class="insight"><span class="dot" style="background:${x[0] > 0 ? C.ok : C.bad}"></span><span><b>${x[0] > 0 ? 'Destaque' : 'Atenção'}:</b> ${x[1]}${x[2] ? ` <a data-i="${i}">ver</a>` : ''}</span></div>`).join('') : '<div class="empty">Sem dados suficientes.</div>';
  $('#insights').onclick = e => { const a = e.target.closest('a[data-i]'); if (a) go(ins[+a.dataset.i][2].tab, ins[+a.dataset.i][2]); };
}

/* ======================= INDICADORES TCU ======================= */
function tcu(s) {
  const O = D.tcu?.indicadores_ufscar; if (!O) { $('#tcuKpis').innerHTML = '<div class="note">Série não coletada.</div>'; return; }
  const all = [...O.indicadores, ...O.componentes], comp = s.cmp === '1', lista = comp ? all : O.indicadores;
  const cod = all.some(x => x.codigo === s.ind) ? s.ind : '9.1.2.1.1', get = c => all.find(x => x.codigo === c)?.serie || {};
  $('#tcuKpis').innerHTML = [['9.1.2.1.1', 'Custo corrente / aluno equivalente', v => 'R$ ' + fmt(v, 0)], ['9.1.2.2', 'Aluno equivalente / docente equivalente', v => fmt(v, 2)], ['9.1.2.8', 'IQCD', v => fmt(v, 2)], ['9.1.2.7', 'Conceito CAPES', v => fmt(v, 2)]]
    .map(([c, l, f]) => { const x = get(c); return kpi(l, f(x['2025']), `2024: ${f(x['2024'])} · 2009: ${f(x['2009'])}`, {x: delta(x['2025'], x['2024'], c === '9.1.2.1.1', 2) + ' <span class="pos">vs 2024</span>'}); }).join('');
  fillSelect('#selInd', lista.map(x => [x.codigo, x.codigo + ' – ' + x.nome]), cod, v => setS({ind: v}));
  $('#chkIndComp').checked = comp; $('#chkIndComp').onchange = e => setS({cmp: e.target.checked ? '1' : ''});
  const x = all.find(y => y.codigo === cod), anos = Object.keys(x.serie);
  chart('cSerie', {type: 'line', data: {labels: anos, datasets: [{label: x.nome, data: anos.map(a => x.serie[a]), borderColor: C.navy, backgroundColor: C.navy, tension: .2, pointRadius: 3}]}, options: {plugins: {legend: {display: false}, title: {display: true, text: x.codigo + ' – ' + x.nome}}}});
  const A = ['2021', '2022', '2023', '2024', '2025'], cols = [{k: 'codigo', label: 'Código', get: r => r.codigo}, {label: 'Indicador', get: r => r.nome}, ...A.map(a => ({label: a, n: 1, get: r => r.serie[a], fmt: v => fmt(v, 2)}))];
  const opt = {sort: 0, dir: 1, sel: r => r.codigo === cod, onRow: r => setS({ind: r.codigo}), search: true};
  dtable('#tInd', cols, O.indicadores, opt); dtable('#tComp', cols, O.componentes, {...opt, search: false});
  $('#srcTcu').innerHTML = `Fonte: ${src({nome: O.fonte, url: O.url})}. Em 2025 há variações atípicas (ex.: taxa de sucesso na graduação acima de 100% e custo corrente 33% menor); confirme com a ProPlan se houve mudança metodológica antes de interpretar a série.`;
}

/* ======================= COMPARATIVO ======================= */
function comp(s) {
  const K = D.tcu?.comparativo; if (!K?.anos) { $('#compLead').textContent = 'Comparativo não coletado.'; return; }
  const ano = String(K.ano_referencia), R = K.resumo[ano], grp = ['SP', 'Sudeste', 'Brasil'].includes(s.grp) ? s.grp : 'Brasil', M = K.metricas;
  const met = M[s.met] ? s.met : 'iqcd', X = M[s.x] ? s.x : 'aluno_docente', Y = M[s.y] ? s.y : 'iqcd';
  const U = K.universidades[ano], inG = u => grp === 'Brasil' || (grp === 'SP' ? u.uf === 'SP' : u.regiao === 'Sudeste');
  const dest = (s.dest || '').split(',').filter(Boolean), isU = u => u.co_ies === '7';
  $('#compLead').textContent = `Ano-base ${ano} (Censo da Educação Superior). Universidades federais: ${K.grupos.SP.length} em SP (${K.grupos.SP.join(', ')}), ${K.grupos.Sudeste} no Sudeste e ${K.grupos.Brasil} no Brasil.`;
  $('#compNota').innerHTML = '<b>Atenção:</b> ' + K.nota;
  seg('#segGrp', grp, v => setS({grp: v}));
  fillSelect('#selMet', Object.entries(M).map(([k, m]) => [k, m.nome]), met, v => setS({met: v}));
  fillSelect('#selX', Object.entries(M).map(([k, m]) => [k, m.nome]), X, v => setS({x: v}));
  fillSelect('#selY', Object.entries(M).map(([k, m]) => [k, m.nome]), Y, v => setS({y: v}));
  $('#dlUniv').innerHTML = U.map(u => `<option value="${esc(u.sigla)}">${esc(u.nome)}</option>`).join('');
  $('#inDest').onchange = e => { const u = U.find(x => x.sigla.toLowerCase() === e.target.value.trim().toLowerCase()); e.target.value = ''; if (u && !dest.includes(u.sigla)) setS({dest: [...dest, u.sigla].join(',')}); };
  const toggle = sg => setS({dest: (dest.includes(sg) ? dest.filter(d => d !== sg) : [...dest, sg]).join(',')});
  $('#chipsDest').innerHTML = dest.map(d => `<button class="chip on" data-v="${esc(d)}" title="Remover destaque">${esc(d)}<span class="x">✕</span></button>`).join('');
  $('#chipsDest').onclick = e => { const b = e.target.closest('.chip'); if (b) toggle(b.dataset.v); };

  const dec = k => ['mat_grad', 'n_cursos_pos'].includes(k) ? 0 : (['iqcd', 'capes', 'tae_docente'].includes(k) ? 2 : 1);
  const cel = (g, k) => g ? `${fmt(g.media, dec(k))}<div class="pos">mediana ${fmt(g.mediana, dec(k))} · UFSCar ${g.posicao}º/${g.n}</div>` : '—';
  const rows = Object.keys(M).filter(k => R[k]?.ufscar != null).map(k => ({k, ...R[k]}));
  dtable('#tResumo', [{label: 'Indicador', get: r => M[r.k].nome, fmt: (v, r) => `<b title="${esc(M[r.k].descricao)}">${esc(v)}</b><div class="pos">${esc(M[r.k].unidade)}</div>`}, {label: 'UFSCar', n: 1, get: r => r.ufscar, fmt: (v, r) => `<b>${fmt(v, dec(r.k))}</b>`},
    {label: 'São Paulo', n: 1, get: r => r.SP?.media, fmt: (v, r) => cel(r.SP, r.k)}, {label: 'Sudeste', n: 1, get: r => r.Sudeste?.media, fmt: (v, r) => cel(r.Sudeste, r.k)}, {label: 'Brasil', n: 1, get: r => r.Brasil?.media, fmt: (v, r) => cel(r.Brasil, r.k)}],
    rows, {onRow: r => setS({met: r.k, y: r.k}), sel: r => r.k === met});
  setCsv('resumo', 'comparativo_resumo', ['Indicador', 'Unidade', 'UFSCar', 'Média SP', 'Média Sudeste', 'Média Brasil', 'Posição SP', 'Posição Sudeste', 'Posição Brasil'], rows.map(r => [M[r.k].nome, M[r.k].unidade, r.ufscar, r.SP?.media, r.Sudeste?.media, r.Brasil?.media, r.SP?.posicao, r.Sudeste?.posicao, r.Brasil?.posicao]));

  // ranking
  const L = U.filter(inG).filter(u => u[met] != null).sort((a, b) => b[met] - a[met]);
  $('#metDesc').textContent = `${M[met].nome} — ${M[met].descricao} Grupo: ${GR[grp]} (${L.length}). Clique em uma barra para destacar a universidade.`;
  $('#rankBox').style.height = Math.max(300, L.length * 17 + 50) + 'px';
  const colorOf = u => isU(u) ? C.yellow : dest.includes(u.sigla) ? C.teal : C.base;
  chart('cRank', {type: 'bar', data: {labels: L.map(u => u.sigla), datasets: [{data: L.map(u => u[met]), backgroundColor: L.map(colorOf)}]},
    options: {indexAxis: 'y', plugins: {legend: {display: false}, tooltip: {callbacks: {title: i => L[i[0].dataIndex].nome, label: c => `${fmt(c.parsed.x, 2)} ${M[met].unidade}`}}}, scales: {y: {ticks: {font: {size: 11}, autoSkip: false}}}, onClick: (e, el) => el[0] && !isU(L[el[0].index]) && toggle(L[el[0].index].sigla), onHover: (e, el) => e.native.target.style.cursor = el.length ? 'pointer' : 'default'}});
  setCsv('rank', `ranking_${met}_${grp}`, ['Posição', 'Sigla', 'Universidade', 'UF', M[met].nome], L.map((u, i) => [i + 1, u.sigla, u.nome, u.uf, u[met]]));

  // evolução
  const anos = K.anos.map(String), line = (l, c, f, w = 2) => ({label: l, data: anos.map(f), borderColor: c, backgroundColor: c, tension: .2, borderWidth: w, pointRadius: 3});
  chart('cEvol', {type: 'line', data: {labels: anos, datasets: [line('UFSCar', C.navy, a => K.resumo[a]?.[met]?.ufscar, 3), line('Média SP', C.sky, a => K.resumo[a]?.[met]?.SP?.media), line('Média Sudeste', C.teal, a => K.resumo[a]?.[met]?.Sudeste?.media), line('Média Brasil', C.gray, a => K.resumo[a]?.[met]?.Brasil?.media)]}, options: {plugins: {title: {display: true, text: M[met].nome}}}});

  // dispersão
  const Pt = U.filter(inG).filter(u => u[X] != null && u[Y] != null), pts = f => Pt.filter(f).map(u => ({x: u[X], y: u[Y], u}));
  chart('cDisp', {type: 'scatter', data: {datasets: [{label: 'Universidades', data: pts(u => !isU(u) && !dest.includes(u.sigla)), backgroundColor: C.sky, pointRadius: 4}, {label: 'Destacadas', data: pts(u => dest.includes(u.sigla) && !isU(u)), backgroundColor: C.teal, pointRadius: 7}, {label: 'UFSCar', data: pts(isU), backgroundColor: C.yellow, borderColor: C.base, borderWidth: 1.5, pointRadius: 9}]},
    options: {scales: {x: {title: {display: true, text: M[X].nome, font: {size: 11}}}, y: {title: {display: true, text: M[Y].nome, font: {size: 11}}}}, plugins: {tooltip: {callbacks: {label: c => `${c.raw.u.nome}: ${fmt(c.raw.x, 2)} · ${fmt(c.raw.y, 2)}`}}}, onClick: (e, el) => { const u = el[0] && charts.cDisp.data.datasets[el[0].datasetIndex].data[el[0].index].u; if (u && !isU(u)) toggle(u.sigla); }}});

  // iESGo por grupo
  const Ig = K.iesgo;
  if (Ig) { const r = ['iESGo', 'iGG', 'iES'].map(k => ({k, ...Ig.resumo[k]})), nm = {iESGo: 'iESGo (geral)', iGG: 'iGG (governança e gestão)', iES: 'iES (sustentabilidade)'};
    const c2 = g => g ? `${pct(g.media)}<div class="pos">mediana ${pct(g.mediana)} · máx ${pct(g.max)} · UFSCar ${g.posicao}º/${g.n}</div>` : '—';
    dtable('#tIesgoGrp', [{label: 'Índice', get: x => nm[x.k], fmt: v => `<b>${v}</b>`}, {label: 'UFSCar', n: 1, get: x => x.ufscar, fmt: v => `<b>${pct(v)}</b>`}, ...['SP', 'Sudeste', 'Brasil'].map(g => ({label: GR[g], n: 1, get: x => x[g]?.media, fmt: (v, x) => c2(x[g])}))], r, {sort: null});
    $('#iesgoGrpNota').textContent = 'Universidades federais que responderam ao iESGo 2024, cruzadas com o cadastro do INEP para obter UF e região.'; }
  $('#srcComp').innerHTML = 'Fontes: ' + K.fontes.map(src).join(' · ') + (Ig ? ' · ' + src({nome: Ig.fonte, url: Ig.url}) : '') + ' · ' + src({nome: 'ProPlan – Indicadores TCU', url: D.tcu.indicadores_ufscar?.url || '#'});
}
const GR = {SP: 'São Paulo', Sudeste: 'Sudeste', Brasil: 'Brasil'};

/* ======================= iESGo ======================= */
function iesgo(s) {
  const i = D.tcu?.iesgo; if (!i) { $('#iKpis').innerHTML = '<div class="note">iESGo não coletado.</div>'; return; }
  const g = k => i.indices.find(x => x.sigla === k), idx = g(s.idx) ? s.idx : 'iESGo', top = s.top || '15', X = g(idx);
  $('#grupo').textContent = 'Grupo: ' + i.grupo_comparacao;
  $('#iKpis').innerHTML = ['iESGo', 'iGG', 'iES'].map(k => { const x = g(k); return kpi(x.nome, pct(x.ufscar), `Média do grupo ${pct(x.media_ifes)} · ${x.posicao_ifes}º de ${x.n_ifes}`, {x: `<span class="tag" style="background:${FAIXA[x.faixa]}">${x.faixa}</span>`}); }).join('') + kpi('Faixas do TCU', '', i.faixas);
  fillSelect('#selIdx', i.indices.map(x => [x.sigla, `${x.sigla} – ${x.nome}`]), idx, v => setS({idx: v}));
  fillSelect('#selTop', [['15', '15 melhores + UFSCar'], ['30', '30 melhores + UFSCar'], ['all', 'todas']], top, v => setS({top: v}));
  const base = ['iESGo', 'iGG', 'iES', 'iGovPub', 'iGest', 'Lid', 'Estr', 'Cont'].map(g);
  chart('cIdx', {type: 'bar', data: {labels: base.map(x => x.sigla), datasets: [{label: 'UFSCar', data: base.map(x => x.ufscar * 100), backgroundColor: base.map(x => x.sigla === idx ? C.teal : C.yellow)}, {label: 'Média do grupo', data: base.map(x => x.media_ifes * 100), backgroundColor: C.base}, {label: 'Máximo do grupo', data: base.map(x => x.max_ifes * 100), backgroundColor: 'transparent', borderColor: C.sky, borderWidth: 1.5, borderDash: [4, 3]}]},
    options: {scales: {y: {min: 0, max: 100, ticks: {callback: v => v + '%'}}}, onClick: (e, el) => el[0] && setS({idx: base[el[0].index].sigla})}});
  const P = i.pares.filter(p => p.iGG != null && p.iES != null);
  chart('cPares', {type: 'scatter', data: {datasets: [{label: 'Instituições', data: P.filter(p => p.sigla !== 'UFSCar').map(p => ({x: p.iGG * 100, y: p.iES * 100, n: p.sigla})), backgroundColor: C.sky, pointRadius: 3.5}, {label: 'UFSCar', data: P.filter(p => p.sigla === 'UFSCar').map(p => ({x: p.iGG * 100, y: p.iES * 100, n: p.sigla})), backgroundColor: C.yellow, borderColor: C.base, borderWidth: 1.5, pointRadius: 9}]},
    options: {scales: {x: {title: {display: true, text: 'iGG (%)'}, min: 0, max: 100}, y: {title: {display: true, text: 'iES (%)'}, min: 0, max: 100}}, plugins: {tooltip: {callbacks: {label: c => `${c.raw.n}: iGG ${c.raw.x.toFixed(0)}% · iES ${c.raw.y.toFixed(0)}%`}}}}});
  dtable('#tIdx', [{label: 'Índice', get: x => x.sigla, fmt: (v, x) => `${v}<div class="pos">${esc(x.nome)}</div>`}, {label: 'UFSCar', n: 1, get: x => x.ufscar, fmt: v => pct(v)}, {label: 'Faixa', get: x => x.faixa, fmt: v => `<span style="color:${FAIXA[v]};font-weight:600">${v || '—'}</span>`}, {label: 'Média', n: 1, get: x => x.media_ifes, fmt: v => pct(v)}, {label: 'Posição', n: 1, get: x => x.posicao_ifes, fmt: (v, x) => `${v ?? '—'}º/${x.n_ifes}`}],
    i.indices, {sort: null, sel: x => x.sigla === idx, onRow: x => setS({idx: x.sigla})});
  setCsv('idx', 'iesgo_indices', ['Sigla', 'Índice', 'UFSCar', 'Faixa', 'Média grupo', 'Posição', 'N'], i.indices.map(x => [x.sigla, x.nome, x.ufscar, x.faixa, x.media_ifes, x.posicao_ifes, x.n_ifes]));
  const rk = i.pares.filter(p => p[idx] != null).sort((a, b) => b[idx] - a[idx]).map((p, k) => ({...p, pos: k + 1}));
  $('#hRank').textContent = `Ranking · ${X.nome}`;
  const tp = top === 'all' ? rk : rk.filter(r => r.pos <= +top || r.sigla === 'UFSCar');
  $('#topBox').style.height = Math.max(220, tp.length * 17 + 40) + 'px';
  chart('cTop', {type: 'bar', data: {labels: tp.map(r => `${r.pos}º ${r.sigla}`), datasets: [{data: tp.map(r => r[idx] * 100), backgroundColor: tp.map(r => r.sigla === 'UFSCar' ? C.yellow : C.base)}]}, options: {indexAxis: 'y', plugins: {legend: {display: false}, tooltip: {callbacks: {title: i => tp[i[0].dataIndex].nome, label: c => fmt(c.parsed.x) + '%'}}}, scales: {x: {min: 0, max: 100, ticks: {callback: v => v + '%'}}, y: {ticks: {font: {size: 11}, autoSkip: false}}}}});
  dtable('#tRank', [{label: '#', n: 1, get: r => r.pos}, {label: 'Instituição', get: r => r.sigla, fmt: (v, r) => `${esc(v)}<div class="pos">${esc(r.nome)}</div>`}, {label: idx, n: 1, get: r => r[idx], fmt: v => pct(v)}], rk, {sort: 0, dir: 1, cls: r => r.sigla === 'UFSCar' ? 'uf' : '', search: true});
  setCsv('irank', 'iesgo_ranking_' + idx, ['Posição', 'Sigla', 'Instituição', idx], rk.map(r => [r.pos, r.sigla, r.nome, r[idx]]));
  $('#srcIesgo').innerHTML = `Fonte: ${src({nome: i.fonte, url: i.url})}. O TCU publica o resultado como planilha (sem API); <code>etl/build.py</code> baixa e lê a planilha oficial. Autoavaliação das organizações.`;
}

/* ======================= LAI ======================= */
function lai(s) {
  const L = D.cgu?.lai; if (!L?.anos.length) { $('#laiKpis').innerHTML = '<div class="note">LAI não coletado.</div>'; return; }
  const A = L.anos, ano = A.some(a => String(a.ano) === s.ano) ? +s.ano : A.at(-1).ano, u = A.find(a => a.ano === ano), a0 = A.find(a => a.ano === ano - 1), parcial = ano === new Date().getFullYear();
  const anos = A.map(a => a.ano + (a.ano === new Date().getFullYear() ? '*' : ''));
  fillSelect('#selAno', A.map(a => [a.ano, a.ano]), ano, v => setS({ano: v}));
  $('#laiKpis').innerHTML = kpi(`Pedidos ${ano}${parcial ? ' (parcial)' : ''}`, fmt(u.ufscar.pedidos, 0), a0 ? `${a0.ano}: ${fmt(a0.ufscar.pedidos, 0)}` : '') +
    kpi('Tempo médio de resposta', fmt(u.ufscar.tempo_medio_dias) + ' d', `Universidades federais: ${fmt(u.universidades_federais.tempo_medio_dias)} d`, {x: delta(u.ufscar.tempo_medio_dias, u.universidades_federais.tempo_medio_dias, true, 1, ' d')}) +
    kpi('Respondidos no prazo', fmt(u.ufscar.pct_no_prazo) + '%', `Universidades federais: ${fmt(u.universidades_federais.pct_no_prazo)}%`, {x: delta(u.ufscar.pct_no_prazo, u.universidades_federais.pct_no_prazo, false, 1, ' p.p.')}) +
    kpi('Acesso concedido (total/parcial)', fmt(u.ufscar.pct_acesso_concedido) + '%', `Recursos: ${fmt(u.ufscar.recursos, 0)} (${fmt(u.ufscar.recursos_por_100_pedidos)} por 100 pedidos)`);
  const ln = (l, c, f) => ({label: l, data: A.map(f), borderColor: c, backgroundColor: c, tension: .2}), click = {onClick: (e, el) => el[0] && setS({ano: A[el[0].index].ano})};
  chart('cPed', {type: 'bar', data: {labels: anos, datasets: [{data: A.map(a => a.ufscar.pedidos), backgroundColor: A.map(a => a.ano === ano ? C.yellow : C.base)}]}, options: {plugins: {legend: {display: false}}, ...click}});
  chart('cTempo', {type: 'line', data: {labels: anos, datasets: [ln('UFSCar', C.navy, a => a.ufscar.tempo_medio_dias), ln('Universidades federais', C.sky, a => a.universidades_federais.tempo_medio_dias), ln('Executivo federal', C.gray, a => a.executivo_federal.tempo_medio_dias)]}, options: {scales: {y: {beginAtZero: true}}, ...click}});
  chart('cPrazo', {type: 'line', data: {labels: anos, datasets: [ln('UFSCar', C.navy, a => a.ufscar.pct_no_prazo), ln('Universidades federais', C.sky, a => a.universidades_federais.pct_no_prazo), ln('Executivo federal', C.gray, a => a.executivo_federal.pct_no_prazo)]}, options: {scales: {y: {min: 50, max: 100, ticks: {callback: v => v + '%'}}}, ...click}});
  const a = u.ufscar;
  chart('cDec', {type: 'doughnut', data: {labels: a.decisoes.map(x => x[0]), datasets: [{data: a.decisoes.map(x => x[1]), backgroundColor: PALETTE}]}, options: {plugins: {legend: {position: 'right', labels: {boxWidth: 12}}}}});
  chart('cAss', {type: 'bar', data: {labels: a.assuntos.map(x => x[0]), datasets: [{data: a.assuntos.map(x => x[1]), backgroundColor: C.blue}]}, options: {indexAxis: 'y', plugins: {legend: {display: false}}}});
  chart('cMes', {type: 'bar', data: {labels: MESES, datasets: [{data: a.por_mes, backgroundColor: C.navy}]}, options: {plugins: {legend: {display: false}}}});
  $('#srcLai').innerHTML = `Fonte: ${src({nome: L.fonte, url: L.url})}. ${L.nota} O arquivo “filtrado” da CGU exclui pedidos com informação restrita; os totais podem diferir do Painel LAI. *Ano em curso.`;
}

/* ======================= OUVIDORIA ======================= */
const OC = {ano: 0, mes: 1, tipo: 2, ent: 3, ass: 4, den: 5, dias: 6, prazo: 7, concl: 8, atend: 9, sat: 10};
function ouv(s) {
  const O = D.cgu?.ouvidoria; if (!O) { $('#ouvKpis').innerHTML = '<div class="note">Ouvidoria não coletada.</div>'; return; }
  const all = O.linhas, anosAll = [...new Set(all.map(r => r[0]))].sort(), last = anosAll.at(-1);
  const de = anosAll.includes(+s.de) ? +s.de : anosAll[0], ate = anosAll.includes(+s.ate) ? +s.ate : last;
  const ent = ['0', '1', 'all'].includes(s.ent) ? s.ent : '0', form = ['0', '1'].includes(s.form) ? s.form : '', tipos = (s.tipo || '').split(',').filter(Boolean), ass = s.ass || '';
  const T = O.tipos, tipoNome = i => T[i], assNome = i => O.assuntos[i];
  const inR0 = a => a >= Math.min(de, ate) && a <= Math.max(de, ate), okEnt = r => ent === 'all' || String(r[OC.ent]) === ent, okForm = r => form === '' || String(r[OC.den]) === form, okTipo = r => !tipos.length || tipos.includes(T[r[OC.tipo]]), okAss = r => !ass || assNome(r[OC.ass]) === ass, okAno = r => r[0] >= Math.min(de, ate) && r[0] <= Math.max(de, ate);
  const base = all.filter(r => okEnt(r) && okForm(r)), rows = base.filter(r => okTipo(r) && okAss(r) && okAno(r));
  const yOpts = anosAll.map(a => [a, a]); fillSelect('#oDe', yOpts, de, v => setS({de: v})); fillSelect('#oAte', yOpts, ate, v => setS({ate: v}));
  fillSelect('#oEnt', [['0', 'UFSCar'], ['1', 'HU-UFSCar (Ebserh)'], ['all', 'UFSCar + HU']], ent, v => setS({ent: v}));
  fillSelect('#oForm', [['', 'Todos'], ['0', 'Padrão'], ['1', 'Denúncia']], form, v => setS({form: v}));
  const cnt = {}; base.filter(okAno).forEach(r => cnt[T[r[OC.tipo]]] = (cnt[T[r[OC.tipo]]] || 0) + 1);
  chips('#oTipos', T.slice().sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0)).map(t => [t, t]), tipos, t => setS({tipo: (tipos.includes(t) ? tipos.filter(x => x !== t) : [...tipos, t]).join(',')}));
  $('#oAss').innerHTML = ass ? `<button class="chip on" id="oAssX" title="Remover filtro">Assunto: ${esc(ass)}<span class="x">✕</span></button>` : ''; if (ass) $('#oAssX').onclick = () => setS({ass: ''});
  $('#oReset').onclick = () => setS({de: '', ate: '', ent: '', form: '', tipo: '', ass: ''});

  const st = rs => { const d = rs.map(r => r[OC.dias]).filter(x => x != null), p = rs.map(r => r[OC.prazo]).filter(x => x != null), sa = rs.map(r => r[OC.sat]).filter(x => x != null), at = rs.map(r => r[OC.atend]).filter(Boolean);
    return {n: rs.length, tempo: mean(d), prazo: p.length ? 100 * mean(p) : null, sat: mean(sa), nsat: sa.length, atendida: at.length ? 100 * at.filter(x => x === 'S').length / at.length : null, nat: at.length, concl: rs.filter(r => r[OC.concl]).length}; };
  const k = st(rows), anoTxt = de === ate ? de : `${Math.min(de, ate)}–${Math.max(de, ate)}`;
  const ys = anosAll.filter(inR0).map(a => O.referencia[a]?.universidades_federais).filter(Boolean), wm = f => { const v = ys.filter(y => y[f] != null); const n = v.reduce((a, y) => a + y.n, 0); return n ? v.reduce((a, y) => a + y[f] * y.n, 0) / n : null; };
  const ref = ys.length ? {tempo_medio: wm('tempo_medio'), pct_no_prazo: wm('pct_no_prazo'), satisfacao: wm('satisfacao')} : null, rl = de === ate ? `(${ate})` : '(período)';
  $('#ouvKpis').innerHTML = kpi(`Manifestações (${anoTxt})`, fmt(k.n, 0), `${fmt(k.concl, 0)} concluídas`) +
    kpi('Tempo médio de resolução', k.tempo == null ? '—' : fmt(k.tempo) + ' d', ref ? `Universidades federais ${rl}: ${fmt(ref.tempo_medio)} d` : '', {x: ref ? delta(k.tempo, ref.tempo_medio, true, 1, ' d') : ''}) +
    kpi('Respondidas no prazo', k.prazo == null ? '—' : fmt(k.prazo) + '%', ref ? `Universidades federais ${rl}: ${fmt(ref.pct_no_prazo)}%` : '', {x: ref ? delta(k.prazo, ref.pct_no_prazo, false, 1, ' p.p.') : ''}) +
    kpi('Satisfação média (1 a 5)', fmt(k.sat, 2), `${fmt(k.nsat, 0)} avaliações${ref ? ` · universidades: ${fmt(ref.satisfacao, 2)}` : ''}`) +
    kpi('Demanda atendida', k.atendida == null ? '—' : fmt(k.atendida) + '%', `${fmt(k.nat, 0)} respostas à pesquisa`);

  const inR = a => a >= Math.min(de, ate) && a <= Math.max(de, ate);
  const tipoCol = PALETTE.slice(0, 6), cols = T.map((t, i) => tipoCol[i % tipoCol.length]);
  const byAnoTipo = T.map((t, ti) => ({label: t, data: anosAll.map(a => base.filter(r => r[0] === a && r[OC.tipo] === ti && okAss(r)).length), backgroundColor: ctx => (inR(anosAll[ctx.dataIndex]) ? cols[ti] : cols[ti] + '44'), hidden: tipos.length > 0 && !tipos.includes(t)}));
  chart('cOAno', {type: 'bar', data: {labels: anosAll, datasets: byAnoTipo}, options: {scales: {x: {stacked: true}, y: {stacked: true}}, onClick: (e, el) => el[0] && setS({de: anosAll[el[0].index], ate: anosAll[el[0].index]}), plugins: {legend: {labels: {boxWidth: 12}}}}});
  const bt = T.map(t => base.filter(r => okAno(r) && okAss(r) && T[r[OC.tipo]] === t).length);
  chart('cOTipo', {type: 'doughnut', data: {labels: T, datasets: [{data: bt, backgroundColor: cols.map((c, i) => !tipos.length || tipos.includes(T[i]) ? c : c + '33')}]}, options: {plugins: {legend: {position: 'right', labels: {boxWidth: 12}}}, onClick: (e, el) => el[0] && setS({tipo: tipos.includes(T[el[0].index]) && tipos.length === 1 ? '' : T[el[0].index]})}});
  const byAno = f => anosAll.map(a => f(base.filter(r => r[0] === a && okTipo(r) && okAss(r))));
  const refS = (key, f = 'universidades_federais') => anosAll.map(a => O.referencia[a]?.[f]?.[key] ?? null), ln = (l, c, d, w = 2) => ({label: l, data: d, borderColor: c, backgroundColor: c, tension: .2, borderWidth: w, spanGaps: true});
  chart('cOTempo', {type: 'line', data: {labels: anosAll, datasets: [ln('UFSCar (filtros)', C.navy, byAno(rs => st(rs).tempo), 3), ln('Universidades federais', C.sky, refS('tempo_medio')), ln('Executivo federal', C.gray, refS('tempo_medio', 'executivo_federal'))]}, options: {scales: {y: {beginAtZero: true}}}});
  chart('cOPrazo', {type: 'line', data: {labels: anosAll, datasets: [ln('UFSCar (filtros)', C.navy, byAno(rs => st(rs).prazo), 3), ln('Universidades federais', C.sky, refS('pct_no_prazo')), ln('Executivo federal', C.gray, refS('pct_no_prazo', 'executivo_federal'))]}, options: {scales: {y: {min: 50, max: 100, ticks: {callback: v => v + '%'}}}}});
  const ac = {}; base.filter(r => okTipo(r) && okAno(r)).forEach(r => ac[r[OC.ass]] = (ac[r[OC.ass]] || 0) + 1);
  const top = Object.entries(ac).sort((a, b) => b[1] - a[1]).slice(0, 10);
  chart('cOAss', {type: 'bar', data: {labels: top.map(x => assNome(x[0])), datasets: [{data: top.map(x => x[1]), backgroundColor: top.map(x => assNome(x[0]) === ass ? C.yellow : C.sky)}]}, options: {indexAxis: 'y', plugins: {legend: {display: false}}, onClick: (e, el) => el[0] && setS({ass: assNome(top[el[0].index][0]) === ass ? '' : assNome(top[el[0].index][0])})}});
  const mes = MESES.map((m, i) => rows.filter(r => r[OC.mes] === i + 1).length);
  chart('cOMes', {type: 'bar', data: {labels: MESES, datasets: [{data: mes, backgroundColor: C.navy}]}, options: {plugins: {legend: {display: false}}}});
  const B = [['0–5', 0, 5], ['6–10', 6, 10], ['11–20', 11, 20], ['21–30', 21, 30], ['> 30', 31, 1e9]], dd = rows.map(r => r[OC.dias]).filter(x => x != null);
  chart('cODist', {type: 'bar', data: {labels: B.map(b => b[0] + ' d'), datasets: [{data: B.map(b => dd.filter(x => x >= b[1] && x <= b[2]).length), backgroundColor: B.map((b, i) => i < 4 ? C.blue : C.bad)}]}, options: {plugins: {legend: {display: false}}}});
  const sat = [1, 2, 3, 4, 5].map(n => rows.filter(r => r[OC.sat] === n).length), at = {S: 0, P: 0, N: 0}; rows.forEach(r => r[OC.atend] && at[r[OC.atend]]++);
  $('#satNota').textContent = `Demanda atendida: ${at.S} sim · ${at.P} parcialmente · ${at.N} não. Respostas voluntárias (${fmt(k.nsat, 0)} de ${fmt(k.n, 0)} manifestações).`;
  chart('cOSat', {type: 'bar', data: {labels: ['1 · Muito insatisfeito', '2 · Insatisfeito', '3 · Regular', '4 · Satisfeito', '5 · Muito satisfeito'], datasets: [{data: sat, backgroundColor: [C.bad, C.warn, C.gray, C.sky, C.navy]}]}, options: {plugins: {legend: {display: false}}}});

  const ag = {}; base.filter(r => okTipo(r) && okAno(r)).forEach(r => (ag[r[OC.ass]] = ag[r[OC.ass]] || []).push(r));
  const tb = Object.entries(ag).map(([i, rs]) => ({ass: assNome(i), ...st(rs)}));
  $('#tOAssBox').innerHTML = '<div class="scroll"><table id="tOAss"></table></div>';
  dtable('#tOAss', [{label: 'Assunto', get: r => r.ass}, {label: 'Manifestações', n: 1, get: r => r.n, fmt: v => fmt(v, 0)}, {label: '% do total', n: 1, get: r => r.n, fmt: v => fmt(100 * v / Math.max(1, tb.reduce((a, r) => a + r.n, 0))) + '%'}, {label: 'Tempo médio (d)', n: 1, get: r => r.tempo, fmt: v => fmt(v)}, {label: '% no prazo', n: 1, get: r => r.prazo, fmt: v => fmt(v)}],
    tb, {sort: 1, search: true, sel: r => r.ass === ass, onRow: r => setS({ass: r.ass === ass ? '' : r.ass})});
  setCsv('oass', 'ouvidoria_assuntos', ['Assunto', 'Manifestações', 'Tempo médio (dias)', '% no prazo'], tb.map(r => [r.ass, r.n, r.tempo, r.prazo]));
  $('#srcOuv').innerHTML = `Fonte: ${src({nome: O.fonte, url: O.url})}. ${O.nota} Referência: universidades federais = soma dos órgãos “Universidade Federal …”; prazo legal de resposta: 30 dias.`;
}

/* ======================= CORREGEDORIA ======================= */
function cor(s) {
  const R = D.cgu?.correicao; if (!R) { $('#corKpis').innerHTML = '<div class="note">Corregedoria não coletada.</div>'; return; }
  const L = R.linhas, T = R.tipos, F = R.fases, A = R.assuntos, last = R.ano_ultimo_completo;
  const anos = []; for (let a = 2012; a <= last; a++) anos.push(a);
  const de = anos.includes(+s.de) ? +s.de : anos[0], ate = anos.includes(+s.ate) ? +s.ate : last, lo = Math.min(de, ate), hi = Math.max(de, ate), inR = a => a >= lo && a <= hi;
  const tipos = (s.tipo || '').split(',').filter(Boolean), ass = s.ass || '', grp = ['SP', 'Sudeste', 'Brasil'].includes(s.grp) ? s.grp : 'Brasil';
  const MET = {pm: ['Procedimentos por 1.000 servidores', 'proc./1.000'], ipm: ['Investigados por 1.000 servidores', 'invest./1.000'], pj: ['Procedimentos julgados', '%'], dm: ['Tempo médio até o julgamento', 'dias'], n: ['Procedimentos instaurados', 'nº']};
  const met = MET[s.met] ? s.met : 'pm';
  const CO = {ano: 0, tipo: 1, fase: 2, ass: 3, inv: 4, adv: 5, sus: 6, exp: 7, out: 8, dias: 9};
  const okT = r => !tipos.length || tipos.includes(T[r[CO.tipo]]), okA = r => !ass || A[r[CO.ass]] === ass;
  const base = L.filter(r => r[0] <= last), rows = base.filter(r => okT(r) && okA(r) && inR(r[0]));
  const yo = anos.map(a => [a, a]); fillSelect('#rDe', yo, de, v => setS({de: v})); fillSelect('#rAte', yo, ate, v => setS({ate: v}));
  const cnt = {}; base.filter(r => inR(r[0])).forEach(r => cnt[T[r[CO.tipo]]] = (cnt[T[r[CO.tipo]]] || 0) + 1);
  chips('#rTipos', T.slice().sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0)).map(t => [t, t]), tipos, t => setS({tipo: (tipos.includes(t) ? tipos.filter(x => x !== t) : [...tipos, t]).join(',')}));
  $('#rAss').innerHTML = ass ? `<button class="chip on" id="rAssX" title="Remover filtro">Assunto: ${esc(ass)}<span class="x">✕</span></button>` : ''; if (ass) $('#rAssX').onclick = () => setS({ass: ''});
  seg('#rGrp', grp, v => setS({grp: v})); $('#rReset').onclick = () => setS({de: '', ate: '', tipo: '', ass: '', grp: ''});
  $('#corNota').innerHTML = '<b>Atenção:</b> ' + esc(R.nota);

  // universidades: métricas no período
  const inG = u => grp === 'Brasil' || (grp === 'SP' ? u.uf === 'SP' : u.regiao === 'Sudeste');
  const stU = u => { let n = 0, inv = 0, ju = 0, ds = 0, dn = 0; for (const [y, v] of Object.entries(u.anos)) if (inR(+y)) { n += v[0]; inv += v[1]; ju += v[2]; ds += v[3]; dn += v[4]; }
    return {n, pm: 1000 * n / u.servidores, ipm: 1000 * inv / u.servidores, pj: n ? 100 * ju / n : null, dm: dn ? ds / dn : null}; };
  const U = R.universidades.map(u => ({...u, ...stU(u)})), isU = u => u.sigla === 'UFSCAR', uf = U.find(isU);
  const grupos = {SP: U.filter(u => u.uf === 'SP'), Sudeste: U.filter(u => u.regiao === 'Sudeste'), Brasil: U};
  const gm = (g, k) => { const v = g.map(u => u[k]).filter(x => x != null); return v.length ? mean(v) : null; };
  const temDado = (u, k) => u[k] != null && (k === 'n' || k === 'pm' || k === 'ipm' || u.n > 0);

  // KPIs
  const pad = rows.filter(r => T[r[CO.tipo]] === 'PAD').length, jul = rows.filter(r => F[r[CO.fase]] === 'Julgado').length, dd = rows.map(r => r[CO.dias]).filter(x => x != null), sm = k => rows.reduce((a, r) => a + r[CO[k]], 0);
  const tm = mean(dd), ref = gm(U.filter(u => u.n > 0), 'dm'), c = R.ceaf;
  $('#corKpis').innerHTML = kpi(`Procedimentos (${lo === hi ? lo : lo + '–' + hi})`, fmt(rows.length, 0), `${fmt(pad, 0)} PAD · ${fmt(rows.length - pad, 0)} sindicâncias e outros`, {x: uf ? `<span class="pos">${fmt(uf.pm, 1)} por 1.000 servidores · média Brasil ${fmt(gm(U, 'pm'), 1)}</span>` : ''}) +
    kpi('Julgados', rows.length ? fmt(100 * jul / rows.length) + '%' : '—', `${fmt(jul, 0)} de ${fmt(rows.length, 0)}`) +
    kpi('Tempo médio até o julgamento', tm == null ? '—' : fmt(tm, 0) + ' d', ref ? `Universidades federais (período): ${fmt(ref, 0)} d` : '', {x: ref && tm != null ? delta(tm, ref, true, 0, ' d') : ''}) +
    kpi('Investigados', fmt(sm('inv'), 0), `Penalidades: ${sm('adv')} advertências · ${sm('sus')} suspensões · ${sm('exp')} expulsivas · ${sm('out')} outras`) +
    kpi('Expulsões (CEAF)', c ? fmt(c.ufscar, 0) : '—', c ? `Universidades federais: ${fmt(c.universidades_federais, 0)} · cadastro de ${c.data_arquivo}` : 'Cadastro não coletado');

  // figuras
  const byY = anos.map(a => base.filter(r => r[0] === a && okT(r) && okA(r)).length);
  chart('cRAno', {type: 'bar', data: {labels: anos, datasets: [{data: byY, backgroundColor: anos.map(a => inR(a) ? C.base : C.base + '44')}]}, options: {plugins: {legend: {display: false}}, onClick: (e, el) => el[0] && setS({de: anos[el[0].index], ate: anos[el[0].index]})}});
  const perY = (list, a) => { const v = list.map(u => u.anos[a] ? 1000 * u.anos[a][0] / u.servidores : 0); return v.length ? mean(v) : null; };
  const ln = (l, col, f, w = 2) => ({label: l, data: anos.map(f), borderColor: col, backgroundColor: col, tension: .2, borderWidth: w, pointRadius: 3});
  chart('cRMil', {type: 'line', data: {labels: anos, datasets: [ln('UFSCar', C.base, a => perY(R.universidades.filter(isU), a), 3), ln('Média SP', C.sky, a => perY(grupos.SP, a)), ln('Média Sudeste', C.teal, a => perY(grupos.Sudeste, a)), ln('Média Brasil', C.gray, a => perY(grupos.Brasil, a))]}, options: {scales: {y: {beginAtZero: true}}}});
  const bt = T.map((t, i) => base.filter(r => r[CO.tipo] === i && okA(r) && inR(r[0])).length);
  chart('cRTipo', {type: 'doughnut', data: {labels: T, datasets: [{data: bt, backgroundColor: T.map((t, i) => !tipos.length || tipos.includes(t) ? PALETTE[i] : PALETTE[i] + '33')}]}, options: {plugins: {legend: {position: 'right', labels: {boxWidth: 12}}}, onClick: (e, el) => el[0] && setS({tipo: tipos.length === 1 && tipos[0] === T[el[0].index] ? '' : T[el[0].index]})}});
  const bf = F.map((f, i) => rows.filter(r => r[CO.fase] === i).length);
  chart('cRFase', {type: 'doughnut', data: {labels: F, datasets: [{data: bf, backgroundColor: PALETTE.slice(0, F.length)}]}, options: {plugins: {legend: {position: 'right', labels: {boxWidth: 12}}}}});
  const ac = {}; base.filter(r => okT(r) && inR(r[0])).forEach(r => ac[r[CO.ass]] = (ac[r[CO.ass]] || 0) + 1);
  const top = Object.entries(ac).sort((a, b) => b[1] - a[1]);
  chart('cRAss', {type: 'bar', data: {labels: top.map(x => A[x[0]]), datasets: [{data: top.map(x => x[1]), backgroundColor: top.map(x => A[x[0]] === ass ? C.yellow : C.sky)}]}, options: {indexAxis: 'y', plugins: {legend: {display: false}}, scales: {y: {ticks: {autoSkip: false, font: {size: 11}}}}, onClick: (e, el) => el[0] && setS({ass: A[top[el[0].index][0]] === ass ? '' : A[top[el[0].index][0]]})}});

  // comparativo
  fillSelect('#rMet', Object.entries(MET).map(([k, m]) => [k, m[0]]), met, v => setS({met: v}));
  $('#rMetDesc').textContent = `${MET[met][0]} (${MET[met][1]}), ${lo === hi ? lo : lo + '–' + hi}. Grupo: ${GR[grp]}. Universidades sem registros no período ficam de fora dos indicadores de julgamento e tempo.`;
  const Lr = U.filter(inG).filter(u => temDado(u, met)).sort((a, b) => b[met] - a[met]);
  $('#rRankBox').style.height = Math.max(300, Lr.length * 17 + 50) + 'px';
  chart('cRRank', {type: 'bar', data: {labels: Lr.map(u => u.sigla), datasets: [{data: Lr.map(u => u[met]), backgroundColor: Lr.map(u => isU(u) ? C.yellow : C.base)}]}, options: {indexAxis: 'y', plugins: {legend: {display: false}, tooltip: {callbacks: {title: i => Lr[i[0].dataIndex].nome, label: c => `${fmt(c.parsed.x, 1)} ${MET[met][1]}`}}}, scales: {y: {ticks: {font: {size: 11}, autoSkip: false}}}}});
  setCsv('rrank', 'corregedoria_ranking_' + met, ['Posição', 'Sigla', 'Universidade', 'UF', 'Servidores', MET[met][0]], Lr.map((u, i) => [i + 1, u.sigla, u.nome, u.uf, u.servidores, u[met]]));
  const rk = (g, k) => { const l = g.filter(u => temDado(u, k)).sort((a, b) => b[k] - a[k]), p = l.findIndex(isU); return p < 0 ? '—' : `${p + 1}º/${l.length}`; };
  const rowsG = [['pm', 'Procedimentos por 1.000 servidores', 1], ['ipm', 'Investigados por 1.000 servidores', 1], ['pj', 'Procedimentos julgados (%)', 1], ['dm', 'Tempo médio até o julgamento (dias)', 0]].map(([k, l, d]) => ({k, l, d}));
  dtable('#tRGrp', [{label: 'Indicador', get: r => r.l, fmt: v => `<b>${v}</b>`}, {label: 'UFSCar', n: 1, get: r => uf?.[r.k], fmt: (v, r) => `<b>${fmt(v, r.d)}</b>`}, ...['SP', 'Sudeste', 'Brasil'].map(g => ({label: GR[g], n: 1, get: r => gm(grupos[g].filter(u => temDado(u, r.k)), r.k), fmt: (v, r) => `${fmt(v, r.d)}<div class="pos">UFSCar ${rk(grupos[g], r.k)}</div>`}))], rowsG, {sort: null});
  $('#srcCor').innerHTML = `Fontes: ${src({nome: R.fonte, url: R.url})} · ${src({nome: R.fonte_ceaf, url: R.url_ceaf})}. Servidores = docentes + técnicos-administrativos (INEP, Censo 2024) como denominador fixo; as médias dos grupos são médias simples entre universidades.`;
}


/* ======================= INTEGRIDADE (LAI + OUVIDORIA + CORREGEDORIA) ======================= */
function integ() {
  const L = D.cgu?.lai, O = D.cgu?.ouvidoria, R = D.cgu?.correicao;
  if (!L && !O && !R) { $('#integKpis').innerHTML = '<div class="note">Dados da CGU não coletados.</div>'; return; }
  const porAno = {};
  const lin = a => porAno[a] ||= {ano: a};
  (L?.anos || []).forEach(u => Object.assign(lin(u.ano), {lai: u.ufscar.pedidos, laiDias: u.ufscar.tempo_medio_dias}));
  if (O) {
    const g = {}; O.linhas.filter(r => r[3] === 0).forEach(r => (g[r[0]] ||= []).push(r));
    for (const [a, rs] of Object.entries(g)) { const p = rs.filter(r => r[7] != null); Object.assign(lin(+a), {ouv: rs.length, ouvPrazo: p.length ? 100 * mean(p.map(r => r[7])) : null}); }
  }
  if (R) { const last = R.ano_ultimo_completo; for (let a = 2012; a <= last; a++) lin(a).cor = 0; R.linhas.filter(r => r[0] <= last).forEach(r => lin(r[0]).cor++); }
  const anos = Object.values(porAno).sort((a, b) => a.ano - b.ano), ult = k => anos.filter(r => r[k] != null).at(-1);
  const l = ult('lai'), o = ult('ouv'), c = ult('cor');
  $('#integNota').innerHTML = '<b>Atenção:</b> cada frente tem sua própria cobertura de anos; o quadro mostra “—” onde não há dado. A corregedoria usa o extrato público do CGU-PAD, que é incompleto a partir de 2023.';
  $('#integKpis').innerHTML = [
    l && kpi(`Pedidos de acesso à informação ${l.ano}`, fmt(l.lai, 0), `Tempo médio de resposta ${fmt(l.laiDias)} dias`, {go: {tab: 'lai'}}),
    o && kpi(`Manifestações de ouvidoria ${o.ano}`, fmt(o.ouv, 0), o.ouvPrazo != null ? `${fmt(o.ouvPrazo, 1)}% respondidas no prazo` : '', {go: {tab: 'ouv'}}),
    c && kpi(`Procedimentos disciplinares ${c.ano}`, fmt(c.cor, 0), R.ceaf ? `Expulsões no CEAF (UFSCar): ${fmt(R.ceaf.ufscar, 0)}` : '', {go: {tab: 'cor'}}),
  ].filter(Boolean).join('');
  const ln = (lab, col, k) => ({label: lab, data: anos.map(r => r[k] ?? null), borderColor: col, backgroundColor: col, tension: .2, borderWidth: 2, pointRadius: 3, spanGaps: true});
  const sa = anos.filter(r => r.lai != null || r.ouv != null);
  chart('cIntSerie', {type: 'line', data: {labels: sa.map(r => r.ano), datasets: [{...ln('Pedidos LAI', C.base, 'lai'), data: sa.map(r => r.lai ?? null)}, {...ln('Manifestações de ouvidoria', C.sky, 'ouv'), data: sa.map(r => r.ouv ?? null)}]}, options: {scales: {y: {beginAtZero: true}}}});
  const ca = anos.filter(r => r.cor != null);
  chart('cIntCor', {type: 'bar', data: {labels: ca.map(r => r.ano), datasets: [{data: ca.map(r => r.cor), backgroundColor: C.base}]}, options: {plugins: {legend: {display: false}}}});
  dtable('#tInteg', [{label: 'Ano', get: r => r.ano, fmt: v => `<b>${v}</b>`}, {label: 'Pedidos LAI', n: 1, get: r => r.lai, fmt: v => fmt(v, 0)}, {label: 'Tempo médio LAI (d)', n: 1, get: r => r.laiDias, fmt: v => fmt(v)},
    {label: 'Manifestações', n: 1, get: r => r.ouv, fmt: v => fmt(v, 0)}, {label: '% no prazo', n: 1, get: r => r.ouvPrazo, fmt: v => fmt(v)}, {label: 'Procedimentos disciplinares', n: 1, get: r => r.cor, fmt: v => fmt(v, 0)}],
    anos.slice().reverse(), {sort: null});
  // indicadores detalhados (último ano de cada frente)
  const ind = [], add = (fr, nome, ano, v, ref, dec, menor) => ind.push({fr, nome, ano, v, ref, dec, menor});
  const lu = L?.anos.at(-1);
  if (lu) { const u = lu.ufscar, f = lu.universidades_federais;
    add('Acesso à informação', 'Respondidos no prazo (%)', lu.ano, u.pct_no_prazo, f.pct_no_prazo, 1);
    add('Acesso à informação', 'Tempo médio de resposta (dias)', lu.ano, u.tempo_medio_dias, f.tempo_medio_dias, 1, 1);
    add('Acesso à informação', 'Tempo mediano de resposta (dias)', lu.ano, u.tempo_mediano_dias, f.tempo_mediano_dias, 1, 1);
    add('Acesso à informação', 'Pedidos prorrogados (%)', lu.ano, u.pct_prorrogado, null, 1, 1);
    add('Acesso à informação', 'Acesso concedido (%)', lu.ano, u.pct_acesso_concedido, null, 1);
    add('Acesso à informação', 'Recursos por 100 pedidos', lu.ano, u.recursos_por_100_pedidos, null, 1, 1); }
  if (O && o) { const rs = O.linhas.filter(r => r[3] === 0 && r[0] === o.ano), ref = O.referencia[o.ano]?.universidades_federais, n = rs.length, m = k => { const v = rs.map(r => r[k]).filter(x => x != null); return v.length ? mean(v) : null; };
    add('Ouvidoria', 'Tempo médio de resposta (dias)', o.ano, m(6), ref?.tempo_medio, 1, 1);
    add('Ouvidoria', 'Respondidas no prazo (%)', o.ano, m(7) == null ? null : 100 * m(7), ref?.pct_no_prazo, 1);
    add('Ouvidoria', 'Satisfação média (1 a 5)', o.ano, m(10), ref?.satisfacao, 1);
    add('Ouvidoria', 'Manifestações concluídas (%)', o.ano, m(8) == null ? null : 100 * m(8), null, 1);
    add('Ouvidoria', 'Reclamações (% do total)', o.ano, n ? 100 * rs.filter(r => r[2] === 2).length / n : null, null, 1, 1);
    add('Ouvidoria', 'Denúncias (% do total)', o.ano, n ? 100 * rs.filter(r => r[5] === 1).length / n : null, null, 1); }
  if (R && c) { const a = String(c.ano), us = R.universidades, uf = us.find(u => u.sigla === 'UFSCAR'), md = v => { v = v.filter(x => x != null).sort((p, q) => p - q); return v.length ? (v[Math.floor((v.length - 1) / 2)] + v[Math.floor(v.length / 2)]) / 2 : null; };
    if (uf?.anos[a]) { const t = x => x.anos[a], pm = x => t(x) ? 1000 * t(x)[0] / x.servidores : null, pj = x => t(x)?.[0] ? 100 * t(x)[2] / t(x)[0] : null, dm = x => t(x)?.[4] ? t(x)[3] / t(x)[4] : null;
      add('Corregedoria', 'Procedimentos por 1.000 servidores', c.ano, pm(uf), md(us.map(pm)), 0, 1);
      add('Corregedoria', 'Procedimentos julgados (%)', c.ano, pj(uf), md(us.map(pj)), 1);
      add('Corregedoria', 'Tempo médio até o julgamento (dias)', c.ano, dm(uf), md(us.map(dm)), 1, 1); }
    const pr = R.linhas.filter(r => r[0] === c.ano), pad = pr.length ? 100 * pr.filter(r => R.tipos[r[1]] === 'PAD').length / pr.length : null;
    add('Corregedoria', 'Procedimentos que são PAD (%)', c.ano, pad, null, 0);
    add('Corregedoria', 'Penalidades por procedimento', c.ano, pr.length ? pr.reduce((s, r) => s + r[5] + r[6] + r[7] + r[8], 0) / pr.length : null, null, 0); }
  const sit = r => r.v == null || r.ref == null || !r.dec || Math.abs(r.v - r.ref) < 1e-9 ? '—' : ((r.v < r.ref) === !!r.menor ? '<span style="color:var(--ok,#1a7f37)">▲ melhor</span>' : '<span style="color:var(--bad,#c0392b)">▼ pior</span>');
  dtable('#tIntInd', [{label: 'Frente', get: r => r.fr}, {label: 'Indicador', get: r => r.nome, fmt: v => `<b>${v}</b>`}, {label: 'Ano', n: 1, get: r => r.ano}, {label: 'UFSCar', n: 1, get: r => r.v, fmt: v => `<b>${fmt(v, 1)}</b>`},
    {label: 'Universidades federais', n: 1, get: r => r.ref, fmt: v => v == null ? '—' : fmt(v, 1)}, {label: 'Situação', get: r => r.ref == null ? '' : r.v < r.ref ? 'a' : 'b', fmt: (v, r) => sit(r)}], ind, {sort: null, search: true});
  setCsv('integind', 'ufscar_indicadores_detalhados', ['Frente', 'Indicador', 'Ano', 'UFSCar', 'Universidades federais'], ind.map(r => [r.fr, r.nome, r.ano, r.v, r.ref]));
  setCsv('integ', 'ufscar_integridade', ['Ano', 'Pedidos LAI', 'Tempo médio LAI (dias)', 'Manifestações de ouvidoria', '% no prazo', 'Procedimentos disciplinares'], anos.map(r => [r.ano, r.lai, r.laiDias, r.ouv, r.ouvPrazo, r.cor]));
  $('#srcInteg').innerHTML = [L && src({nome: L.fonte, url: L.url}), O && src({nome: O.fonte, url: O.url}), R && src({nome: R.fonte, url: R.url})].filter(Boolean).join(' · ');
}

/* ======================= AUDITORIA INTERNA (RAINT) ======================= */
function aud() {
  const A = D.auditoria; if (!A) { $('#audKpis').innerHTML = '<div class="note">Dados de auditoria não encontrados (data/auditoria.json).</div>'; return; }
  const R = A.relatorios, u = R.at(-1), lab = R.map(r => r.rotulo), pct = r => 100 * r.recomendacoes_implementadas / r.recomendacoes_acompanhadas;
  $('#audNota').innerHTML = '<b>Atenção:</b> ' + esc(A.nota);
  $('#audKpis').innerHTML = kpi(`Recomendações em acompanhamento (${u.rotulo})`, fmt(u.recomendacoes_acompanhadas, 0), `${fmt(u.recomendacoes_implementadas, 0)} implementadas · ${fmt(u.recomendacoes_pendentes, 0)} pendentes (${fmt(pct(u), 1)}% implementadas)`) +
    kpi(`Ações do PAINT ${u.rotulo.slice(0, 4)}`, fmt(u.acoes_previstas, 0), `${u.acoes_realizadas} concluídas · ${u.acoes_em_andamento} em andamento · ${u.acoes_nao_iniciadas} não iniciada`) +
    kpi('Recomendações da CGU acompanhadas', fmt(u.recomendacoes_cgu_acompanhadas, 0), `${u.comunicacoes_tcu} comunicações do TCU no semestre (${u.rotulo})`) +
    kpi(`Capacitação (${u.rotulo})`, fmt(u.horas_capacitacao, 0) + ' h', `Maior valor da série: ${fmt(Math.max(...R.map(r => r.horas_capacitacao)), 0)} h`);
  chart('cAudRec', {type: 'bar', data: {labels: lab, datasets: [{label: 'Implementadas', data: R.map(r => r.recomendacoes_implementadas), backgroundColor: C.base}, {label: 'Pendentes', data: R.map(r => r.recomendacoes_pendentes), backgroundColor: C.gray}]}, options: {scales: {x: {stacked: true}, y: {stacked: true}}}});
  chart('cAudPct', {type: 'line', data: {labels: lab, datasets: [{label: '% implementadas', data: R.map(r => +pct(r).toFixed(1)), borderColor: C.base, backgroundColor: C.base, tension: .2, borderWidth: 2, pointRadius: 4}]}, options: {plugins: {legend: {display: false}}, scales: {y: {beginAtZero: true}}}});
  chart('cAudCap', {type: 'bar', data: {labels: lab, datasets: [{data: R.map(r => r.horas_capacitacao), backgroundColor: C.sky}]}, options: {plugins: {legend: {display: false}}}});
  const ra = R.filter(r => r.acoes_previstas != null);
  chart('cAudAcoes', {type: 'bar', data: {labels: ra.map(r => r.rotulo), datasets: [{label: 'Previstas', data: ra.map(r => r.acoes_previstas), backgroundColor: C.gray}, {label: 'Concluídas', data: ra.map(r => r.acoes_realizadas), backgroundColor: C.base}]}});
  dtable('#tAud', [{label: 'Relatório', get: r => r.rotulo, fmt: (v, r) => `<a href="${r.url}" target="_blank" rel="noopener"><b>${v}</b></a>`}, {label: 'Período', get: r => r.periodo}, {label: 'Ações previstas', n: 1, get: r => r.acoes_previstas, fmt: v => fmt(v, 0)},
    {label: 'Ações concluídas', n: 1, get: r => r.acoes_realizadas, fmt: v => fmt(v, 0)}, {label: 'Recomendações', n: 1, get: r => r.recomendacoes_acompanhadas, fmt: v => fmt(v, 0)}, {label: 'Implementadas', n: 1, get: r => r.recomendacoes_implementadas, fmt: v => fmt(v, 0)},
    {label: '% implementadas', n: 1, get: r => pct(r), fmt: v => fmt(v, 1)}, {label: 'Capacitação (h)', n: 1, get: r => r.horas_capacitacao, fmt: v => fmt(v, 0)}], R, {sort: null});
  setCsv('aud', 'ufscar_auditoria_interna', ['Relatório', 'Período', 'Ações previstas', 'Ações concluídas', 'Recomendações em acompanhamento', 'Implementadas', 'Pendentes', 'Horas de capacitação'], R.map(r => [r.rotulo, r.periodo, r.acoes_previstas, r.acoes_realizadas, r.recomendacoes_acompanhadas, r.recomendacoes_implementadas, r.recomendacoes_pendentes, r.horas_capacitacao]));
  $('#srcAud').innerHTML = `Fonte: ${src({nome: A.fonte, url: A.url})}. Coletado em ${A.coletado_em}.`;
}

