"use strict";
/* Painel da Pós-Graduação UFSCar — dados abertos CAPES.
   Cubos agregados (site/data) -> métricas -> gráficos e tabelas interativos. */

const U = "UFSCAR";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt = (v, d = 0) => v == null || Number.isNaN(v) ? "–" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const sum = (rs, f = "n") => rs.reduce((s, r) => s + (r[f] || 0), 0);
const pct = (a, b) => b ? 100 * a / b : null;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const PEQ = new Set(["e", "da", "de", "do", "das", "dos", "em", "na", "no", "para"]);
const cap = s => (s || "").toLowerCase().replace(/(^|[\s/(-])(\S)(\S*)/g, (m, p, a, r) => PEQ.has(a + r) && p === " " ? m : p + a.toUpperCase() + r);

const D = {}, Y = {}; let ANOS = [];
const S = { tab: "geral", univ: "fed", area: "", grau: "", sem: false, ano: 0, a0: 0, a1: 0,
  metric: "mat", modo: "idx", off: new Set(), sel: [U], rkMetric: "mat", rkModo: "abs",
  busca: "", conc: "", mun: "", vinc: "", ord: "nota", grp: "", incRede: true, nvInd: "mat", nvGrupo: 0, nvNivel: "ME" };
const charts = {};
let memo = new Map();

// ------------------------------------------------------------ carga de dados
const decod = ({ cols, dict, rows }) => rows.map(r => { const o = {}; cols.forEach((c, i) => o[c] = dict?.[c] ? dict[c][r[i]] : r[i]); return o; });
async function carregar() {
  const j = n => fetch(`data/${n}.json`).then(r => r.json());
  const cubos = ["prog", "disc_a", "disc_b", "doc_a", "doc_b"];
  const [meta, ies, serie, prog, q, ...c] = await Promise.all([j("meta"), j("ies"), j("prog_series"), j("ufscar_programas"), j("quadrienal"), ...cubos.map(j)]);
  cubos.forEach((n, i) => { const rs = decod(c[i]); Y[n] = {}; rs.forEach(r => (Y[n][r.ano] ??= []).push(r)); });
  Object.assign(D, { meta, ies, serie, prog });
  D.status = await fetch("data/status.json", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
  D.sites = await fetch("data/ppg_sites.json").then(r => r.ok ? r.json() : null).catch(() => null);
  D.qinfo = q; D.q = q.rows.map(r => Object.fromEntries(q.cols.map((c, i) => [c, r[i]]))); D.redeAssoc = new Set(prog.filter(p => p.rede && p.papel === "associada").map(p => p.cod));
  D.q.forEach(r => r.redeU = D.redeAssoc.has(r.cod)); D.qmap = Object.fromEntries(D.q.map(r => [r.cod, r]));
  ANOS = meta.anos; S.ano = S.a1 = ANOS.at(-1); S.a0 = ANOS[0];
}

// ------------------------------------------------------------------- grupos
function grupos() {
  const fed = S.univ === "fed";
  // linhas rede = "S" são cópias dos programas em rede em que a UFSCar é associada: contam só para a UFSCar
  const isU = r => (r.ies === U || r.ie === U || (r.redeU && S.incRede)) && (r.rede !== "S" || S.incRede);
  const ok = r => r.rede !== "S" && (!fed || r.jur === "FEDERAL") && !(S.sem && isU(r));
  const suf = (fed ? "federais" : "todas as IES") + (S.sem ? ", sem UFSCar" : "");
  return [
    { k: "u", nome: "UFSCar", cor: "--c-u", t: isU },
    { k: "se", nome: `Sudeste (${suf})`, cor: "--c-se", t: r => r.reg === "SUDESTE" && ok(r) },
    { k: "br", nome: `Brasil (${suf})`, cor: "--c-br", t: ok },
  ];
}
const GA = new Set(["prog", "disc_a", "doc_a"]), GR = new Set(["prog", "disc_a", "disc_b", "doc_a"]);
// nível: "MESTRADO"/"DOUTORADO" (acadêmico + profissional) ou ME, MP, DO, DP (um só). Discentes têm um nível;
// programas e docentes têm o(s) nível(is) que o programa oferece, ex.: "MESTRADO/DOUTORADO".
function nivelOk(grau, f) {
  if (!f) return true;
  const t = (grau || "").split("/").map(s => s.trim());
  switch (f) {
    case "MESTRADO": return t.some(x => x.startsWith("MESTRADO"));
    case "DOUTORADO": return t.some(x => x.startsWith("DOUTORADO"));
    case "ME": return t.includes("MESTRADO");
    case "MP": return t.includes("MESTRADO PROFISSIONAL");
    case "DO": return t.includes("DOUTORADO");
    case "DP": return t.includes("DOUTORADO PROFISSIONAL");
  }
  return true;
}
let OV = null; // nível imposto pela aba "Por nível" (sobrepõe o filtro global; "" = todos)
function rows(cube, ano, g, { area = true, grau = true } = {}) {
  const f = OV ?? S.grau;
  return (Y[cube][ano] || []).filter(r => g.t(r) &&
    !(area && S.area && GA.has(cube) && r.ga !== S.area) &&
    !(grau && f && GR.has(cube) && !nivelOk(r.grau, f)));
}

// ----------------------------------------------------------------- métricas
const mk = (t, kind, f, o = {}) => ({ t, kind, f, ga: true, gr: true, dec: 0, suf: "", ...o });
const sit = (g, a, s, o) => sum(rows("disc_a", a, g, o).filter(r => s.includes(r.sit)));
const perm = (g, a) => sum(rows("doc_a", a, g).filter(r => r.cat === "PERMANENTE"));
const docPct = (g, a, f) => { const rs = rows("doc_b", a, g); return pct(sum(rs.filter(f)), sum(rs)); };
const M = {
  prog: mk("Programas", "soma", (g, a) => sum(rows("prog", a, g))),
  mat: mk("Discentes matriculados", "soma", (g, a) => sit(g, a, ["MATRICULADO"])),
  ing: mk("Ingressantes", "soma", (g, a) => sum(rows("disc_a", a, g).filter(r => r.sit === "MATRICULADO" && r.ing === "SIM"))),
  tit: mk("Titulados", "soma", (g, a) => sit(g, a, ["TITULADO"])),
  des: mk("Desligados e abandonos", "soma", (g, a) => sit(g, a, ["DESLIGADO", "ABANDONOU"])),
  doc: mk("Docentes (vínculos)", "soma", (g, a) => sum(rows("doc_a", a, g))),
  perm: mk("Docentes permanentes", "soma", perm),
  razao: mk("Discentes por docente permanente", "taxa", (g, a) => { const p = perm(g, a); return p ? sit(g, a, ["MATRICULADO"]) / p : null; }, { dec: 1 }),
  meses: mk("Tempo médio de titulação (meses)", "taxa", (g, a) => { const t = rows("disc_a", a, g).filter(r => r.sit === "TITULADO"); return sum(t) ? sum(t, "meses") / sum(t) : null; }, { dec: 1 }),
  conc: mk("% de programas com conceito 5 a 7", "taxa", (g, a) => { const rs = rows("prog", a, g).filter(r => /^[3-7]$/.test(r.conc)); return pct(sum(rs.filter(r => r.conc >= "5")), sum(rs)); }, { dec: 1, suf: "%" }),
  concl: mk("Taxa de conclusão: titulados / (titulados + desligados + abandonos)", "taxa", (g, a) => { const t = sit(g, a, ["TITULADO"]); return pct(t, t + sit(g, a, ["DESLIGADO", "ABANDONOU"])); }, { dec: 1, suf: "%" }),
  pdout: mk("% de doutorandos entre os matriculados", "taxa", (g, a) => { const rs = rows("disc_a", a, g, { grau: false }).filter(r => r.sit === "MATRICULADO"); return pct(sum(rs.filter(r => r.grau.includes("DOUTORADO"))), sum(rs)); }, { dec: 1, suf: "%", gr: false }),
  estr: mk("% de discentes estrangeiros", "taxa", (g, a) => { const rs = rows("disc_b", a, g).filter(r => r.sit === "MATRICULADO"); return pct(sum(rs.filter(r => r.nac === "ESTRANGEIRO")), sum(rs)); }, { dec: 1, suf: "%", ga: false, ib: true }),
  dr: mk("% de docentes doutores", "taxa", (g, a) => { const rs = rows("doc_a", a, g); return pct(sum(rs.filter(r => r.dr === "S")), sum(rs)); }, { dec: 1, suf: "%" }),
  dex: mk("% de docentes em dedicação exclusiva", "taxa", (g, a) => { const rs = rows("doc_a", a, g); return pct(sum(rs.filter(r => r.reg_trab.startsWith("DEDICA"))), sum(rs)); }, { dec: 1, suf: "%" }),
  bolsa: mk("% de permanentes com bolsa de produtividade (CNPq)", "taxa", (g, a) => { const rs = rows("doc_b", a, g).filter(r => r.cat === "PERMANENTE"); return pct(sum(rs.filter(r => r.bolsa === "S")), sum(rs)); }, { dec: 1, suf: "%", ga: false, gr: false, ib: true }),
  ext: mk("% de docentes com titulação no exterior", "taxa", (g, a) => docPct(g, a, r => r.ext === "S"), { dec: 1, suf: "%", ga: false, gr: false, ib: true }),
};
const GRUPOS_M = [["Estrutura", ["prog", "mat", "ing", "tit", "des"]], ["Docentes", ["doc", "perm", "razao", "dr", "dex", "bolsa", "ext"]], ["Qualidade e fluxo", ["conc", "meses", "concl", "pdout", "estr"]]];
const fm = (k, v) => v == null ? "–" : fmt(v, M[k].dec) + M[k].suf;

function val(k, g, a) {
  const key = `${k}|${g.k}|${a}`;
  if (!memo.has(key)) memo.set(key, M[k].f(g, a));
  return memo.get(key);
}
const serieDe = (k, g, anos = ANOS) => anos.map(a => val(k, g, a));
const anosRange = () => ANOS.filter(a => a >= S.a0 && a <= S.a1);
const aviso = k => {
  const m = M[k], l = [];
  if (S.area && !m.ga) l.push("área");
  if (S.grau && !m.gr) l.push("nível");
  return l.length ? `<span class="aviso">O filtro de ${l.join(" e ")} não se aplica a este indicador.</span>` : "";
};

// ------------------------------------------------------------------ gráficos
function destruir() { Object.values(charts).forEach(c => c.destroy()); for (const k in charts) delete charts[k]; }
function grafico(id, tipo, labels, datasets, o = {}) {
  const el = document.getElementById(id); if (!el) return;
  Chart.defaults.font.family = '"Open Sans", Roboto, Arial, sans-serif';
  const mut = cssVar("--mut"), grade = cssVar("--line"), dec = o.dec ?? 1, suf = o.suf || "";
  const horiz = o.horizontal;
  const c = new Chart(el, {
    type: tipo, data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: horiz ? "y" : "x",
      interaction: { mode: horiz ? "nearest" : "index", intersect: false },
      plugins: {
        legend: { display: !!o.legend, labels: { color: mut, usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: x => `${x.dataset.label}: ${fmt(typeof x.parsed === 'number' ? x.parsed : horiz ? x.parsed.x : x.parsed.y, dec)}${suf}` } },
      },
      scales: {
        x: { stacked: !!o.stacked, ticks: horiz ? { color: mut, callback: v => fmt(v) + suf } : { color: mut }, grid: { color: grade } },
        y: { stacked: !!o.stacked, beginAtZero: o.zero ?? (tipo === "bar"), ticks: horiz ? { color: mut } : { color: mut, callback: v => fmt(v) + suf }, grid: { color: grade } },
      },
      onClick: o.onClick,
    },
  });
  charts[id] = c;
  if (datasets.every(d => (d.data || []).every(v => v == null || v === 0)))
    el.parentElement.insertAdjacentHTML("beforeend", '<div class="state" style="position:absolute;inset:0">Sem dados para os filtros atuais.</div>');
  return c;
}
const linha = (nome, cor, data, forte) => ({ label: nome, data, borderColor: cor, backgroundColor: cor, borderWidth: forte ? 3.5 : 2, pointRadius: forte ? 3 : 2, pointHoverRadius: 5, tension: .25, spanGaps: true });
const barra = (nome, cor, data) => ({ label: nome, data, backgroundColor: cor, borderRadius: 3 });
const CAT = () => [cssVar("--c-se"), cssVar("--c-br"), cssVar("--c-u"), "#6db3f2", "#0f4a85", "#8aa4c8", "#c9a227", "#5d6877", "#a5c8ea"];
const cores = () => GRUPOS.map(g => cssVar(g.cor));
let GRUPOS = [];

function sparkline(vals, cor) {
  const v = vals.filter(x => x != null); if (v.length < 2) return "";
  const mn = Math.min(...v), mx = Math.max(...v), dx = 100 / (vals.length - 1);
  const pts = vals.map((x, i) => x == null ? null : `${(i * dx).toFixed(1)},${(28 - (mx === mn ? 14 : 26 * (x - mn) / (mx - mn))).toFixed(1)}`).filter(Boolean).join(" ");
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
function baixar(nome, texto, tipo = "text/csv;charset=utf-8") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + texto], { type: tipo })); a.download = nome; a.click(); URL.revokeObjectURL(a.href);
}
const csv = linhas => linhas.map(l => l.map(c => /[;"\n]/.test(c ?? "") ? `"${String(c).replace(/"/g, '""')}"` : (c ?? "")).join(";")).join("\n");

// ------------------------------------------------------------- tabelas (UI)
function tabela(el, cols, linhas, { ordem = 0, desc = false, destaque, aoClicar, classe } = {}) {
  let col = ordem, asc = !desc;
  const draw = () => {
    const ord = col < 0 ? [...linhas] : [...linhas].sort((a, b) => {
      const x = a.v[col], y = b.v[col];
      const r = typeof x === "string" || typeof y === "string" ? String(x ?? "").localeCompare(String(y ?? ""), "pt") : (x ?? -Infinity) - (y ?? -Infinity);
      return asc ? r : -r;
    });
    el.className = classe || "";
    el.innerHTML = `<thead><tr>${cols.map((c, i) => `<th class="${c.t ? "t" : ""}" data-i="${i}">${c.h}${i === col ? (asc ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>` +
      `<tbody>${ord.map((l, n) => `<tr data-id="${esc(l.id ?? n)}" class="${destaque?.(l) ?? ""}">${cols.map((c, i) => `<td class="${c.t ? "t" : ""}">${c.f ? c.f(l.v[i], l) : esc(l.v[i])}</td>`).join("")}</tr>`).join("")}</tbody>`;
    $$("th", el).forEach(th => th.onclick = () => { const i = +th.dataset.i; asc = i === col ? !asc : cols[i].t; col = i; draw(); });
    if (aoClicar) $$("tbody tr", el).forEach(tr => tr.onclick = () => aoClicar(tr.dataset.id));
  };
  draw();
}

// ======================================================================== ABAS
const ABAS = {};

// ---------- Visão geral ----------
const KPIS = ["prog", "mat", "ing", "tit", "perm", "conc", "razao", "meses"];
ABAS.geral = el => {
  const [gu, gs, gb] = GRUPOS, a = S.ano, ant = ANOS[ANOS.indexOf(a) - 1];
  const cards = KPIS.map(k => {
    const v = val(k, gu, a), p = ant ? val(k, gu, ant) : null;
    let d = "";
    if (p != null && v != null) {
      const dif = M[k].kind === "soma" ? pct(v - p, p) : v - p, cl = dif > 0 ? "up" : dif < 0 ? "dn" : "";
      d = `<span class="d ${cl}">${dif > 0 ? "▲" : dif < 0 ? "▼" : "="} ${fmt(Math.abs(dif), 1)}${M[k].kind === "soma" ? "%" : " p."}</span>`;
    }
    return `<button class="kpi" data-k="${k}" title="Ver série histórica"><h3>${M[k].t}</h3>
      <div class="v">${fm(k, v)} ${d}</div>${sparkline(serieDe(k, gu), cssVar("--c-u"))}
      <ul><li><span><i class="dot" style="background:${cssVar("--c-se")}"></i>Sudeste</span><b>${fm(k, val(k, gs, a))}</b></li>
      <li><span><i class="dot" style="background:${cssVar("--c-br")}"></i>Brasil</span><b>${fm(k, val(k, gb, a))}</b></li></ul></button>`;
  }).join("");

  const cresc = k => GRUPOS.map(g => { const v0 = val(k, g, ANOS[0]), v1 = val(k, g, a); return pct(v1 - v0, v0); });
  const [cu, cs, cb] = cresc("mat"), [tu, ts, tb] = cresc("tit");
  const peso = (k, g) => pct(val(k, gu, a), val(k, g, a));
  const qs = i => qStats(qRows(GRUPOS[i]));
  const ins = [
    `Em <b>${a}</b>, a UFSCar tinha <b>${fmt(val("mat", gu, a))}</b> discentes matriculados: <b>${fmt(peso("mat", gs), 1)}%</b> do Sudeste e <b>${fmt(peso("mat", gb), 2)}%</b> do Brasil.`,
    `De ${ANOS[0]} a ${a}, os matriculados da UFSCar variaram <b>${fmt(cu, 1)}%</b> (Sudeste ${fmt(cs, 1)}%, Brasil ${fmt(cb, 1)}%); os titulados, <b>${fmt(tu, 1)}%</b> (Sudeste ${fmt(ts, 1)}%, Brasil ${fmt(tb, 1)}%).`,
    `<b>${fmt(val("conc", gu, a), 1)}%</b> dos programas da UFSCar têm conceito 5 a 7, contra ${fmt(val("conc", gs, a), 1)}% no Sudeste e ${fmt(val("conc", gb, a), 1)}% no Brasil.`,
    `Na Quadrienal (resultado de 05/2026), <b>${fmt(qs(0).c57, 1)}%</b> dos programas da UFSCar ficaram com nota 5 a 7 (Sudeste ${fmt(qs(1).c57, 1)}%, Brasil ${fmt(qs(2).c57, 1)}%).`,
    `São <b>${fmt(val("razao", gu, a), 1)}</b> discentes por docente permanente na UFSCar (Sudeste ${fmt(val("razao", gs, a), 1)}, Brasil ${fmt(val("razao", gb, a), 1)}), e o tempo médio de titulação é de <b>${fmt(val("meses", gu, a), 1)} meses</b>.`,
  ];
  el.innerHTML = `<section class="hero"><div class="hero-text"><span class="tag-hero">Dados abertos CAPES · ${ANOS[0]}–${ANOS.at(-1)}</span>
      <h1>Panorama da pós-graduação stricto sensu da UFSCar em ${a}</h1>
      <p>Programas, discentes, docentes e conceitos comparados com o Sudeste e o Brasil.</p></div>
      <div class="hero-stat"><b>${fmt(val("mat", gu, a))}</b><span>discentes matriculados em ${a}</span></div></section>
    <h2 class="sec">Acesso rápido</h2>
    <div class="quick">${[["serie", "Série histórica"], ["programas", "Programas e conceitos"], ["niveis", "Indicadores por nível"], ["quadrienal", "Avaliação Quadrienal"], ["redes", "Programas em rede"], ["ranking", "Comparar IES"]].map(([t, n]) => `<button data-t="${t}">${n}</button>`).join("")}</div>
    <h2 class="sec">Indicadores de ${a}</h2><p class="sub">Clique em um indicador para abrir a série histórica. A variação (▲▼) compara com ${ant ?? "–"}.</p>
    <div class="kpis">${cards}</div>
    <div class="insights"><ul>${ins.map(i => `<li>${i}</li>`).join("")}</ul></div>
    <div class="grade">
      <article class="card"><h3>Discentes matriculados</h3><p class="sub">índice, ${ANOS[0]} = 100</p><div class="graf"><canvas id="g1"></canvas></div></article>
      <article class="card"><h3>Titulados por ano</h3><p class="sub">índice, ${ANOS[0]} = 100</p><div class="graf"><canvas id="g2"></canvas></div></article>
    </div>`;
  $$(".kpi", el).forEach(b => b.onclick = () => { S.metric = b.dataset.k; ir("serie"); });
  $$(".quick button", el).forEach(b => b.onclick = () => ir(b.dataset.t));
  const idx = k => GRUPOS.map(g => { const s = serieDe(k, g); return linha(g.nome, cssVar(g.cor), s.map(v => s[0] ? 100 * v / s[0] : null), g.k === "u"); });
  grafico("g1", "line", ANOS, idx("mat"), { legend: true }); grafico("g2", "line", ANOS, idx("tit"), { legend: true });
};

// ---------- Série histórica ----------
ABAS.serie = el => {
  const k = S.metric, m = M[k], anos = anosRange(), soma = m.kind === "soma";
  if (!soma && S.modo !== "abs") S.modo = "abs";
  const modos = soma ? [["idx", "Índice (início = 100)"], ["abs", "Valores absolutos"], ["peso", "% do Brasil"]] : [["abs", "Valores"]];
  const vis = GRUPOS.filter(g => !S.off.has(g.k));
  const dados = g => {
    const s = serieDe(k, g, anos);
    if (S.modo === "idx") return s.map(v => s[0] ? 100 * v / s[0] : null);
    if (S.modo === "peso") { const b = serieDe(k, GRUPOS[2], anos); return s.map((v, i) => pct(v, b[i])); }
    return s;
  };
  const fonteUsada = S.modo === "peso" ? vis.filter(g => g.k !== "br") : vis;
  el.innerHTML = `<h2 class="sec">Série histórica comparada</h2>
    <div class="card">
      <div class="controles">
        <label>Indicador<select id="s-met">${GRUPOS_M.map(([t, ks]) => `<optgroup label="${t}">${ks.map(x => `<option value="${x}" ${x === k ? "selected" : ""}>${M[x].t}</option>`).join("")}</optgroup>`).join("")}</select></label>
        <label>Visualização<span class="seg" id="s-modo">${modos.map(([v, t]) => `<button data-v="${v}" class="${v === S.modo ? "on" : ""}">${t}</button>`).join("")}</span></label>
        <label>De<select id="s-a0">${ANOS.map(a => `<option ${a === S.a0 ? "selected" : ""}>${a}</option>`).join("")}</select></label>
        <label>Até<select id="s-a1">${ANOS.map(a => `<option ${a === S.a1 ? "selected" : ""}>${a}</option>`).join("")}</select></label>
      </div>
      ${aviso(k)}
      <div class="leg" id="s-leg">${GRUPOS.map(g => `<button data-k="${g.k}" class="${S.off.has(g.k) ? "off" : ""}"><i class="dot" style="background:${cssVar(g.cor)}"></i>${esc(g.nome)}</button>`).join("")}</div>
      <div class="graf alto"><canvas id="s-g"></canvas></div>
      <div class="acoes"><button class="btn" id="s-csv">Baixar CSV</button><button class="btn" id="s-png">Baixar imagem</button></div>
    </div>
    <h2 class="sec">Variação no período ${anos[0]}–${anos.at(-1)}</h2>
    <div class="kpis" id="s-var"></div>
    <h2 class="sec">Valores por ano</h2>
    <div class="tabela-wrap"><table id="s-tab"></table></div>
    <h2 class="sec">UFSCar em detalhe</h2>
    <div class="grade">
      <article class="card"><h3>Matriculados por grande área</h3><p class="sub">UFSCar, empilhado</p><div class="graf"><canvas id="s-ga"></canvas></div></article>
      <article class="card"><h3>Matriculados por nível</h3><p class="sub">UFSCar, mestrado (acad. + prof.) e doutorado</p><div class="graf"><canvas id="s-nv"></canvas></div></article>
    </div>`;
  const lab = anos.map(String);
  grafico("s-g", "line", lab, fonteUsada.map(g => linha(g.nome, cssVar(g.cor), dados(g), g.k === "u")), { suf: S.modo === "peso" ? "%" : m.suf, dec: S.modo === "abs" ? m.dec : 1, zero: S.modo === "abs" && soma });
  $("#s-met").onchange = e => { S.metric = e.target.value; render(); };
  $$("#s-modo button").forEach(b => b.onclick = () => { S.modo = b.dataset.v; render(); });
  $("#s-a0").onchange = e => { S.a0 = Math.min(+e.target.value, S.a1); render(); };
  $("#s-a1").onchange = e => { S.a1 = Math.max(+e.target.value, S.a0); render(); };
  $$("#s-leg button").forEach(b => b.onclick = () => { S.off.has(b.dataset.k) ? S.off.delete(b.dataset.k) : S.off.add(b.dataset.k); render(); });
  $("#s-csv").onclick = () => baixar(`serie_${k}.csv`, csv([["ano", ...GRUPOS.map(g => g.nome)], ...anos.map(a => [a, ...GRUPOS.map(g => { const v = val(k, g, a); return v == null ? "" : String(+v.toFixed(3)).replace(".", ","); })])]));
  $("#s-png").onclick = () => { const a = document.createElement("a"); a.href = charts["s-g"].toBase64Image(); a.download = `serie_${k}.png`; a.click(); };

  $("#s-var").innerHTML = GRUPOS.map(g => {
    const v0 = val(k, g, anos[0]), v1 = val(k, g, anos.at(-1)), n = anos.length - 1;
    const dif = soma ? pct(v1 - v0, v0) : (v1 ?? 0) - (v0 ?? 0), cg = soma && v0 > 0 && n > 0 ? 100 * ((v1 / v0) ** (1 / n) - 1) : null;
    return `<div class="kpi" style="cursor:default"><h3><i class="dot" style="background:${cssVar(g.cor)}"></i>${esc(g.nome)}</h3>
      <div class="v">${soma ? fmt(dif, 1) + "%" : (dif > 0 ? "+" : "") + fmt(dif, m.dec) + (m.suf ? " p.p." : "")}</div>
      <ul><li><span>${anos[0]}</span><b>${fm(k, v0)}</b></li><li><span>${anos.at(-1)}</span><b>${fm(k, v1)}</b></li>${cg != null ? `<li><span>Crescimento médio anual</span><b>${fmt(cg, 2)}%</b></li>` : ""}</ul></div>`;
  }).join("");
  tabela($("#s-tab"), [{ h: "Ano" }, ...GRUPOS.map(g => ({ h: g.nome, f: v => fm(k, v) }))],
    anos.map(a => ({ id: a, v: [a, ...GRUPOS.map(g => val(k, g, a))] })), { ordem: 0, desc: true });

  const gu = GRUPOS[0], gas = [...new Set(Y.disc_a[S.ano].filter(r => gu.t(r)).map(r => r.ga))].sort();
  const pal = CAT();
  grafico("s-ga", "bar", lab, gas.map((ga, i) => barra(cap(ga), pal[i % pal.length], anos.map(a => sum(rows("disc_a", a, gu, { area: false }).filter(r => r.sit === "MATRICULADO" && r.ga === ga))))), { stacked: true, dec: 0, legend: true });
  const nv = f => anos.map(a => sum(rows("disc_a", a, gu, { grau: false }).filter(r => r.sit === "MATRICULADO" && f(r.grau))));
  grafico("s-nv", "bar", lab, [barra("Mestrado", cssVar("--c-se"), nv(g => g.includes("MESTRADO"))), barra("Doutorado", cssVar("--c-u"), nv(g => g.includes("DOUTORADO")))], { stacked: true, dec: 0, legend: true });
};

// ---------- helpers de cartões ----------
function cartaoSerie(id, k, titulo, sub) {
  return `<article class="card"><h3>${titulo ?? M[k].t}</h3><p class="sub">${sub ?? "série histórica"}</p>${aviso(k)}<div class="graf"><canvas id="${id}"></canvas></div></article>`;
}
function desenhaSerie(id, k) {
  const anos = anosRange();
  grafico(id, "line", anos.map(String), GRUPOS.map(g => linha(g.nome, cssVar(g.cor), serieDe(k, g, anos), g.k === "u")), { suf: M[k].suf, dec: M[k].dec, legend: true });
}
const ordemFaixa = c => { const m = (c || "").match(/\d+/); return m ? +m[0] : 999; };
function distribuicao(id, cube, filtro, campo, { ordem, rotulo = cap, topo, semArea } = {}) {
  const a = S.ano; let cats = new Set(), mapa = GRUPOS.map(g => {
    const rs = rows(cube, a, g, { area: !semArea }).filter(filtro), t = sum(rs), m = {};
    rs.forEach(r => { m[r[campo]] = (m[r[campo]] || 0) + r.n; cats.add(r[campo]); });
    return { g, m, t };
  });
  cats = [...cats]; if (ordem) cats.sort((x, y) => ordem(x) - ordem(y));
  else cats.sort((x, y) => (mapa[0].m[y] || 0) - (mapa[0].m[x] || 0) || (mapa[2].m[y] || 0) - (mapa[2].m[x] || 0));
  if (topo) cats = cats.slice(0, topo);
  grafico(id, "bar", cats.map(rotulo), mapa.map(({ g, m, t }) => barra(g.nome, cssVar(g.cor), cats.map(c => pct(m[c] || 0, t)))), { suf: "%", legend: true, horizontal: !!topo });
}

// ---------- Discentes ----------
ABAS.discentes = el => {
  el.innerHTML = `<h2 class="sec">Perfil e fluxo dos discentes</h2><p class="sub">Ano de referência: ${S.ano}. As séries respeitam o período escolhido na aba Série histórica (${S.a0}–${S.a1}).</p>
    <div class="grade">${cartaoSerie("d1", "mat")}${cartaoSerie("d2", "ing")}
    <article class="card"><h3>UFSCar: ingressantes, titulados e saídas</h3><p class="sub">valores absolutos por ano</p><div class="graf"><canvas id="d3"></canvas></div></article>
    ${cartaoSerie("d4", "concl")}${cartaoSerie("d5", "pdout")}${cartaoSerie("d6", "meses")}
    <article class="card"><h3>Faixa etária dos matriculados</h3><p class="sub">% em ${S.ano}</p>${aviso("estr")}<div class="graf"><canvas id="d7"></canvas></div></article>
    <article class="card"><h3>Distribuição por grande área</h3><p class="sub">% dos matriculados em ${S.ano}, ignora o filtro de área</p><div class="graf alto"><canvas id="d8"></canvas></div></article>
    ${cartaoSerie("d9", "estr")}
    </div>`;
  ["mat", "ing", "concl", "pdout", "meses", "estr"].forEach((k, i) => desenhaSerie(["d1", "d2", "d4", "d5", "d6", "d9"][i], k));
  const anos = anosRange(), gu = GRUPOS[0];
  grafico("d3", "bar", anos.map(String), [barra("Ingressantes", cssVar("--c-se"), serieDe("ing", gu, anos)), barra("Titulados", "#2da44e", serieDe("tit", gu, anos)), barra("Desligados e abandonos", cssVar("--bad"), serieDe("des", gu, anos))], { dec: 0, legend: true });
  distribuicao("d7", "disc_b", r => r.sit === "MATRICULADO", "faixa", { ordem: ordemFaixa, rotulo: s => s.replace(" ANOS", "").replace("A", "a").toLowerCase() });
  distribuicao("d8", "disc_a", r => r.sit === "MATRICULADO", "ga", { topo: 9, semArea: true });
};

// ---------- Docentes ----------
ABAS.docentes = el => {
  el.innerHTML = `<h2 class="sec">Corpo docente</h2><p class="sub">Docentes são contados por vínculo com programa (quem atua em dois programas conta duas vezes). O filtro de nível vale para os programas que oferecem o nível (docentes de programas com mestrado, doutorado etc.); bolsa de produtividade e titulação no exterior não têm esse recorte.</p>
    <div class="grade">${cartaoSerie("p1", "perm")}${cartaoSerie("p2", "razao")}
    <article class="card"><h3>UFSCar: docentes por categoria</h3><p class="sub">vínculos, empilhado</p><div class="graf"><canvas id="p3"></canvas></div></article>
    ${cartaoSerie("p4", "dr")}${cartaoSerie("p5", "dex")}${cartaoSerie("p6", "bolsa")}${cartaoSerie("p7", "ext")}
    <article class="card"><h3>Faixa etária dos docentes</h3><p class="sub">% em ${S.ano}</p><div class="graf"><canvas id="p8"></canvas></div></article>
    <article class="card"><h3>Categoria dos docentes</h3><p class="sub">% em ${S.ano}</p><div class="graf"><canvas id="p9"></canvas></div></article></div>`;
  ["perm", "razao", "dr", "dex", "bolsa", "ext"].forEach((k, i) => desenhaSerie(["p1", "p2", "p4", "p5", "p6", "p7"][i], k));
  const anos = anosRange(), gu = GRUPOS[0], cor = ["--c-u", "--c-se", "--c-br"];
  grafico("p3", "bar", anos.map(String), ["PERMANENTE", "COLABORADOR", "VISITANTE"].map((c, i) => barra(cap(c), cssVar(cor[i]), anos.map(a => sum(rows("doc_a", a, gu).filter(r => r.cat === c))))), { stacked: true, dec: 0, legend: true });
  distribuicao("p8", "doc_b", () => true, "faixa", { ordem: ordemFaixa, rotulo: s => s.replace(" ANOS", "").replace("A", "a").toLowerCase() });
  distribuicao("p9", "doc_a", () => true, "cat");
};

// ---------- Programas (UFSCar) ----------
let PROGS = null;
function programas() {
  if (PROGS) return PROGS;
  PROGS = {};
  D.prog.forEach(r => { (PROGS[r.cod] ??= { cod: r.cod, anos: {} }).anos[r.ano] = r; });
  Object.values(PROGS).forEach(p => { const u = p.anos[Math.max(...Object.keys(p.anos))]; Object.assign(p, { nome: u.nome, rede: Object.values(p.anos).some(x => x.rede), papel: u.papel, ultimo: u }); });
  return PROGS;
}
const CORC = { "7": "#be185d", "6": "#7c3aed", "5": "#2563eb", "4": "#38a1db", "3": "#94a3b8", "2": "#b08968", "1": "#b08968", A: "#0d9488" };
const hc = c => `<i class="hc" style="background:${CORC[c] || "#94a3b8"}">${esc(c)}</i>`;
const campusDe = m => /BURI/i.test(m || "") ? "Lagoa do Sino (Buri)" : cap(m);
const siteDe = cod => { const s = D.sites?.sites?.[cod]; return s ? { url: s.url, geral: s.status === "pagina_geral" } : { url: D.sites?.geral || "https://www.propg.ufscar.br/pt-br/pos-na-ufscar/programas", geral: true }; };
const grauOk = g => nivelOk(g, S.grau);
const areaOk = g => !S.area || g === S.area;

ABAS.programas = el => {
  const A = S.ano, todos = Object.values(programas());
  const notaQ = p => D.qmap[p.cod]?.nota ?? null;
  const base = todos.filter(p => p.anos[A] && areaOk(p.anos[A].ga) && grauOk(p.anos[A].grau));
  const sede = p => p.anos[A].papel === "sede";
  const lista = base.filter(p => {
    const r = p.anos[A], n = notaQ(p);
    return (!S.busca || r.nome.toLowerCase().includes(S.busca.toLowerCase())) &&
      (!S.conc || (S.conc === "sem" ? n == null : String(n) === S.conc)) &&
      (!S.vinc || (S.vinc === "sede" ? sede(p) : !sede(p))) &&
      (!S.mun || (S.mun === "__rede" ? !sede(p) : sede(p) && campusDe(r.mun) === S.mun));
  });
  const ser = (p, k) => D.serie[p.cod]?.[A]?.[k] ?? null;
  const ord = {
    nota: (a, b) => (notaQ(b) ?? -1) - (notaQ(a) ?? -1) || a.nome.localeCompare(b.nome, "pt"),
    nome: (a, b) => a.nome.localeCompare(b.nome, "pt"),
    mat: (a, b) => (ser(b, "mat") ?? -1) - (ser(a, "mat") ?? -1),
    tit: (a, b) => (ser(b, "tit") ?? -1) - (ser(a, "tit") ?? -1),
  }[S.ord];
  lista.sort(ord);
  const nSede = base.filter(sede).length, nRede = base.length - nSede;
  const dist = [7, 6, 5, 4, 3].map(n => [n, base.filter(p => notaQ(p) === n).length]);
  const semNota = base.filter(p => notaQ(p) == null).length;
  const campi = {}; base.filter(sede).forEach(p => { const c = campusDe(p.anos[A].mun); campi[c] = (campi[c] || 0) + 1; });
  const campiOrd = Object.entries(campi).sort((x, y) => y[1] - x[1]);

  const card = p => {
    const r = p.anos[A], n = notaQ(p), q = D.qmap[p.cod], ant = q && /^[1-7]$/.test(q.ant) ? +q.ant : null;
    const dif = n != null && ant != null ? n - ant : null;
    const mat = ser(p, "mat"), tit = ser(p, "tit"), perm = ser(p, "perm");
    const rede = !sede(p);
    const st = siteDe(p.cod);
    return `<article class="ppg">
      <div class="ppg-top"><span class="nota" style="background:${n != null ? CORC[n] : "var(--line)"};${n == null ? "color:var(--mut)" : ""}" title="Conceito CAPES 2025 (Quadrienal)">${n ?? "–"}</span>
        <div><h3><a class="ppg-link" href="${esc(st.url)}" target="_blank" rel="noopener" title="${st.geral ? "Abrir a página dos programas da UFSCar (ProPG)" : "Abrir o site do programa em ufscar.br"}">${esc(cap(r.nome))}</a></h3><small>${esc(cap(r.area || r.ga))} · ${esc(r.grau.replace("MESTRADO PROFISSIONAL", "Mestrado prof.").replace("DOUTORADO PROFISSIONAL", "Doutorado prof.").replace("MESTRADO/DOUTORADO", "Mestrado e doutorado").replace(/^MESTRADO$/, "Mestrado").replace(/^DOUTORADO$/, "Doutorado"))}</small></div></div>
      <div class="ppg-tags"><span class="tag ${rede ? "assoc" : "sede"}">${rede ? "Rede · UFSCar associada" : "UFSCar" + (r.rede ? " · sede de rede" : "")}</span><span class="tag">${esc(rede ? "Coord.: " + r.ies : campusDe(r.mun))}</span></div>
      <div class="ppg-ref"><span><b>Conceito 2025:</b> ${n ?? "sem nota"}${dif != null ? ` <span class="d ${dif > 0 ? "up" : dif < 0 ? "dn" : ""}">${dif > 0 ? "▲ +" : dif < 0 ? "▼ " : "= "}${dif}</span>` : ""}${q?.desat ? ' <span class="tag">doutorado a desativar</span>' : ""}</span>
        <span class="mut">${A}: ${hc(r.conc)}${ant != null ? ` · anterior ${ant}` : ""}</span></div>
      <div class="nums"><div><b>${fmt(mat)}</b><span>matric.</span></div><div><b>${fmt(tit)}</b><span>titulados</span></div><div><b>${fmt(perm)}</b><span>docentes perm.</span></div></div>
      ${sparkline(ANOS.map(a => D.serie[p.cod]?.[a]?.mat ?? null), cssVar("--c-se"))}
      ${rede ? '<div class="mut" style="font-size:11px">Números da rede inteira</div>' : ""}
      <div class="ppg-rodape"><span class="ppg-site">${st.geral ? "Página dos programas (ProPG) ↗" : "Site do programa ↗"}</span><button class="ppg-traj" data-c="${p.cod}" title="Ver a trajetória do programa">Trajetória</button></div></article>`;
  };
  const grupos2 = {};
  lista.forEach(p => { const r = p.anos[A], k = S.grp === "area" ? cap(r.ga) : S.grp === "nota" ? (notaQ(p) != null ? "Conceito " + notaQ(p) : "Sem nota na Quadrienal") : ""; (grupos2[k] ??= []).push(p); });
  const chaves = Object.keys(grupos2).sort((a, b) => S.grp === "nota" ? b.localeCompare(a) : a.localeCompare(b, "pt"));
  const corpo = chaves.map(k => `${k ? `<h2 class="sec">${esc(k)} <span class="sub" style="display:inline">(${grupos2[k].length})</span></h2>` : ""}<div class="ppg-grid">${grupos2[k].map(card).join("")}</div>`).join("") || '<p class="sub">Nenhum programa com os filtros atuais.</p>';

  el.innerHTML = `<h2 class="sec">Programas de pós-graduação da UFSCar</h2>
    <p class="sub">Referência: <b>Conceito CAPES 2025</b> (Avaliação Quadrienal, resultado de 05/2026). Em <b>${A}</b> são <b>${base.length}</b> programas: <b>${nSede}</b> da UFSCar e <b>${nRede}</b> em rede com a UFSCar associada.${semNota ? ` ${semNota} sem nota na planilha da Quadrienal.` : ""} Nos programas em rede, matriculados, titulados e docentes são da rede inteira. Os totais da UFSCar somam os 4 programas em rede.</p>
    <div class="chips" style="margin-bottom:10px">${dist.map(([n, c]) => `<button class="chip ${S.conc === String(n) ? "on" : ""}" data-n="${n}"><i class="dot" style="background:${CORC[n]}"></i>Conceito ${n}: ${c}</button>`).join("")}${semNota ? `<button class="chip ${S.conc === "sem" ? "on" : ""}" data-n="sem">Sem nota: ${semNota}</button>` : ""}</div>
    <div class="campi" role="group" aria-label="Filtrar por campus"><span class="campi-t">Campus</span>
      <button class="chip ${!S.mun ? "on" : ""}" data-m="">Todos (${base.length})</button>
      ${campiOrd.map(([c, n]) => `<button class="chip ${S.mun === c ? "on" : ""}" data-m="${esc(c)}">${esc(c)} (${n})</button>`).join("")}
      ${nRede ? `<button class="chip ${S.mun === "__rede" ? "on" : ""}" data-m="__rede">Em rede, outras IES (${nRede})</button>` : ""}</div>
    <div class="controles">
      <label>Ano<select id="pg-ano">${ANOS.map(a => `<option ${a === A ? "selected" : ""}>${a}</option>`).join("")}</select></label>
      <label>Buscar<input type="search" id="pg-q" placeholder="nome do programa" value="${esc(S.busca)}"></label>
      <label>Vínculo<select id="pg-v"><option value="">Todos</option><option value="sede" ${S.vinc === "sede" ? "selected" : ""}>UFSCar (${nSede})</option><option value="rede" ${S.vinc === "rede" ? "selected" : ""}>Em rede, associada (${nRede})</option></select></label>
      <label>Ordenar por<select id="pg-o">${[["nota", "Conceito 2025"], ["nome", "Nome"], ["mat", "Matriculados"], ["tit", "Titulados"]].map(([v, t]) => `<option value="${v}" ${S.ord === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Agrupar por<select id="pg-g">${[["", "Sem agrupamento"], ["area", "Grande área"], ["nota", "Conceito 2025"]].map(([v, t]) => `<option value="${v}" ${S.grp === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <button class="btn" id="pg-csv">Baixar CSV</button>
    </div>
    ${corpo}
    <h2 class="sec">Evolução dos conceitos CAPES</h2><p class="sub">Conceito de cada programa por ano; a última coluna é o Conceito 2025 (A = programa novo ainda sem avaliação plena).</p>
    <div class="tabela-wrap"><table id="pg-heat"></table></div>
    <div class="grade" style="margin-top:14px">
      <article class="card"><h3>Conceito 2025 dos programas da UFSCar</h3><p class="sub">% dos programas listados, comparado com Sudeste e Brasil</p><div class="graf"><canvas id="pg-g1"></canvas></div></article>
      <article class="card"><h3>Programas da UFSCar por campus</h3><p class="sub">${A}, só programas da UFSCar</p><div class="graf"><canvas id="pg-g2"></canvas></div></article>
    </div>`;

  $$(".ppg-traj", el).forEach(b => b.onclick = e => { e.stopPropagation(); abrirPrograma(b.dataset.c); });
  $$(".chips .chip", el).forEach(b => b.onclick = () => { S.conc = S.conc === b.dataset.n ? "" : b.dataset.n; render(); });
  $$(".campi .chip", el).forEach(b => b.onclick = () => { S.mun = b.dataset.m; render(); });
  $("#pg-ano").onchange = e => { S.ano = +e.target.value; $("#f-ano").value = S.ano; render(); };
  $("#pg-q").oninput = e => { S.busca = e.target.value; const pos = e.target.selectionStart; render(); const q = $("#pg-q"); q.focus(); q.setSelectionRange(pos, pos); };
  [["#pg-v", "vinc"], ["#pg-o", "ord"], ["#pg-g", "grp"]].forEach(([id, k]) => $(id).onchange = e => { S[k] = e.target.value; render(); });
  $("#pg-csv").onclick = () => baixar(`programas_ufscar_${A}.csv`, csv([["codigo", "programa", "vinculo", "grande_area", "nivel", "municipio_ou_coordenacao", "conceito_2025", `conceito_${A}`, "matriculados", "titulados", "docentes_permanentes"],
    ...lista.map(p => { const r = p.anos[A]; return [p.cod, r.nome, sede(p) ? "UFSCar" : "Rede (associada)", r.ga, r.grau, sede(p) ? campusDe(r.mun) : r.ies, notaQ(p) ?? "", r.conc, ser(p, "mat") ?? "", ser(p, "tit") ?? "", ser(p, "perm") ?? ""]; })]));

  const H = todos.filter(p => areaOk(p.ultimo.ga) && grauOk(p.ultimo.grau)).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  $("#pg-heat").className = "heat";
  $("#pg-heat").innerHTML = `<thead><tr><th class="t">Programa</th>${ANOS.map(a => `<th>${String(a).slice(2)}</th>`).join("")}<th title="Conceito CAPES 2025 (Quadrienal)">2025</th></tr></thead><tbody>` +
    H.map(p => `<tr data-id="${p.cod}"><td title="${esc(p.nome)}">${esc(cap(p.nome))}${p.papel === "sede" ? "" : ' <span class="tag assoc">rede</span>'}</td>${ANOS.map(a => { const r = p.anos[a]; return `<td title="${a}: ${r ? "conceito " + r.conc : "sem registro"}">${r ? hc(r.conc) : ""}</td>`; }).join("")}<td title="Conceito CAPES 2025">${notaQ(p) != null ? hc(String(notaQ(p))) : ""}</td></tr>`).join("") + "</tbody>";
  $$("#pg-heat tbody tr").forEach(tr => tr.onclick = () => abrirPrograma(tr.dataset.id));

  const propios = base.filter(sede), gU = GRUPOS[0];
  const cs = [7, 6, 5, 4, 3];
  const qr = GRUPOS.map(g => qRows(g, { grau: false }));
  grafico("pg-g1", "bar", cs.map(c => "Nota " + c), GRUPOS.map((g, i) => barra(i === 0 ? "UFSCar (programas da UFSCar)" : g.nome, cssVar(g.cor), cs.map(c => pct(qr[i].filter(r => r.nota === c).length, qr[i].length)))), { suf: "%", legend: true });
  const porMun = {}; propios.forEach(p => { const c = campusDe(p.anos[A].mun); porMun[c] = (porMun[c] || 0) + 1; });
  const ms = Object.entries(porMun).sort((a, b) => b[1] - a[1]);
  grafico("pg-g2", "doughnut", ms.map(m => m[0]), [{ data: ms.map(m => m[1]), backgroundColor: CAT(), borderWidth: 0 }], { legend: true, dec: 0 });
  charts["pg-g2"].options.scales = {}; charts["pg-g2"].update();
};

function abrirPrograma(cod) {
  const p = programas()[cod]; if (!p) return;
  const ser = D.serie[cod] || {}, u = p.ultimo, anosP = ANOS.filter(a => p.anos[a] || ser[a]), rede = p.rede;
  const v = (a, k) => ser[a]?.[k] ?? null;
  const ref = p.anos[S.ano] || u;
  $("#m-corpo").innerHTML = `<h2>${esc(cap(p.nome))}</h2>
    <p><a class="btn" style="text-decoration:none;display:inline-block" href="${esc(siteDe(cod).url)}" target="_blank" rel="noopener">${siteDe(cod).geral ? "Página dos programas da UFSCar ↗" : "Site do programa ↗"}</a></p>
    <p><span class="tag ${p.papel === "sede" ? "sede" : "assoc"}">${p.papel === "sede" ? "UFSCar é a sede" : "UFSCar é associada"}</span> ${rede ? '<span class="tag">Programa em rede</span>' : ""}
      <span class="tag">${esc(cap(ref.grau))}</span> <span class="tag">${esc(cap(ref.ga))}</span> <span class="tag">${esc(cap(ref.mun))}</span> ${u.inicio ? `<span class="tag">Início ${esc(u.inicio)}</span>` : ""}</p>
    ${rede ? `<p class="sub">Coordenação: <b>${esc(u.ies)}</b>${u.associadas.length ? ` · Associadas: ${esc(u.associadas.join(", "))}` : ""}. Os números abaixo cobrem a rede inteira, não só a UFSCar.</p>` : ""}
    <div class="tl">${ANOS.map(a => `<i style="background:${p.anos[a] ? CORC[p.anos[a].conc] || "#94a3b8" : "var(--line)"}" title="${a}">${p.anos[a] ? p.anos[a].conc : "·"}</i>`).join("")}</div>
    <p class="sub">Conceito por ano (${ANOS[0]} a ${ANOS.at(-1)}).</p>
    ${D.qmap[cod] ? `<p>Resultado da Quadrienal (05/2026): ${hc(String(D.qmap[cod].nota))} <span class="sub">anterior: ${esc(D.qmap[cod].ant || "–")}${D.qmap[cod].n2 != null ? " · nota reconsiderada" : ""}${D.qmap[cod].desat ? " · CTC-ES recomenda desativar o doutorado" : ""}</span></p>` : ""}
    <div class="graf alto"><canvas id="m-g"></canvas></div>`;
  $("#modal").showModal();
  const serie = (k, nome, cor) => linha(nome, cor, ANOS.map(a => v(a, k)));
  destruirModal();
  charts["m-g"] = new Chart($("#m-g"), { type: "line", data: { labels: ANOS.map(String), datasets: [serie("mat", "Matriculados", cssVar("--c-u")), serie("tit", "Titulados", "#2da44e"), serie("perm", "Docentes permanentes", cssVar("--c-se")), serie("ing", "Ingressantes", "#e8a317")] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { labels: { color: cssVar("--mut"), usePointStyle: true, boxWidth: 8 } } }, scales: { x: { ticks: { color: cssVar("--mut") }, grid: { color: cssVar("--line") } }, y: { beginAtZero: true, ticks: { color: cssVar("--mut") }, grid: { color: cssVar("--line") } } } } });
}
function destruirModal() { charts["m-g"]?.destroy(); delete charts["m-g"]; }

// ---------- Quadrienal ----------
function qRows(g, { area = true, grau = true } = {}) {
  return D.q.filter(r => g.t(r) && !(area && S.area && r.ga !== S.area) && !(grau && S.grau && !nivelOk(r.grau, S.grau)));
}
function qStats(rs) {
  const cmp = rs.filter(r => /^[1-7]$/.test(r.ant)), n = rs.length;
  const sobe = cmp.filter(r => r.nota > +r.ant).length, cai = cmp.filter(r => r.nota < +r.ant).length;
  return { n, c57: pct(rs.filter(r => r.nota >= 5).length, n), c67: pct(rs.filter(r => r.nota >= 6).length, n),
    cmp: cmp.length, sobe, cai, igual: cmp.length - sobe - cai,
    ant57: pct(cmp.filter(r => +r.ant >= 5).length, cmp.length) };
}
ABAS.quadrienal = el => {
  const rs = GRUPOS.map(g => qRows(g)), st = rs.map(qStats);
  const kp = (t, f, sub) => `<div class="kpi" style="cursor:default"><h3>${t}</h3><div class="v">${f(st[0])}</div>${sub ? `<p class="sub" style="margin:0">${sub(st[0])}</p>` : ""}<ul>${[1, 2].map(i => `<li><span><i class="dot" style="background:${cssVar(GRUPOS[i].cor)}"></i>${i === 1 ? "Sudeste" : "Brasil"}</span><b>${f(st[i])}</b></li>`).join("")}</ul></div>`;
  const num = r => /^[1-7]$/.test(r.ant);
  const lin = rs[0].map(r => ({ id: r.cod, v: [cap(r.nome), cap(r.area), r.nivel, num(r) ? +r.ant : (r.ant === "A" ? "A" : null), r.nota, num(r) ? r.nota - +r.ant : null, (r.n2 != null ? "Nota reconsiderada. " : "") + (r.desat ? "Recomendada a desativação do doutorado." : "")] }));
  el.innerHTML = `<h2 class="sec">Avaliação Quadrienal: resultado de 2025</h2>
    <p class="sub">Ciclo avaliado 2021–2024, oficialmente “Quadrienal 2025”; resultado publicado pela CAPES em ${esc(D.qinfo.publicado.split("-").reverse().join("/"))}. <a href="${esc(D.qinfo.pagina)}" target="_blank" rel="noopener">Fonte oficial</a>. ${esc(D.qinfo.obs)}</p>
    <div class="kpis">
      ${kp("Programas avaliados", s => fmt(s.n))}
      ${kp("% com nota 5 a 7", s => fmt(s.c57, 1) + "%", s => `antes: ${fmt(s.ant57, 1)}% (entre os comparáveis)`)}
      ${kp("% com nota 6 ou 7", s => fmt(s.c67, 1) + "%")}
      ${kp("Subiram de nota", s => fmt(pct(s.sobe, s.cmp), 1) + "%", s => `${s.sobe} de ${s.cmp} programas`)}
      ${kp("Mantiveram", s => fmt(pct(s.igual, s.cmp), 1) + "%", s => `${s.igual} programas`)}
      ${kp("Caíram de nota", s => fmt(pct(s.cai, s.cmp), 1) + "%", s => `${s.cai} programas`)}
    </div>
    <div class="grade" style="margin-top:14px">
      <article class="card"><h3>Distribuição das notas</h3><p class="sub">% dos programas avaliados</p><div class="graf"><canvas id="q1"></canvas></div></article>
      <article class="card"><h3>Mudança em relação ao conceito anterior</h3><p class="sub">% dos programas que já tinham conceito (exclui programas novos)</p><div class="graf"><canvas id="q2"></canvas></div></article>
      <article class="card"><h3>UFSCar: conceito anterior x nota atual</h3><p class="sub">número de programas</p><div class="graf"><canvas id="q3"></canvas></div></article>
    </div>
    <h2 class="sec">Programas da UFSCar (${lin.length})</h2>
    <p class="sub">“Conceito anterior” é o conceito do programa na base de Programas 2024, anterior a este resultado. Clique em um programa para ver a trajetória.</p>
    <div class="acoes" style="margin:0 0 8px"><button class="btn" id="q-csv">Baixar CSV</button></div>
    <div class="tabela-wrap"><table id="q-tab"></table></div>`;
  const cats = [["1 e 2", r => r.nota <= 2], ["Nota 3", r => r.nota === 3], ["Nota 4", r => r.nota === 4], ["Nota 5", r => r.nota === 5], ["Nota 6", r => r.nota === 6], ["Nota 7", r => r.nota === 7]];
  grafico("q1", "bar", cats.map(c => c[0]), GRUPOS.map((g, i) => barra(g.nome, cssVar(g.cor), cats.map(c => pct(rs[i].filter(c[1]).length, rs[i].length)))), { suf: "%", legend: true });
  grafico("q2", "bar", GRUPOS.map(g => g.nome), [["Subiram", st.map(s => pct(s.sobe, s.cmp)), "#2da44e"], ["Mantiveram", st.map(s => pct(s.igual, s.cmp)), "#94a3b8"], ["Caíram", st.map(s => pct(s.cai, s.cmp)), "#d64545"]].map(([n, d, c]) => barra(n, c, d)), { stacked: true, suf: "%", legend: true, horizontal: true });
  const cmpU = rs[0].filter(num), ns = [3, 4, 5, 6, 7];
  grafico("q3", "bar", ns.map(c => "Nota " + c), [barra("Conceito anterior", cssVar("--c-br"), ns.map(c => cmpU.filter(r => +r.ant === c).length)), barra("Quadrienal 2025", cssVar("--c-u"), ns.map(c => rs[0].filter(r => r.nota === c).length))], { dec: 0, legend: true });
  tabela($("#q-tab"), [{ h: "Programa", t: 1 }, { h: "Área de avaliação", t: 1 }, { h: "Nível", t: 1 }, { h: "Conceito anterior", f: v => v == null ? "–" : hc(String(v)) }, { h: "Nota 2025", f: v => hc(String(v)) },
    { h: "Variação", f: v => v == null ? "–" : `<span class="d ${v > 0 ? "up" : v < 0 ? "dn" : ""}">${v > 0 ? "▲ +" : v < 0 ? "▼ " : "= "}${v}</span>` }, { h: "Observações", t: 1 }], lin, { ordem: 4, desc: true, aoClicar: c => programas()[c] && abrirPrograma(c) });
  $("#q-csv").onclick = () => baixar("quadrienal_ufscar.csv", csv([["codigo", "programa", "area_avaliacao", "nivel", "conceito_anterior", "nota_quadrienal_2025"], ...rs[0].map(r => [r.cod, r.nome, r.area, r.nivel, r.ant, r.nota])]));
};

// ---------- Indicadores por nível do curso ----------
const NIVEIS = [["ME", "Mestrado acadêmico"], ["MP", "Mestrado profissional"], ["DO", "Doutorado acadêmico"], ["DP", "Doutorado profissional"]];
const IND_NIVEL = [
  ["prog", "Cursos (programas que oferecem o nível)"], ["mat", "Discentes matriculados"], ["ing", "Ingressantes"], ["tit", "Titulados"],
  ["des", "Desligados e abandonos"], ["concl", "Taxa de conclusão"], ["meses", "Tempo médio de titulação (meses)"],
  ["estr", "% de discentes estrangeiros"], ["perm", "Docentes permanentes (programas com o nível)"], ["razao", "Discentes por docente permanente"],
];
function valN(k, g, a, niv) {
  const key = `${k}|${g.k}|${a}|N${niv}`;
  if (!memo.has(key)) { const ant = OV; OV = niv; try { memo.set(key, M[k].f(g, a)); } finally { OV = ant; } }
  return memo.get(key);
}
const nomeInd = k => (IND_NIVEL.find(i => i[0] === k) || [k, M[k].t])[1];

ABAS.niveis = el => {
  const gi = Math.min(S.nvGrupo, GRUPOS.length - 1), g = GRUPOS[gi], a = S.ano, anos = anosRange();
  const ind = S.nvInd, nv = S.nvNivel, cols = [...NIVEIS, ["", "Todos os níveis"]];
  const linhas = IND_NIVEL.map(([k, t]) => ({ id: k, v: [t, ...cols.map(([n]) => valN(k, g, a, n))] }));
  const fmN = (k, v) => v == null || (M[k].kind === "soma" && v === 0) ? "–" : fm(k, v);
  el.innerHTML = `<h2 class="sec">Indicadores por nível do curso</h2>
    <p class="sub">Cada nível é calculado separadamente: <b>mestrado acadêmico</b>, <b>mestrado profissional</b>, <b>doutorado acadêmico</b> e <b>doutorado profissional</b>. Discentes são contados pelo nível em que estão matriculados; cursos e docentes, pelos programas que oferecem o nível (um programa de mestrado e doutorado entra nos dois). Esta aba ignora o filtro “Nível” e respeita o de grande área e o ano de referência (${a}).</p>
    <div class="controles"><label>Grupo da tabela<span class="seg" id="n-grupo">${GRUPOS.map((x, i) => `<button data-v="${i}" class="${i === gi ? "on" : ""}">${esc(i === 0 ? "UFSCar" : i === 1 ? "Sudeste" : "Brasil")}</button>`).join("")}</span></label>
      <button class="btn" id="n-csv">Baixar CSV</button></div>
    <p class="sub" style="margin:0 0 8px">${esc(g.nome)} em ${a}. Clique em uma linha para ver os gráficos do indicador.</p>
    <div class="tabela-wrap"><table id="n-tab"></table></div>
    <h2 class="sec">${esc(nomeInd(ind))}</h2>
    <div class="grade">
      <article class="card"><h3>Por nível, em ${a}</h3><p class="sub">UFSCar, Sudeste e Brasil</p>${aviso(ind)}<div class="graf"><canvas id="n1"></canvas></div></article>
      <article class="card"><h3>Série por nível</h3><p class="sub">${esc(g.nome)}, ${anos[0]}–${anos.at(-1)}</p><div class="graf"><canvas id="n2"></canvas></div></article>
      <article class="card"><h3>Comparação no nível escolhido</h3><div class="controles" style="margin-bottom:4px"><label>Nível<select id="n-nv">${NIVEIS.map(([n, t]) => `<option value="${n}" ${n === nv ? "selected" : ""}>${t}</option>`).join("")}</select></label></div><div class="graf"><canvas id="n3"></canvas></div></article>
      <article class="card"><h3>Distribuição dos matriculados por nível</h3><p class="sub">% em ${a}</p><div class="graf"><canvas id="n4"></canvas></div></article>
    </div>`;

  tabela($("#n-tab"), [{ h: "Indicador", t: 1 }, ...cols.map(([, t], i) => ({ h: t, f: (v, l) => fmN(l.id, v) }))], linhas,
    { ordem: -1, destaque: l => l.id === ind ? "u" : "", aoClicar: k => { S.nvInd = k; render(); } });
  $$("#n-grupo button").forEach(b => b.onclick = () => { S.nvGrupo = +b.dataset.v; render(); });
  $("#n-nv").onchange = e => { S.nvNivel = e.target.value; render(); };
  $("#n-csv").onclick = () => baixar(`indicadores_por_nivel_${a}.csv`, csv([["indicador", ...cols.map(c => c[1])], ...linhas.map(l => [l.v[0], ...l.v.slice(1).map(v => v == null ? "" : String(+v.toFixed(3)).replace(".", ","))])]));

  const sufx = M[ind].suf, dec = M[ind].dec;
  grafico("n1", "bar", NIVEIS.map(n => n[1]), GRUPOS.map(x => barra(x.nome, cssVar(x.cor), NIVEIS.map(([n]) => { const v = valN(ind, x, a, n); return v === 0 && M[ind].kind === "soma" ? null : v; }))), { suf: sufx, dec, legend: true });
  const pal = [cssVar("--c-se"), cssVar("--c-br"), cssVar("--c-u"), "#6db3f2"];
  grafico("n2", "line", anos.map(String), NIVEIS.map(([n, t], i) => linha(t, pal[i], anos.map(y => { const v = valN(ind, g, y, n); return v === 0 && M[ind].kind === "soma" ? null : v; }), i === 0)), { suf: sufx, dec, legend: true });
  grafico("n3", "line", anos.map(String), GRUPOS.map(x => linha(x.nome, cssVar(x.cor), anos.map(y => { const v = valN(ind, x, y, nv); return v === 0 && M[ind].kind === "soma" ? null : v; }), x.k === "u")), { suf: sufx, dec, legend: true });
  grafico("n4", "bar", GRUPOS.map(x => x.nome), NIVEIS.map(([n, t], i) => barra(t, pal[i], GRUPOS.map(x => { const tot = valN("mat", x, a, ""); return pct(valN("mat", x, a, n), tot); }))), { stacked: true, suf: "%", legend: true, horizontal: true });
};


// ---------- Programas em rede ----------
ABAS.redes = el => {
  const todos = Object.values(programas()).filter(p => p.rede);
  const assoc = todos.filter(p => p.papel === "associada" && areaOk(p.ultimo.ga) && grauOk(p.ultimo.grau)), sede = todos.filter(p => p.papel === "sede" && areaOk(p.ultimo.ga) && grauOk(p.ultimo.grau));
  const card = p => {
    const s = D.serie[p.cod]?.[S.ano] || {}, u = p.ultimo, ativo = !!p.anos[S.ano];
    return `<button class="card rede" data-c="${p.cod}">
      <div><span class="tag ${p.papel === "sede" ? "sede" : "assoc"}">${p.papel === "sede" ? "UFSCar é sede" : "UFSCar é associada"}</span> <span class="tag">${esc(cap(u.grau))}</span> ${ativo ? "" : '<span class="tag">inativo em ' + S.ano + "</span>"}</div>
      <h3>${esc(cap(p.nome))}</h3>
      <div class="sub" style="margin:0">Coordenação: <b>${esc(u.ies)}</b> · ${esc(cap(u.ga))}</div>
      <div class="nums"><div><b>${fmt(s.mat)}</b><span>matriculados</span></div><div><b>${fmt(s.tit)}</b><span>titulados</span></div><div><b>${fmt(s.perm)}</b><span>docentes perm.</span></div></div>
      <div class="tl">${ANOS.map(a => `<i style="background:${p.anos[a] ? CORC[p.anos[a].conc] || "#94a3b8" : "var(--line)"}" title="${a}">${p.anos[a] ? p.anos[a].conc : "·"}</i>`).join("")}</div>
      <div class="sub" style="margin:0">${u.associadas.length ? `${u.associadas.length} IES associadas${u.associadas.length < 14 ? ": " + esc(u.associadas.join(", ")) : ""}` : ""}</div></button>`;
  };
  el.innerHTML = `<h2 class="sec">Programas em rede com participação da UFSCar</h2>
    <p class="sub">Redes nacionais e associações entre instituições. Os dados de discentes e docentes são da <b>rede inteira</b> (a CAPES não separa por instituição associada), por isso os totais da UFSCar que os incluem (opção ligada por padrão no filtro) refletem a rede inteira, não só a parte da UFSCar. Clique em um cartão para ver a trajetória.</p>
    <h2 class="sec">UFSCar associada (${assoc.length})</h2>
    <div class="rede-grid">${assoc.map(card).join("") || '<p class="sub">Nenhum programa com os filtros atuais.</p>'}</div>
    <div class="grade" style="margin-top:14px"><article class="card"><h3>Matriculados nas redes em que a UFSCar é associada</h3><p class="sub">totais das redes, empilhado</p><div class="graf alto"><canvas id="r-g"></canvas></div></article></div>
    <h2 class="sec">UFSCar sede (${sede.length})</h2><p class="sub">Programas coordenados pela UFSCar em parceria com outras IES. Estão incluídos nos totais da UFSCar.</p>
    <div class="rede-grid">${sede.map(card).join("") || '<p class="sub">Nenhum programa com os filtros atuais.</p>'}</div>`;
  $$(".rede", el).forEach(b => b.onclick = () => abrirPrograma(b.dataset.c));
  const pal = CAT();
  grafico("r-g", "bar", ANOS.map(String), assoc.map((p, i) => barra(cap(p.nome), pal[i % pal.length], ANOS.map(a => D.serie[p.cod]?.[a]?.mat ?? null))), { stacked: true, dec: 0, legend: true });
};

// ---------- Comparar IES ----------
const RK = ["prog", "mat", "ing", "tit", "perm", "razao", "conc", "meses"];
const paleta = () => [cssVar("--c-u"), cssVar("--c-se"), cssVar("--c-br"), "#6db3f2", "#0f4a85", "#c9a227", "#8aa4c8", "#5d6877"];
ABAS.ranking = el => {
  const lista = [...new Set(Y.disc_a[S.ano].map(r => r.ies).filter(Boolean))].filter(s => D.ies[s] && (S.univ === "all" || D.ies[s].jur === "FEDERAL"));
  const gI = s => ({ k: "i_" + s, t: r => r.ies === s && (r.rede !== "S" || S.incRede) });
  const a0 = S.a0;
  const lin = lista.map(s => { const g = gI(s); return { id: s, v: [s, D.ies[s].uf, val("prog", g, S.ano), val("mat", g, S.ano), pct(val("mat", g, S.ano) - val("mat", g, a0), val("mat", g, a0)), val("tit", g, S.ano), val("perm", g, S.ano), val("razao", g, S.ano), val("conc", g, S.ano), val("meses", g, S.ano)] }; }).filter(l => l.v[2] || l.v[3]);
  S.sel = S.sel.filter(s => lista.includes(s)); if (!S.sel.length) S.sel = [U];
  el.innerHTML = `<h2 class="sec">Instituições do Sudeste (${S.univ === "fed" ? "federais" : "todas"})</h2>
    <p class="sub">Dados de ${S.ano}; a variação compara com ${a0}. Clique nas linhas para escolher até 6 instituições e compará-las no gráfico.</p>
    <div class="card"><div class="controles">
      <label>Indicador<select id="k-met">${RK.map(k => `<option value="${k}" ${k === S.rkMetric ? "selected" : ""}>${M[k].t}</option>`).join("")}</select></label>
      <label>Visualização<span class="seg" id="k-modo"><button data-v="abs" class="${S.rkModo === "abs" ? "on" : ""}">Valores</button><button data-v="idx" class="${S.rkModo === "idx" ? "on" : ""}">Índice</button></span></label></div>
      ${aviso(S.rkMetric)}
      <div class="leg" id="k-leg"></div><div class="graf alto"><canvas id="k-g"></canvas></div></div>
    <h2 class="sec">Ranking</h2><div class="tabela-wrap"><table id="k-tab"></table></div>`;
  const draw = () => {
    const k = S.rkMetric, anos = anosRange(), idx = S.rkModo === "idx" && M[k].kind === "soma";
    $("#k-leg").innerHTML = S.sel.map((s, i) => `<button data-s="${s}" title="Remover"><i class="dot" style="background:${paleta()[i]}"></i>${esc(s)} ×</button>`).join("");
    $$("#k-leg button").forEach(b => b.onclick = () => { S.sel = S.sel.filter(x => x !== b.dataset.s); if (!S.sel.length) S.sel = [U]; draw(); marca(); });
    destruirUm("k-g");
    grafico("k-g", "line", anos.map(String), S.sel.map((s, i) => { const v = serieDe(k, gI(s), anos); return linha(s, paleta()[i], idx ? v.map(x => v[0] ? 100 * x / v[0] : null) : v, s === U); }), { suf: M[k].suf, dec: idx ? 1 : M[k].dec, legend: true });
  };
  const marca = () => $$("#k-tab tbody tr").forEach(tr => tr.classList.toggle("sel", S.sel.includes(tr.dataset.id)));
  tabela($("#k-tab"), [{ h: "IES", t: 1 }, { h: "UF", t: 1 }, { h: "Programas" }, { h: "Matriculados", f: v => fmt(v) }, { h: `Δ matric. vs ${a0}`, f: v => v == null ? "–" : `<span class="d ${v > 0 ? "up" : v < 0 ? "dn" : ""}">${v > 0 ? "+" : ""}${fmt(v, 1)}%</span>` }, { h: "Titulados", f: v => fmt(v) }, { h: "Docentes perm.", f: v => fmt(v) }, { h: "Disc./docente", f: v => fmt(v, 1) }, { h: "% conc. 5–7", f: v => fmt(v, 1) }, { h: "Meses p/ titular", f: v => fmt(v, 1) }],
    lin, { ordem: 3, desc: true, destaque: l => l.id === U ? "u" : "", aoClicar: s => { S.sel = S.sel.includes(s) ? S.sel.filter(x => x !== s) : [...S.sel, s].slice(-6); if (!S.sel.length) S.sel = [U]; draw(); marca(); } });
  $("#k-met").onchange = e => { S.rkMetric = e.target.value; render(); };
  $$("#k-modo button").forEach(b => b.onclick = () => { S.rkModo = b.dataset.v; render(); });
  draw(); marca();
};
function destruirUm(id) { charts[id]?.destroy(); delete charts[id]; }

// ---------- Metodologia ----------
ABAS.sobre = el => {
  el.innerHTML = `<div class="card sobre"><h2 class="sec">Metodologia e fontes</h2><ul>
    <li><b>Fonte:</b> <a href="https://dadosabertos.capes.gov.br/">CAPES Dados Abertos</a> (Plataforma Sucupira), bases de Programas, Discentes e Docentes da pós-graduação stricto sensu, ${ANOS[0]} a ${ANOS.at(-1)}. Atualizado em ${esc(D.meta.gerado_em)}. Só agregados são armazenados; nenhum dado pessoal.</li>
    <li><b>Grupos de comparação:</b> UFSCar; Sudeste (região, apenas IES federais ou todas, conforme o filtro “Universo de comparação”); Brasil (idem). Na opção “Federais”, o Sudeste e o Brasil incluem a UFSCar, a menos que se marque “Sem a UFSCar nas comparações”.</li>
    <li><b>Discentes</b> são vínculos curso–aluno. <b>Matriculados</b>: situação “matriculado” no ano-base; <b>titulados</b>: “titulado”; <b>desligados e abandonos</b>: “desligado” ou “abandonou”. <b>Ingressantes</b>: matriculados marcados como ingressantes no ano.</li>
    <li><b>Taxa de conclusão</b> = titulados ÷ (titulados + desligados + abandonos) no ano. É um indicador de fluxo anual, não de coorte.</li>
    <li><b>Docentes</b> são vínculos docente–programa; a razão discente/docente usa matriculados e docentes permanentes. Para docentes, o nível é o do programa em que atuam (um programa de mestrado e doutorado conta nos dois níveis).</li>
    <li><b>Conceito 5 a 7</b>: participação entre os programas com conceito 3 a 7; programas com conceito “A” (novos) ficam fora do denominador.</li>
    <li><b>Programas em rede:</b> programas com “em rede = sim” na base de Programas em que a UFSCar é a instituição sede ou consta entre as associadas. Os <b>4 programas em que a UFSCar é associada</b> (PROFMAT, PROFIS, PROEF e PROF-FILO) entram <b>sempre</b> nos totais da UFSCar (programas, discentes, docentes, conceitos), somados aos programas próprios, conforme a opção ligada por padrão no filtro. A CAPES registra os discentes e docentes desses programas sob o código do programa coordenador, sem distinguir a instituição de cada pessoa; portanto, nesses 4 programas os números são os da <b>rede inteira</b> e elevam bastante os totais da UFSCar. Desmarque “Incluir os 4 programas em rede” para ver só os programas próprios. No Sudeste e no Brasil esses programas ficam apenas na coordenadora (sem dupla contagem), de modo que o peso da UFSCar nessas comparações pode ficar superestimado.</li>
    <li><b>Indicadores por nível:</b> a aba “Por nível” separa mestrado acadêmico, mestrado profissional, doutorado acadêmico e doutorado profissional. Discentes são contados pelo nível em que estão matriculados; cursos e docentes, pelos programas que oferecem o nível (programa de mestrado e doutorado entra nos dois). O filtro “Nível” da barra superior também aceita cada nível isolado e vale para programas, discentes e docentes.</li>
    <li>Os indicadores de faixa etária, nacionalidade, bolsa de produtividade e titulação no exterior usam cubos sem o detalhe de grande área, então o filtro de área não os afeta (o painel avisa quando isso ocorre).</li>
    <li><b>Quadrienal:</b> notas do resultado da Avaliação Quadrienal (ciclo 2021-2024, chamada oficialmente “Quadrienal 2025”), planilha da CAPES de 27/05/2026, cruzada pelo código do programa com a base de Programas 2024 (região, status e conceito anterior). O resultado só é definitivo após os recursos, conforme a CAPES.</li>
    <li><b>Dados de 2025:</b> a CAPES ainda não publicou no portal de dados abertos as bases de Programas, Discentes e Docentes do ano-base 2025 (o último ano disponível é 2024). O painel será atualizado quando saírem.</li>
    <li><b>Verificação automática:</b> um agendador (GitHub Actions semanal ou Agendador de Tarefas do Windows) roda <code>etl/atualizar.py</code>, que consulta o portal de dados abertos e a página da Quadrienal. Se há novo ano-base, arquivo revisado ou nova planilha, os dados são regerados e o painel exibe o aviso até a incorporação. ${D.status ? `Última verificação: ${dataBr(D.status.verificado_em)}.` : ""}</li>
    ${D.status ? `<li><b>Situação das fontes:</b><ul>${D.status.fontes.map(f => `<li><span class="pill ${f.situacao}">${esc(SIT[f.situacao] || f.situacao)}</span> ${esc(f.nome)}: ${esc(f.detalhe)}</li>`).join("")}</ul></li>` : ""}
    <li>Índice = valor ÷ valor do primeiro ano do período × 100, para comparar grupos de tamanhos muito diferentes.</li></ul></div>`;
};

// ------------------------------------------------- verificação de atualizações
const SIT = { em_dia: "em dia", novo_ano: "novo ano-base na CAPES", revisado: "arquivos revisados", novo: "novo resultado" };
const dataBr = iso => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
function statusPainel() {
  const st = D.status, b = $("#status-banner"), r = $("#status-rodape");
  if (!st) { r.textContent = "Verificação automática de atualizações indisponível."; return; }
  const dias = (Date.now() - new Date(st.verificado_em)) / 864e5, novas = st.fontes.filter(f => f.situacao !== "em_dia");
  r.textContent = `Última verificação na CAPES: ${dataBr(st.verificado_em)}${st.erro ? " (com falha)" : novas.length ? "" : ", tudo em dia"}.`;
  let html = "", ok = false;
  if (novas.length) html = `<b>A CAPES publicou novidades que ainda não estão no painel.</b><ul>${novas.map(f => `<li>${esc(f.nome)}: ${esc(f.detalhe)} <a href="${esc(f.url)}" target="_blank" rel="noopener">abrir fonte</a></li>`).join("")}</ul>`;
  else if (st.erro) html = `<b>Não foi possível verificar a CAPES</b> na última tentativa (${esc(st.erro)}).`;
  else if (dias > 21) html = `<b>A verificação automática está desatualizada</b> (última em ${dataBr(st.verificado_em)}). Confira se o agendamento está ativo.`;
  else ok = true;
  b.hidden = ok; b.className = "status" + (ok ? " ok" : ""); b.innerHTML = html;
}

// ============================================================ núcleo / eventos
function notaRede() {
  const el = $("#nota-rede"); if (!el || !D.prog) return;
  const ps = Object.values(programas()).filter(p => p.anos[S.ano]);
  const nS = ps.filter(p => p.anos[S.ano].papel === "sede").length, nR = ps.length - nS;
  el.hidden = false;
  el.innerHTML = S.incRede
    ? `<b>Totais da UFSCar em ${S.ano}:</b> ${nS} programas próprios + ${nR} em rede (UFSCar associada) = ${nS + nR}. Nos programas em rede, discentes e docentes são os da <b>rede inteira</b> (a CAPES não separa por instituição); desmarque a opção no filtro para ver só os programas próprios.`
    : `<b>Totais da UFSCar em ${S.ano}:</b> somente os ${nS} programas próprios (os ${nR} em rede estão fora da soma).`;
}
function ir(tab) { S.tab = tab; history.replaceState(null, "", "#" + tab); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
function csvGrafico(id, titulo) {
  const c = charts[id]; if (!c) return;
  const { labels, datasets } = c.data, num = v => v == null ? "" : String(typeof v === "number" ? +v.toFixed(3) : v).replace(".", ",");
  baixar(`${titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").slice(0, 50) || "figura"}.csv`,
    csv([["", ...datasets.map(d => d.label || "valor")], ...labels.map((l, i) => [l, ...datasets.map(d => num(d.data[i]))])]));
}
function decorarFiguras() {
  let n = 0;
  $$(".card", $("#tab-" + S.tab)).forEach(card => {
    const cv = card.querySelector("canvas"); if (!cv || card.querySelector(".fig-top")) return;
    n++;
    const top = document.createElement("div"); top.className = "fig-top";
    top.innerHTML = `<span class="fig-num">FIGURA ${String(n).padStart(2, "0")}</span><button type="button" class="btn-outline mini" title="Baixar os dados desta figura em CSV">CSV</button>`;
    card.prepend(top);
    top.querySelector("button").onclick = () => csvGrafico(cv.id, card.querySelector("h3")?.innerText || "figura");
  });
}
function sincFiltros() {
  $("#f-area").value = S.area; $("#f-grau").value = S.grau; $("#f-sem").checked = S.sem; $("#f-rede").checked = S.incRede; $("#f-ano").value = S.ano;
  $$("#f-univ button").forEach(x => x.classList.toggle("on", x.dataset.v === S.univ));
}
function chipsFiltros() {
  const l = [];
  if (S.univ === "all") l.push(["Todas as IES", () => S.univ = "fed"]);
  if (S.area) l.push([cap(S.area), () => S.area = ""]);
  if (S.grau) l.push([$("#f-grau").selectedOptions[0].text, () => S.grau = ""]);
  if (S.sem) l.push(["Sem a UFSCar nas comparações", () => S.sem = false]);
  if (!S.incRede) l.push(["Sem os 4 programas em rede", () => S.incRede = true]);
  if (S.ano !== ANOS.at(-1)) l.push(["Ano de referência " + S.ano, () => S.ano = ANOS.at(-1)]);
  const el = $("#chips-out");
  el.innerHTML = l.map(([t], i) => `<button type="button" class="chip-out" data-i="${i}" title="Remover filtro">${esc(t)} ×</button>`).join("");
  $$(".chip-out", el).forEach(b => b.onclick = () => { l[+b.dataset.i][1](); sincFiltros(); render(); });
}
function render() {
  destruir(); memo = new Map(); GRUPOS = grupos(); notaRede();
  $("#ano-txt").textContent = S.ano;
  $$("#abas button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
  $$(".tab").forEach(t => t.hidden = t.id !== "tab-" + S.tab);
  ABAS[S.tab]($("#tab-" + S.tab));
  decorarFiguras(); chipsFiltros();
}
function iniciaFiltros() {
  const areas = [...new Set(Y.disc_a[ANOS.at(-1)].map(r => r.ga).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
  $("#f-area").innerHTML = `<option value="">Todas</option>` + areas.map(a => `<option value="${esc(a)}">${esc(cap(a))}</option>`).join("");
  const r = $("#f-ano"); r.min = ANOS[0]; r.max = ANOS.at(-1); r.value = S.ano;
  r.oninput = e => { S.ano = +e.target.value; render(); };
  $("#f-area").onchange = e => { S.area = e.target.value; render(); };
  $("#f-grau").onchange = e => { S.grau = e.target.value; render(); };
  $("#f-sem").onchange = e => { S.sem = e.target.checked; render(); };
  $("#f-rede").onchange = e => { S.incRede = e.target.checked; render(); };
  $$("#f-univ button").forEach(b => b.onclick = () => { S.univ = b.dataset.v; $$("#f-univ button").forEach(x => x.classList.toggle("on", x === b)); render(); });
  $("#limpar").onclick = () => { Object.assign(S, { univ: "fed", area: "", grau: "", sem: false, ano: ANOS.at(-1), a0: ANOS[0], a1: ANOS.at(-1), busca: "", conc: "", mun: "", vinc: "", ord: "nota", grp: "", incRede: true }); $("#f-rede").checked = true; $("#f-area").value = ""; $("#f-grau").value = ""; $("#f-sem").checked = false; $("#f-ano").value = S.ano; $$("#f-univ button").forEach(x => x.classList.toggle("on", x.dataset.v === "fed")); render(); };
  $$("#abas button").forEach(b => b.onclick = () => ir(b.dataset.tab));
  $("#m-fechar").onclick = () => $("#modal").close();
  $("#modal").addEventListener("close", destruirModal);
  $("#modal").addEventListener("click", e => { if (e.target.id === "modal") $("#modal").close(); });
  $("#tema").onclick = () => { const atual = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light"), t = atual === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; try { localStorage.setItem("tema", t); } catch { } render(); };
  const fonte = d => { const v = Math.min(20, Math.max(12, (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--fs")) || 15) + d)); document.documentElement.style.setProperty("--fs", v + "px"); try { localStorage.setItem("fonte", v); } catch { } };
  $("#fonte-mais").onclick = () => fonte(1); $("#fonte-menos").onclick = () => fonte(-1);
  try { const f = localStorage.getItem("fonte"); if (f) document.documentElement.style.setProperty("--fs", f + "px"); } catch { }
}
(async function () {
  try { const t = localStorage.getItem("tema"); if (t) document.documentElement.dataset.theme = t; } catch { }
  try { await carregar(); } catch (e) { $("#carregando").textContent = "Não foi possível carregar os dados: " + e.message; return; }
  $("#carregando").remove(); $("#gerado").textContent = D.meta.gerado_em; $("#faixa-anos").textContent = `${ANOS[0]}–${ANOS.at(-1)}`;
  iniciaFiltros(); statusPainel();
  const h = location.hash.slice(1); if (ABAS[h]) S.tab = h;
  render();
  window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (ABAS[t] && t !== S.tab) { S.tab = t; render(); } });
})();
