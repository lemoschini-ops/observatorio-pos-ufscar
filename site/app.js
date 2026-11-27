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
const sa = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const PEQ = new Set(["e", "da", "de", "do", "das", "dos", "em", "na", "no", "para"]);
const cap = s => (s || "").toLowerCase().replace(/(^|[\s/(-])(\S)(\S*)/g, (m, p, a, r) => PEQ.has(a + r) && p === " " ? m : p + a.toUpperCase() + r);

const D = {}, Y = {}; let ANOS = [];
const S = { rotulos: true, tab: "geral", univ: "fed", area: "", grau: "", sem: false, ano: 0, a0: 0, a1: 0,
  metric: "mat", modo: "idx", off: new Set(), sel: [U], rkMetric: "mat", rkModo: "abs",
  busca: "", conc: "", mun: "", vinc: "", ord: "nota", grp: "", nvInd: "mat", nvGrupo: 0, nvNivel: "ME", qvin: "", qnota: "", lato: { sit: "Ativo", mod: "", area: "", camp: "", q: "" } };
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
  D.lato = await fetch("data/lato_sensu.json").then(r => r.ok ? r.json() : null).catch(() => null);
  D.qinfo = q; D.q = q.rows.map(r => Object.fromEntries(q.cols.map((c, i) => [c, r[i]]))); D.redeAssoc = new Set(prog.filter(p => p.rede && p.papel === "associada").map(p => p.cod));
  D.q.forEach(r => r.redeU = D.redeAssoc.has(r.cod)); D.qmap = Object.fromEntries(D.q.map(r => [r.cod, r]));
  ANOS = meta.anos; S.ano = S.a1 = ANOS.at(-1); S.a0 = ANOS[0];
}

// ------------------------------------------------------------------- grupos
function grupos() {
  const fed = S.univ === "fed";
  // linhas rede = "S" são cópias dos programas em rede em que a UFSCar é associada: só a contagem de programas as usa
  // (discentes e docentes dessas redes são da rede inteira e ficam fora, ver rows())
  const isU = r => r.ies === U || r.ie === U || r.redeU;
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
  return (Y[cube][ano] || []).filter(r => g.t(r) && (cube === "prog" || r.rede !== "S") &&
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

// ------------------------------------------------------------ rótulos de dados
if (window.ChartDataLabels) { Chart.register(ChartDataLabels); Chart.defaults.set("plugins.datalabels", { display: false }); }
// texto legível sobre uma cor: escolhe entre branco e azul-escuro pelo maior contraste (WCAG)
const relLum = c => {
  const m = String(c).match(/^#?([0-9a-f]{6})$/i); let rgb;
  if (m) { const n = parseInt(m[1], 16); rgb = [n >> 16 & 255, n >> 8 & 255, n & 255]; } else rgb = (String(c).match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const sobre = c => { const L = relLum(c); return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0623 ? "#ffffff" : "#071d41"; };
function rotulos(tipo, labels, datasets, o, dec, suf) {
  if (!S.rotulos || o.rotulos === false || !window.ChartDataLabels) return { display: false };
  const fv = v => v == null || Number.isNaN(+v) ? "" : fmt(+v, dec) + suf;
  const base = { formatter: v => fv(v && typeof v === "object" ? (v.y ?? v.x) : v), font: { family: FONTE, size: 11, weight: 700 }, clamp: true };
  const nl = labels.length, nd = datasets.length, tit = cssVar("--tit"), card = cssVar("--card");
  if (tipo === "line") {
    return { ...base, color: tit, backgroundColor: card, borderRadius: 4, padding: 2, borderWidth: 1, borderColor: ctx => ctx.dataset.borderColor, align: "top", offset: 4,
      display: ctx => {
        const d = ctx.dataset.data; if (d[ctx.dataIndex] == null) return false;
        if (nl <= 6) return true;
        let last = d.length - 1; while (last > 0 && d[last] == null) last--;
        return ctx.dataIndex === last;                       // séries longas: só o último ponto
      } };
  }
  if (tipo === "doughnut") return { ...base, color: ctx => sobre(ctx.dataset.backgroundColor[ctx.dataIndex]), formatter: v => fmt(v, 0), display: ctx => ctx.dataset.data[ctx.dataIndex] > 0 };
  const dens = nl * nd;
  if (o.stacked) {
    const tot = Math.max(...labels.map((_, i) => datasets.reduce((s, d) => s + (+d.data[i] || 0), 0)), 1);
    return { ...base, color: ctx => sobre(ctx.dataset.backgroundColor), anchor: "center", align: "center",
      display: ctx => { const v = +ctx.dataset.data[ctx.dataIndex]; return dens <= 40 && v > 0 && v >= tot * 0.07; } };
  }
  return { ...base, color: tit, anchor: "end", align: "end", offset: 2, rotation: !o.horizontal && dens > 18 ? -90 : 0,
    display: ctx => dens <= 60 && ctx.dataset.data[ctx.dataIndex] != null };
}

/* ---------------------------------------------------------------------------
   Sistema único de visualização (padrão gov.br DS)
   - cores: só tokens CSS (--c-u/--c-se/--c-br para os grupos, --dv-1..9 categórica,
     --dv-pos/neu/neg semânticas, --cc-* conceitos CAPES), recalculadas a cada render (tema);
   - tipografia: Rawline, 12-14 px, rótulos de dados em negrito 11 px;
   - eixos: grade só no eixo de valores, sem bordas, no máximo 6 marcas, números em pt-BR;
   - legenda: em cima, à esquerda, com marcadores de forma (não depende só da cor);
   - linhas: forma de marcador diferente por série, a série em foco (UFSCar) mais grossa;
   - dica: fundo escuro com título e valores formatados;
   - acessibilidade: canvas com role="img" e descrição; cada figura tem "Ver tabela" e "CSV". */
const FONTE = "Rawline, Raleway, 'Segoe UI', Roboto, Arial, sans-serif";
const FORMAS = ["circle", "rectRot", "triangle", "rect", "star", "crossRot", "rectRounded", "cross"];
const DV = {};            // paleta resolvida para o tema atual
let CORC = {};            // cor por conceito CAPES ("7".."1", "A")
function aplicaTema() {
  DV.cat = Array.from({ length: 9 }, (_, i) => cssVar(`--dv-${i + 1}`));
  DV.pos = cssVar("--dv-pos"); DV.neu = cssVar("--dv-neu"); DV.neg = cssVar("--dv-neg");
  DV.ink = cssVar("--ink"); DV.mut = cssVar("--mut"); DV.tit = cssVar("--tit"); DV.grid = cssVar("--grid"); DV.card = cssVar("--card");
  DV.ttBg = cssVar("--tt-bg"); DV.ttInk = cssVar("--tt-ink");
  const b = cssVar("--cc-12");
  CORC = { "7": cssVar("--cc-7"), "6": cssVar("--cc-6"), "5": cssVar("--cc-5"), "4": cssVar("--cc-4"), "3": cssVar("--cc-3"), "2": b, "1": b, A: cssVar("--cc-a") };
  if (window.Chart) {
    Object.assign(Chart.defaults.font, { family: FONTE, size: 13 });
    Chart.defaults.color = DV.mut;
    Chart.defaults.borderColor = DV.grid;
  }
}
const corConc = c => CORC[c] || DV.neu;
const pinta = c => { const bg = corConc(c); return `background:${bg};color:${sobre(bg)}`; };
// categórica genérica (categorias que não são os grupos UFSCar/Sudeste/Brasil): começa pelas cores que não se confundem com eles
const CAT = () => [2, 3, 4, 6, 7, 0, 1, 8, 5].map(i => DV.cat[i]);
const AZUL = () => DV.cat[0];   // série única: azul de ação

function grafico(id, tipo, labels, datasets, o = {}) {
  const el = document.getElementById(id); if (!el) return;
  const mut = DV.mut, grade = DV.grid, dec = o.dec ?? 1, suf = o.suf || "";
  const horiz = o.horizontal, rosca = tipo === "doughnut";
  if (tipo === "line") datasets.forEach((d, i) => { d.pointStyle ??= FORMAS[i % FORMAS.length]; d.pointBackgroundColor ??= d.borderColor; });
  const eixoValor = { color: mut, maxTicksLimit: 6, callback: v => fmt(v) + suf, font: { size: 12 } };
  const eixoCat = { color: mut, font: { size: 12 }, autoSkipPadding: 8 };
  const c = new Chart(el, {
    type: tipo, data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: horiz ? "y" : "x",
      animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 400 },
      layout: { padding: rosca ? 0 : { top: 22, right: horiz ? 40 : tipo === "line" ? 30 : 14 } },
      interaction: { mode: horiz || rosca ? "nearest" : "index", intersect: rosca },
      plugins: {
        legend: { display: !!o.legend, position: rosca ? "right" : "top", align: "start",
          labels: { color: DV.ink, usePointStyle: true, pointStyleWidth: 12, boxHeight: 8, padding: 14, font: { size: 13 } } },
        datalabels: rotulos(tipo, labels, datasets, o, dec, suf),
        tooltip: { backgroundColor: DV.ttBg, titleColor: DV.ttInk, bodyColor: DV.ttInk, footerColor: DV.ttInk, padding: 10, cornerRadius: 6, boxPadding: 4, usePointStyle: true,
          titleFont: { family: FONTE, size: 13, weight: 700 }, bodyFont: { family: FONTE, size: 13 },
          callbacks: { label: x => `${x.dataset.label ?? x.label}: ${fmt(typeof x.parsed === "number" ? x.parsed : horiz ? x.parsed.x : x.parsed.y, dec)}${suf}` } },
      },
      scales: rosca ? {} : {
        x: { stacked: !!o.stacked, border: { display: false }, ticks: horiz ? eixoValor : eixoCat, grid: { display: !!horiz, color: grade } },
        y: { stacked: !!o.stacked, border: { display: false }, beginAtZero: o.zero ?? (tipo === "bar"), ticks: horiz ? eixoCat : eixoValor, grid: { display: !horiz, color: grade } },
      },
      onClick: o.onClick,
    },
  });
  charts[id] = c;
  descreve(el, labels, datasets);
  if (datasets.every(d => (d.data || []).every(v => v == null || v === 0)))
    el.parentElement.insertAdjacentHTML("beforeend", '<div class="state" style="position:absolute;inset:0">Sem dados para os filtros atuais.</div>');
  return c;
}
// descrição acessível do gráfico: título + subtítulo do cartão e resumo das séries
function descreve(el, labels, datasets) {
  const card = el.closest(".card, .modal-in"), t = card?.querySelector("h3, h2")?.textContent?.trim() || "Gráfico";
  const ant = el.closest(".graf")?.previousElementSibling, s = (ant?.matches(".sub") ? ant : card?.querySelector(".sub"))?.textContent?.trim();
  const series = datasets.map(d => d.label).filter(Boolean);
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `${t}${s ? ". " + s : ""}. ${series.length ? "Séries: " + series.join(", ") + ". " : ""}${labels.length} categorias, de ${labels[0] ?? "–"} a ${labels.at(-1) ?? "–"}.${card?.matches(".card") ? " Use o botão Ver tabela para ler os valores." : ""}`);
}
const linha = (nome, cor, data, forte) => ({ label: nome, data, borderColor: cor, backgroundColor: cor, borderWidth: forte ? 3.5 : 2, pointRadius: forte ? 3.5 : 2.5, pointHoverRadius: 6, tension: .25, spanGaps: true, order: forte ? 0 : 1 });
const barra = (nome, cor, data) => ({ label: nome, data, backgroundColor: cor, borderRadius: 2, maxBarThickness: 48 });
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
  el.innerHTML = `<h2 class="sec">Acesso rápido</h2>
    <div class="quick">${[["serie", "Série histórica"], ["programas", "Programas e conceitos"], ["niveis", "Indicadores por nível"], ["quadrienal", "Avaliação Quadrienal"], ["redes", "Programas em rede"], ["lato", "Pós-Graduação Lato sensu"], ["ranking", "Comparar IES"]].map(([t, n]) => `<button data-t="${t}">${n}</button>`).join("")}</div>
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
  grafico("s-nv", "bar", lab, [barra("Mestrado", CAT()[0], nv(g => g.includes("MESTRADO"))), barra("Doutorado", CAT()[1], nv(g => g.includes("DOUTORADO")))], { stacked: true, dec: 0, legend: true });
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
  grafico("d3", "bar", anos.map(String), [barra("Ingressantes", AZUL(), serieDe("ing", gu, anos)), barra("Titulados", DV.pos, serieDe("tit", gu, anos)), barra("Desligados e abandonos", DV.neg, serieDe("des", gu, anos))], { dec: 0, legend: true });
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
  const anos = anosRange(), gu = GRUPOS[0];
  grafico("p3", "bar", anos.map(String), ["PERMANENTE", "COLABORADOR", "VISITANTE"].map((c, i) => barra(cap(c), CAT()[i],anos.map(a => sum(rows("doc_a", a, gu).filter(r => r.cat === c))))), { stacked: true, dec: 0, legend: true });
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
const hc = c => `<i class="hc" style="${pinta(c)}">${esc(c)}</i>`;
const tlinha = p => `<div class="tl" role="img" aria-label="Conceito por ano: ${ANOS.map(a => `${a} ${p.anos[a] ? p.anos[a].conc : "sem registro"}`).join(", ")}">${ANOS.map(a => `<i style="${p.anos[a] ? pinta(p.anos[a].conc) : "background:var(--line-2);color:var(--mut)"}" title="${a}">${p.anos[a] ? p.anos[a].conc : "·"}</i>`).join("")}</div>`;
// anos de existência: sempre pela data em que o painel é visualizado
const idade = ini => (+ini ? new Date().getFullYear() - +ini : null);
const selo = ini => { const n = idade(ini); return n == null ? "" : `<span class="selo" title="Existe desde ${esc(ini)}; contado até ${new Date().getFullYear()}"><b>${n < 1 ? "Novo" : n}</b>${n < 1 ? "" : `<small>${n === 1 ? "ano" : "anos"}</small>`}</span>`; };
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
    ini: (a, b) => (+a.anos[A].inicio || 9999) - (+b.anos[A].inicio || 9999) || a.nome.localeCompare(b.nome, "pt"),
    inir: (a, b) => (+b.anos[A].inicio || 0) - (+a.anos[A].inicio || 0) || a.nome.localeCompare(b.nome, "pt"),
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
      <div class="ppg-top">${selo(r.inicio)}<span class="nota" style="${n != null ? pinta(String(n)) : "background:var(--line-2);color:var(--mut)"}" title="Conceito CAPES 2025 (Quadrienal)" aria-label="Conceito CAPES 2025: ${n ?? "sem nota"}">${n ?? "–"}</span>
        <div><h3><a class="ppg-link" href="${esc(st.url)}" target="_blank" rel="noopener" title="${st.geral ? "Abrir a página dos programas da UFSCar (ProPG)" : "Abrir o site do programa em ufscar.br"}">${esc(cap(r.nome))}</a></h3><small>${esc(cap(r.area || r.ga))} · ${esc(r.grau.replace("MESTRADO PROFISSIONAL", "Mestrado prof.").replace("DOUTORADO PROFISSIONAL", "Doutorado prof.").replace("MESTRADO/DOUTORADO", "Mestrado e doutorado").replace(/^MESTRADO$/, "Mestrado").replace(/^DOUTORADO$/, "Doutorado"))}</small></div></div>
      <div class="ppg-tags"><span class="tag ${rede ? "assoc" : "sede"}">${rede ? "Rede · UFSCar associada" : "UFSCar" + (r.rede ? " · sede de rede" : "")}</span><span class="tag">${esc(rede ? "Coord.: " + r.ies : campusDe(r.mun))}</span>${r.inicio ? `<span class="tag" title="Ano de criação do programa">Criado em ${esc(r.inicio)}</span>` : ""}</div>
      <div class="ppg-ref"><span><b>Conceito 2025:</b> ${n ?? "sem nota"}${dif != null ? ` <span class="d ${dif > 0 ? "up" : dif < 0 ? "dn" : ""}">${dif > 0 ? "▲ +" : dif < 0 ? "▼ " : "= "}${dif}</span>` : ""}${q?.desat ? ' <span class="tag">doutorado a desativar</span>' : ""}</span>
        <span class="mut">${A}: ${hc(r.conc)}${ant != null ? ` · anterior ${ant}` : ""}</span></div>
      <div class="nums"><div><b>${fmt(mat)}</b><span>matric.</span></div><div><b>${fmt(tit)}</b><span>titulados</span></div><div><b>${fmt(perm)}</b><span>docentes perm.</span></div></div>
      ${sparkline(ANOS.map(a => D.serie[p.cod]?.[a]?.mat ?? null), cssVar("--c-u"))}
      ${rede ? '<div class="mut" style="font-size:11px">Números da rede inteira</div>' : ""}
      <div class="ppg-rodape"><span class="ppg-site">${st.geral ? "Página dos programas (ProPG) ↗" : "Site do programa ↗"}</span><button class="ppg-traj" data-c="${p.cod}" title="Ver a trajetória do programa">Trajetória</button></div></article>`;
  };
  const grupos2 = {};
  lista.forEach(p => { const r = p.anos[A], k = S.grp === "area" ? cap(r.ga) : S.grp === "nota" ? (notaQ(p) != null ? "Conceito " + notaQ(p) : "Sem nota na Quadrienal") : ""; (grupos2[k] ??= []).push(p); });
  const chaves = Object.keys(grupos2).sort((a, b) => S.grp === "nota" ? b.localeCompare(a) : a.localeCompare(b, "pt"));
  const corpo = chaves.map(k => `${k ? `<h2 class="sec">${esc(k)} <span class="sub" style="display:inline">(${grupos2[k].length})</span></h2>` : ""}<div class="ppg-grid">${grupos2[k].map(card).join("")}</div>`).join("") || '<p class="sub">Nenhum programa com os filtros atuais.</p>';

  el.innerHTML = `<h2 class="sec">Programas de pós-graduação da UFSCar</h2>
    <p class="sub">Referência: <b>Conceito CAPES 2025</b> (Avaliação Quadrienal, resultado de 05/2026). Em <b>${A}</b> são <b>${base.length}</b> programas: <b>${nSede}</b> da UFSCar e <b>${nRede}</b> em rede com a UFSCar associada.${semNota ? ` ${semNota} sem nota na planilha da Quadrienal.` : ""} Nos cartões dos programas em rede, matriculados, titulados e docentes são da rede inteira e não entram nos totais da UFSCar.</p>
    <div class="chips" style="margin-bottom:10px">${dist.map(([n, c]) => `<button class="chip ${S.conc === String(n) ? "on" : ""}" data-n="${n}" aria-pressed="${S.conc === String(n)}"><i class="dot" style="background:${corConc(String(n))};box-shadow:0 0 0 1px var(--card)"></i>Conceito ${n}: ${c}</button>`).join("")}${semNota ? `<button class="chip ${S.conc === "sem" ? "on" : ""}" data-n="sem">Sem nota: ${semNota}</button>` : ""}</div>
    <div class="campi" role="group" aria-label="Filtrar por campus"><span class="campi-t">Campus</span>
      <button class="chip ${!S.mun ? "on" : ""}" data-m="">Todos (${base.length})</button>
      ${campiOrd.map(([c, n]) => `<button class="chip ${S.mun === c ? "on" : ""}" data-m="${esc(c)}">${esc(c)} (${n})</button>`).join("")}
      ${nRede ? `<button class="chip ${S.mun === "__rede" ? "on" : ""}" data-m="__rede">Em rede, outras IES (${nRede})</button>` : ""}</div>
    <div class="controles">
      <label>Ano<select id="pg-ano">${ANOS.map(a => `<option ${a === A ? "selected" : ""}>${a}</option>`).join("")}</select></label>
      <label>Buscar<input type="search" id="pg-q" placeholder="nome do programa" value="${esc(S.busca)}"></label>
      <label>Vínculo<select id="pg-v"><option value="">Todos</option><option value="sede" ${S.vinc === "sede" ? "selected" : ""}>UFSCar (${nSede})</option><option value="rede" ${S.vinc === "rede" ? "selected" : ""}>Em rede, associada (${nRede})</option></select></label>
      <label>Ordenar por<select id="pg-o">${[["nota", "Conceito 2025"], ["nome", "Nome"], ["ini", "Mais antigos"], ["inir", "Mais recentes"], ["mat", "Matriculados"], ["tit", "Titulados"]].map(([v, t]) => `<option value="${v}" ${S.ord === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Agrupar por<select id="pg-g">${[["", "Sem agrupamento"], ["area", "Grande área"], ["nota", "Conceito 2025"]].map(([v, t]) => `<option value="${v}" ${S.grp === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <button class="btn" id="pg-csv">Baixar CSV</button>
    </div>
    ${corpo}
    <h2 class="sec">Panorama 3D: porte, corpo docente e conceito</h2>
    <article class="card" id="p3d-card"><h3>Programas da UFSCar em três dimensões</h3>
      <p class="sub">Cada ponto é um programa da UFSCar em ${A}: <b>docentes permanentes</b> (eixo X), <b>discentes matriculados</b> (eixo Y) e <b>Conceito CAPES 2025</b> (eixo Z, altura). Cor = grande área; tamanho = titulados no ano. A sombra no piso mostra o porte (docentes × matriculados). Arraste para girar, role para aproximar e passe o mouse para ver o programa. Acompanha os filtros de área, nível e ano.</p>
      <div class="p3d-ctrl" role="group" aria-label="Pontos de vista do gráfico 3D"><span class="rot">Ver de:</span>
        <button type="button" class="btn mini" data-v="persp" aria-pressed="true">Perspectiva</button>
        <button type="button" class="btn mini" data-v="porte" aria-pressed="false">Cima: docentes × matriculados</button>
        <button type="button" class="btn mini" data-v="matc" aria-pressed="false">Lado: matriculados × conceito</button>
        <button type="button" class="btn mini" data-v="docc" aria-pressed="false">Frente: docentes × conceito</button>
        <button type="button" class="btn-outline mini" id="p3d-tab" aria-expanded="false">Ver tabela</button></div>
      <div class="p3d" id="p3d" role="img" aria-label="Gráfico 3D dos programas da UFSCar; a mesma informação está na tabela do botão Ver tabela e no resumo abaixo."><div class="p3d-fallback">Carregando a visualização 3D…</div></div>
      <p class="sub" id="p3d-resumo" style="margin:.75rem 0 0"></p>
    </article>
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
  $("#pg-csv").onclick = () => baixar(`programas_ufscar_${A}.csv`, csv([["codigo", "programa", "vinculo", "grande_area", "nivel", "municipio_ou_coordenacao", "ano_criacao", "anos_existencia", "conceito_2025", `conceito_${A}`, "matriculados", "titulados", "docentes_permanentes"],
    ...lista.map(p => { const r = p.anos[A]; return [p.cod, r.nome, sede(p) ? "UFSCar" : "Rede (associada)", r.ga, r.grau, sede(p) ? campusDe(r.mun) : r.ies, r.inicio ?? "", idade(r.inicio) ?? "", notaQ(p) ?? "", r.conc, ser(p, "mat") ?? "", ser(p, "tit") ?? "", ser(p, "perm") ?? ""]; })]));

  const H = todos.filter(p => areaOk(p.ultimo.ga) && grauOk(p.ultimo.grau)).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  $("#pg-heat").className = "heat";
  $("#pg-heat").innerHTML = `<thead><tr><th class="t">Programa</th><th title="Ano de criação do programa">Início</th>${ANOS.map(a => `<th>${String(a).slice(2)}</th>`).join("")}<th title="Conceito CAPES 2025 (Quadrienal)">2025</th></tr></thead><tbody>` +
    H.map(p => `<tr data-id="${p.cod}"><td title="${esc(p.nome)}">${esc(cap(p.nome))}${p.papel === "sede" ? "" : ' <span class="tag assoc">rede</span>'}</td><td>${esc(p.ultimo.inicio ?? "")}</td>${ANOS.map(a => { const r = p.anos[a]; return `<td title="${a}: ${r ? "conceito " + r.conc : "sem registro"}">${r ? hc(r.conc) : ""}</td>`; }).join("")}<td title="Conceito CAPES 2025">${notaQ(p) != null ? hc(String(notaQ(p))) : ""}</td></tr>`).join("") + "</tbody>";
  $$("#pg-heat tbody tr").forEach(tr => tr.onclick = () => abrirPrograma(tr.dataset.id));

  const propios = base.filter(sede), gU = GRUPOS[0];
  const cs = [7, 6, 5, 4, 3];
  const qr = GRUPOS.map(g => qRows(g, { grau: false }));
  grafico("pg-g1", "bar", cs.map(c => "Nota " + c), GRUPOS.map((g, i) => barra(i === 0 ? "UFSCar (programas da UFSCar)" : g.nome, cssVar(g.cor), cs.map(c => pct(qr[i].filter(r => r.nota === c).length, qr[i].length)))), { suf: "%", legend: true });
  const porMun = {}; propios.forEach(p => { const c = campusDe(p.anos[A].mun); porMun[c] = (porMun[c] || 0) + 1; });
  const ms = Object.entries(porMun).sort((a, b) => b[1] - a[1]);
  grafico("pg-g2", "doughnut", ms.map(m => m[0]), [{ label: "Programas", data: ms.map(m => m[1]), backgroundColor: CAT(), borderWidth: 2, borderColor: DV.card }], { legend: true, dec: 0 });
  panorama3d(propios.map(p => ({ p, r: p.anos[A], nota: notaQ(p), mat: ser(p, "mat"), perm: ser(p, "perm"), tit: ser(p, "tit") })), A);
};

// ---------- Panorama 3D dos programas (Plotly gl3d, carregado só quando a aba Programas abre) ----------
const PLOTLY_URL = "https://cdn.jsdelivr.net/npm/plotly.js-gl3d-dist-min@2.35.2/plotly-gl3d.min.js";
let plotlyP = null, P3D = null;
const carregaPlotly = () => plotlyP ??= new Promise((ok, erro) => {
  if (window.Plotly) return ok(window.Plotly);
  const s = document.createElement("script"); s.src = PLOTLY_URL; s.async = true; s.crossOrigin = "anonymous";
  s.onload = () => window.Plotly ? ok(window.Plotly) : erro(new Error("biblioteca 3D indisponível"));
  s.onerror = () => { plotlyP = null; erro(new Error("não foi possível carregar a biblioteca 3D")); };
  document.head.append(s);
});
const temWebGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };
function destruir3d() { if (P3D && window.Plotly) { try { Plotly.purge(P3D); } catch { } } P3D = null; }
const VISTAS = {
  persp: { eye: { x: 1.25, y: -1.35, z: 0.7 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } },
  // vistas quase planas: câmera alinhada a um eixo, para ler os outros dois
  porte: { eye: { x: 0, y: -0.01, z: 2.3 }, up: { x: 0, y: 1, z: 0 }, center: { x: 0, y: 0, z: 0 } },
  matc: { eye: { x: 2.3, y: 0, z: 0.1 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } },
  docc: { eye: { x: 0, y: -2.3, z: 0.1 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } },
};
const pearson = (xs, ys) => { const n = xs.length; if (n < 3) return null; const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sx = 0, sy = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sx += (x - mx) ** 2; sy += (ys[i] - my) ** 2; }); return sx && sy ? sxy / Math.sqrt(sx * sy) : null; };
function panorama3d(itens, A) {
  const box = $("#p3d"), card = $("#p3d-card"); if (!box) return;
  const ok = itens.filter(i => i.nota != null && i.mat != null && i.perm != null);
  const fora = itens.length - ok.length;
  // resumo textual (também é a descrição para leitores de tela)
  const media = (l, k) => l.length ? l.reduce((s, i) => s + (i[k] || 0), 0) / l.length : null;
  const alto = ok.filter(i => i.nota >= 6), medio = ok.filter(i => i.nota === 5), base = ok.filter(i => i.nota <= 4);
  const r = pearson(ok.map(i => i.perm), ok.map(i => i.mat));
  const faixa = (t, l) => l.length ? `${t} (${l.length}): em média ${fmt(media(l, "mat"))} matriculados e ${fmt(media(l, "perm"))} docentes permanentes` : "";
  $("#p3d-resumo").innerHTML = ok.length ? `<b>Leitura:</b> ${[faixa("conceito 6 ou 7", alto), faixa("conceito 5", medio), faixa("conceito 3 ou 4", base)].filter(Boolean).join("; ")}.` +
    (r != null ? ` Correlação entre docentes permanentes e matriculados: <b>r = ${fmt(r, 2)}</b>.` : "") + (fora ? ` ${fora} programa(s) sem nota na Quadrienal ou sem dados de ${A} ficam fora do gráfico.` : "") : "Nenhum programa com nota e dados para os filtros atuais.";
  // tabela alternativa
  $("#p3d-tab").onclick = e => {
    const b = e.currentTarget, t = card.querySelector(".fig-tab");
    if (t) { t.remove(); b.setAttribute("aria-expanded", "false"); b.textContent = "Ver tabela"; return; }
    const div = document.createElement("div"); div.className = "fig-tab";
    div.innerHTML = `<table><caption>Programas da UFSCar em ${A}: dados do gráfico 3D</caption><thead><tr><th class="t" scope="col">Programa</th><th class="t" scope="col">Grande área</th><th scope="col">Docentes perm. (X)</th><th scope="col">Matriculados (Y)</th><th scope="col">Conceito 2025 (Z)</th><th scope="col">Titulados</th></tr></thead><tbody>` +
      [...ok].sort((x, y) => y.nota - x.nota || y.mat - x.mat).map(i => `<tr><td class="t">${esc(cap(i.r.nome))}</td><td class="t">${esc(cap(i.r.ga))}</td><td>${fmt(i.perm)}</td><td>${fmt(i.mat)}</td><td>${hc(String(i.nota))}</td><td>${fmt(i.tit)}</td></tr>`).join("") + "</tbody></table>";
    box.after(div); b.setAttribute("aria-expanded", "true"); b.textContent = "Ocultar tabela";
  };
  const falha = msg => { box.innerHTML = `<div class="p3d-fallback"><p>${esc(msg)}<br>Os mesmos dados estão na tabela (botão <b>Ver tabela</b>) e no resumo abaixo.</p></div>`; card.querySelectorAll(".p3d-ctrl [data-v]").forEach(b => b.disabled = true); };
  if (!ok.length) return falha("Nenhum programa com nota e dados para os filtros atuais.");
  if (!temWebGL()) return falha("Este navegador não oferece WebGL, necessário para a visualização 3D.");
  const tab = S.tab;
  carregaPlotly().then(Plotly => {
    if (S.tab !== tab || !document.body.contains(box)) return;     // o usuário mudou de aba enquanto carregava
    const areas = [...new Set(ok.map(i => i.r.ga))].sort((a, b) => a.localeCompare(b, "pt")), pal = CAT();
    const tMax = Math.max(1, ...ok.map(i => i.tit || 0));
    const eixo = (titulo, extra = {}) => ({ title: { text: titulo, font: { size: 13, color: DV.ink } }, color: DV.mut, gridcolor: DV.grid, zerolinecolor: DV.grid, backgroundcolor: "rgba(0,0,0,0)", showbackground: true, tickfont: { size: 11 }, separatethousands: true, ...extra });
    const traces = areas.map((ga, k) => { const l = ok.filter(i => i.r.ga === ga); return {
      type: "scatter3d", mode: "markers", name: cap(ga),
      x: l.map(i => i.perm), y: l.map(i => i.mat), z: l.map(i => i.nota),
      text: l.map(i => cap(i.r.nome)), customdata: l.map(i => [fmt(i.tit), cap(i.r.grau)]),
      hovertemplate: "<b>%{text}</b><br>%{customdata[1]}<br>Docentes permanentes: %{x}<br>Matriculados: %{y}<br>Conceito 2025: %{z}<br>Titulados: %{customdata[0]}<extra>%{fullData.name}</extra>",
      marker: { size: l.map(i => 7 + 17 * Math.sqrt((i.tit || 0) / tMax)), color: pal[k % pal.length], opacity: 0.9, line: { color: DV.card, width: 1 } },
      projection: { z: { show: true, opacity: 0.25, scale: 0.6 } },
    }; });
    const layout = {
      paper_bgcolor: "rgba(0,0,0,0)", font: { family: FONTE, color: DV.ink, size: 12 }, margin: { l: 0, r: 0, t: 0, b: 70 },
      hoverlabel: { bgcolor: DV.ttBg, bordercolor: DV.ttBg, font: { family: FONTE, color: DV.ttInk, size: 13 } },
      legend: { orientation: "h", x: 0, y: 0, yanchor: "top", font: { size: 12 }, itemsizing: "constant", itemclick: "toggle", itemdoubleclick: "toggleothers", bgcolor: "rgba(0,0,0,0)" },
      scene: {
        xaxis: eixo("Docentes permanentes", { rangemode: "tozero" }), yaxis: eixo("Matriculados", { rangemode: "tozero" }),
        zaxis: eixo("Conceito 2025", { range: [2.5, 7.5], tickvals: [3, 4, 5, 6, 7], dtick: 1 }),
        aspectmode: "manual", aspectratio: { x: 1.1, y: 1.1, z: 0.75 }, camera: VISTAS.persp, dragmode: "turntable",
      },
    };
    box.innerHTML = "";
    return Plotly.newPlot(box, traces, layout, { responsive: true, displaylogo: false, locale: "pt-BR", modeBarButtonsToRemove: ["toImage", "resetCameraLastSave3d"], toImageButtonOptions: { filename: "panorama3d_programas" } }).then(() => {
      P3D = box;
      card.querySelectorAll(".p3d-ctrl [data-v]").forEach(b => b.onclick = () => {
        card.querySelectorAll(".p3d-ctrl [data-v]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        Plotly.relayout(box, { "scene.camera": VISTAS[b.dataset.v] });
      });
    });
  }).catch(e => falha(`A visualização 3D não pôde ser exibida (${e.message}).`));
}

function abrirPrograma(cod) {
  const p = programas()[cod]; if (!p) return;
  const ser = D.serie[cod] || {}, u = p.ultimo, anosP = ANOS.filter(a => p.anos[a] || ser[a]), rede = p.rede;
  const v = (a, k) => ser[a]?.[k] ?? null;
  const ref = p.anos[S.ano] || u;
  $("#m-corpo").innerHTML = `<h2 id="m-titulo">${esc(cap(p.nome))}</h2>
    <p><a class="btn" style="text-decoration:none;display:inline-block" href="${esc(siteDe(cod).url)}" target="_blank" rel="noopener">${siteDe(cod).geral ? "Página dos programas da UFSCar ↗" : "Site do programa ↗"}</a></p>
    <p><span class="tag ${p.papel === "sede" ? "sede" : "assoc"}">${p.papel === "sede" ? "UFSCar é a sede" : "UFSCar é associada"}</span> ${rede ? '<span class="tag">Programa em rede</span>' : ""}
      <span class="tag">${esc(cap(ref.grau))}</span> <span class="tag">${esc(cap(ref.ga))}</span> <span class="tag">${esc(cap(ref.mun))}</span> ${u.inicio ? `<span class="tag">Início ${esc(u.inicio)}</span> ${selo(u.inicio)}` : ""}</p>
    ${rede ? `<p class="sub">Coordenação: <b>${esc(u.ies)}</b>${u.associadas.length ? ` · Associadas: ${esc(u.associadas.join(", "))}` : ""}. Os números abaixo cobrem a rede inteira, não só a UFSCar.</p>` : ""}
    ${tlinha(p)}
    <p class="sub">Conceito por ano (${ANOS[0]} a ${ANOS.at(-1)}).</p>
    ${D.qmap[cod] ? `<p>Resultado da Quadrienal (05/2026): ${hc(String(D.qmap[cod].nota))} <span class="sub">anterior: ${esc(D.qmap[cod].ant || "–")}${D.qmap[cod].n2 != null ? " · nota reconsiderada" : ""}${D.qmap[cod].desat ? " · CTC-ES recomenda desativar o doutorado" : ""}</span></p>` : ""}
    <p class="sub">Matriculados, titulados, docentes permanentes e ingressantes por ano</p>
    <div class="graf alto"><canvas id="m-g"></canvas></div>`;
  $("#modal").showModal();
  const serie = (k, nome, cor, forte) => linha(nome, cor, ANOS.map(a => v(a, k)), forte);
  destruirModal();
  const cat = CAT();
  grafico("m-g", "line", ANOS.map(String), [serie("mat", "Matriculados", cssVar("--c-u"), true), serie("tit", "Titulados", cat[0]), serie("perm", "Docentes permanentes", cat[1]), serie("ing", "Ingressantes", cat[2])], { dec: 0, legend: true, zero: true });
}
function destruirModal() { charts["m-g"]?.destroy(); delete charts["m-g"]; }

// ---------- Avaliação Quadrienal (resultado + painel de pós-graduação) ----------
function qRows(g, { area = true, grau = true } = {}) {
  return D.q.filter(r => g.t(r) && !(area && S.area && r.ga !== S.area) && !(grau && S.grau && !nivelOk(r.grau, S.grau)));
}
function qStats(rs) {
  const cmp = rs.filter(r => /^[1-7]$/.test(r.ant)), n = rs.length;
  const sobe = cmp.filter(r => r.nota > +r.ant).length, cai = cmp.filter(r => r.nota < +r.ant).length;
  return { n, c57: pct(rs.filter(r => r.nota >= 5).length, n), c67: pct(rs.filter(r => r.nota >= 6).length, n),
    media: mediaN(rs.map(r => r.nota)),
    cmp: cmp.length, sobe, cai, igual: cmp.length - sobe - cai,
    ant57: pct(cmp.filter(r => +r.ant >= 5).length, cmp.length) };
}
const mediana = v => { const s = v.filter(x => x != null).sort((p, q) => p - q), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const mediaN = v => { const a = v.filter(x => x != null && !Number.isNaN(+x)); return a.length ? a.reduce((s, x) => s + +x, 0) / a.length : null; };
const NIVEL_SIGLA = { "MESTRADO": "ME", "DOUTORADO": "DO", "MESTRADO PROFISSIONAL": "MP", "DOUTORADO PROFISSIONAL": "DP" };
const VINC = { Sede: "Sede na UFSCar", "Associação": "Em associação (UFSCar coordena)", Rede: "Em rede (UFSCar associada)" };
const isNum = a => /^[1-7]$/.test(a);

// programas da UFSCar no ano mais recente, com a nota da Quadrienal quando existe (inclui os sem resultado publicado)
function programasQuadrienal() {
  const ult = ANOS.at(-1), out = [];
  Object.values(programas()).forEach(p => {
    const m = p.anos[ult]; if (!m) return;
    const rede = m.papel !== "sede";
    const q = D.qmap[p.cod];
    const vinc = rede ? "Rede" : (m.rede ? "Associação" : "Sede");
    out.push({
      cod: p.cod, nome: m.nome, area: q?.area || m.area, ga: q?.ga || m.ga, grau: m.grau, mun: m.mun, ies: m.ies, vinc,
      nivel: q?.nivel || m.grau.split("/").map(t => NIVEL_SIGLA[t.trim()] || t).join("/"),
      ant: q?.ant ?? m.conc, nota: q?.nota ?? null, n2: q?.n2 ?? null, desat: !!q?.desat, assoc: (m.associadas || []).filter(s => s !== "UFSCAR"),
    });
  });
  return out;
}
ABAS.quadrienal = el => {
  const rs = GRUPOS.map(g => qRows(g)), st = rs.map(qStats);
  const todos = programasQuadrienal().filter(r => (!S.area || r.ga === S.area) && (!S.grau || nivelOk(r.grau, S.grau)));
  const x = todos.filter(r => (!S.qvin || r.vinc === S.qvin) && (!S.qnota || (S.qnota === "sem" ? r.nota == null : r.nota === +S.qnota)));
  const comN = x.filter(r => r.nota != null), dl = r => r.nota != null && isNum(r.ant) ? r.nota - +r.ant : null;
  const rede = x.filter(r => r.vinc === "Rede"), assoc = x.filter(r => r.vinc === "Associação");
  const kp = (t, f, sub) => `<div class="kpi" style="cursor:default"><h3>${t}</h3><div class="v">${f(st[0])}</div>${sub ? `<p class="sub" style="margin:0">${sub(st[0])}</p>` : ""}<ul>${[1, 2].map(i => `<li><span><i class="dot" style="background:${cssVar(GRUPOS[i].cor)}"></i>${i === 1 ? "Sudeste" : "Brasil"}</span><b>${f(st[i])}</b></li>`).join("")}</ul></div>`;
  const k1 = (t, v, sub) => `<div class="kpi" style="cursor:default"><h3>${t}</h3><div class="v">${v}</div>${sub ? `<p class="sub" style="margin:0">${sub}</p>` : ""}</div>`;
  const nm = v => v == null ? "–" : fmt(v, 2);
  const subiu = x.filter(r => dl(r) > 0).length, igual = x.filter(r => dl(r) === 0).length, caiu = x.filter(r => dl(r) < 0).length;
  const nota5 = comN.filter(r => r.nota >= 5).length;
  el.innerHTML = `<h2 class="sec">Avaliação Quadrienal: resultado de 2025</h2>
    <p class="sub">Ciclo avaliado 2021–2024, oficialmente “Quadrienal 2025”; resultado publicado pela CAPES em ${esc(D.qinfo.publicado.split("-").reverse().join("/"))}. <a href="${esc(D.qinfo.pagina)}" target="_blank" rel="noopener">Fonte oficial</a>. ${esc(D.qinfo.obs)} Programas <b>em associação</b> (coordenados pela UFSCar com outra instituição) e <b>em rede</b> (coordenados em outra instituição, UFSCar associada) aparecem separados; neles a nota é a do programa como um todo e a planilha lista só a instituição coordenadora.</p>
    <div class="controles">
      <label>Vínculo<select id="q-vin"><option value="">Todos</option>${Object.entries(VINC).map(([k, t]) => `<option value="${k}" ${S.qvin === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Nota 2025<select id="q-nota"><option value="">Todas</option>${[3, 4, 5, 6, 7].map(n => `<option value="${n}" ${S.qnota === String(n) ? "selected" : ""}>${n}</option>`).join("")}<option value="sem" ${S.qnota === "sem" ? "selected" : ""}>Sem resultado publicado</option></select></label>
      <span class="sub" style="margin:0">Também valem os filtros de grande área e nível da barra superior.</span>
    </div>
    <h2 class="sec">Programas da UFSCar na seleção</h2>
    <div class="kpis">
      ${k1("Programas na seleção", fmt(x.length), `${comN.length} com resultado publicado`)}
      ${k1("Nota média (3 a 7)", nm(mediaN(comN.map(r => r.nota))), "recomendação final 2025")}
      ${k1("Programas com nota 5 ou mais", comN.length ? fmt(pct(nota5, comN.length), 1) + "%" : "–", `${nota5} de ${comN.length}`)}
      ${k1("Excelência (nota 6 ou 7)", fmt(comN.filter(r => r.nota >= 6).length), `${comN.filter(r => r.nota === 7).length} com nota 7`)}
      ${k1("Subiram de nota", fmt(subiu), `${igual} mantiveram · ${caiu} caíram`)}
      ${k1("Programas em associação", fmt(assoc.length), "UFSCar coordena com outra instituição")}
      ${k1("Programas em rede", fmt(rede.length), "UFSCar como associada")}
      ${k1("Programas com doutorado", fmt(x.filter(r => /DO|DP/.test(r.nivel || "")).length), "ME/DO, DO e DP")}
      ${k1("Mestrado ou doutorado profissional", fmt(x.filter(r => /MP|DP/.test(r.nivel || "")).length), "MP e DP")}
      ${k1("Fora de São Carlos", fmt(x.filter(r => r.vinc !== "Rede" && !/são carlos/i.test(r.mun || "")).length), "Sorocaba, Araras e Buri")}
    </div>
    <h2 class="sec">Comparação com o Sudeste e o Brasil</h2>
    <p class="sub">${esc(GRUPOS[1].nome)} e ${esc(GRUPOS[2].nome)}; vale o filtro de universo da barra superior. Todos os programas com nota final.</p>
    <div class="kpis">
      ${kp("Nota média", s => nm(s.media), s => `${s.n} programas`)}
      ${kp("% com nota 5 a 7", s => fmt(s.c57, 1) + "%", s => `antes: ${fmt(s.ant57, 1)}% (entre os comparáveis)`)}
      ${kp("% com nota 6 ou 7", s => fmt(s.c67, 1) + "%")}
      ${kp("Subiram de nota", s => fmt(pct(s.sobe, s.cmp), 1) + "%", s => `${s.sobe} de ${s.cmp} programas`)}
      ${kp("Mantiveram", s => fmt(pct(s.igual, s.cmp), 1) + "%", s => `${s.igual} programas`)}
      ${kp("Caíram de nota", s => fmt(pct(s.cai, s.cmp), 1) + "%", s => `${s.cai} programas`)}
    </div>
    <div class="grade" style="margin-top:1.1rem">
      <article class="card"><h3>Programas por nota na Quadrienal 2025</h3><p class="sub">UFSCar, na seleção</p><div class="graf"><canvas id="q0"></canvas></div></article>
      <article class="card"><h3>Distribuição das notas</h3><p class="sub">% dos programas avaliados</p><div class="graf"><canvas id="q1"></canvas></div></article>
      <article class="card"><h3>Notas dos programas da UFSCar ao longo dos ciclos</h3><p class="sub">Conceito vigente em cada ano-base (2013–2024) e resultado de 2025, programas com sede na UFSCar na seleção. “Novo” = sem nota ainda.</p><div class="graf"><canvas id="q4"></canvas></div></article>
      <article class="card"><h3>Mudança em relação ao conceito anterior</h3><p class="sub">% dos programas que já tinham conceito (exclui programas novos)</p><div class="graf"><canvas id="q2"></canvas></div></article>
      <article class="card"><h3>UFSCar: conceito anterior x nota atual</h3><p class="sub">número de programas, na seleção</p><div class="graf"><canvas id="q3"></canvas></div></article>
      <article class="card"><h3>Nota média por grande área</h3><p class="sub">UFSCar, programas com nota na seleção</p><div class="graf"><canvas id="q5"></canvas></div></article>
    </div>
    <h2 class="sec">Programas em associação (${assoc.length})</h2>
    <p class="sub">Coordenados pela UFSCar em associação com outra instituição de ensino.</p>
    <div class="tabela-wrap"><table id="q-assoc"></table></div>
    <h2 class="sec">Programas em rede (${rede.length})</h2>
    <p class="sub">Coordenados em outra instituição, com a UFSCar como associada. A nota é a da rede.</p>
    <div class="tabela-wrap"><table id="q-rede"></table></div>
    <h2 class="sec">Consulta de programas de pós-graduação (${x.length})</h2>
    <p class="sub">Clique em um programa para ver a trajetória. “Conceito anterior” é o da base de Programas 2024, anterior a este resultado.</p>
    <div class="acoes" style="margin:0 0 .6rem"><button class="btn" id="q-csv">Baixar CSV</button></div>
    <div class="tabela-wrap"><table id="q-tab"></table></div>`;

  $("#q-vin").onchange = e => { S.qvin = e.target.value; render(); };
  $("#q-nota").onchange = e => { S.qnota = e.target.value; render(); };

  // gráficos
  const cats = [["1 e 2", r => r.nota <= 2], ["Nota 3", r => r.nota === 3], ["Nota 4", r => r.nota === 4], ["Nota 5", r => r.nota === 5], ["Nota 6", r => r.nota === 6], ["Nota 7", r => r.nota === 7]];
  grafico("q0", "bar", [3, 4, 5, 6, 7].map(n => "Nota " + n), [barra("Programas", [3, 4, 5, 6, 7].map(n => corConc(String(n))), [3, 4, 5, 6, 7].map(n => comN.filter(r => r.nota === n).length))], { dec: 0 });
  grafico("q1", "bar", cats.map(c => c[0]), GRUPOS.map((g, i) => barra(g.nome, cssVar(g.cor), cats.map(c => pct(rs[i].filter(c[1]).length, rs[i].length)))), { suf: "%", legend: true });
  grafico("q2", "bar", GRUPOS.map(g => g.nome), [["Subiram", st.map(s => pct(s.sobe, s.cmp)), DV.pos], ["Mantiveram", st.map(s => pct(s.igual, s.cmp)), DV.neu], ["Caíram", st.map(s => pct(s.cai, s.cmp)), DV.neg]].map(([n, d, c]) => barra(n, c, d)), { stacked: true, suf: "%", legend: true, horizontal: true });
  const cmpU = x.filter(r => isNum(r.ant)), ns = [3, 4, 5, 6, 7];
  grafico("q3", "bar", ns.map(c => "Nota " + c), [barra("Conceito anterior", DV.neu, ns.map(c => cmpU.filter(r => +r.ant === c).length)), barra("Quadrienal 2025", AZUL(),ns.map(c => x.filter(r => r.nota === c).length))], { dec: 0, legend: true });
  // ciclos: conceito por ano-base (programas com sede na seleção) + nota 2025
  const sedes = new Set(x.filter(r => r.vinc !== "Rede").map(r => r.cod)), anosC = [...ANOS.map(String), "2025"];
  const cont = c => anosC.map(a => a === "2025" ? (c === "A" ? 0 : x.filter(r => r.vinc !== "Rede" && r.nota === +c).length)
    : Object.values(programas()).filter(p => sedes.has(p.cod) && p.anos[+a] && String(p.anos[+a].conc) === String(c)).length);
  grafico("q4", "bar", anosC, ["A", 2, 3, 4, 5, 6, 7].map(c => barra(c === "A" ? "Novo (sem nota)" : "Nota " + c, corConc(String(c)), cont(c))), { stacked: true, dec: 0, legend: true });
  const porGa = Object.entries(comN.reduce((m, r) => ((m[r.ga] ??= []).push(r.nota), m), {})).map(([l, v]) => [cap(l), mediaN(v), v.length]).sort((a, b) => b[1] - a[1]);
  grafico("q5", "bar", porGa.map(([l, , n]) => `${l} (${n})`), [barra("Nota média", AZUL(), porGa.map(r => r[1]))], { dec: 2, horizontal: true });
  charts.q5.options.scales.x.max = 7; charts.q5.options.scales.x.min = 0; charts.q5.update();

  // tabelas
  const instit = r => { const l = r.assoc; return l.length ? `${l.length}: ${esc(l.slice(0, 5).join(", "))}${l.length > 5 ? "…" : ""}` : "–"; };
  const fnota = v => v == null ? "–" : hc(String(v)), fant = v => v == null ? "–" : hc(String(v));
  const L = (r, ...cols) => ({ id: r.cod, v: cols.map(c => typeof c === "function" ? c(r) : r[c]), r });
  const tAssoc = [{ h: "Programa", t: 1 }, { h: "Área de avaliação", t: 1 }, { h: "Nível", t: 1 }, { h: "Instituição associada", t: 1, f: (v, l) => instit(l.r) }, { h: "Nota anterior", f: fant }, { h: "Nota 2025", f: fnota }];
  const tRede = [{ h: "Programa", t: 1 }, { h: "Coordenação", t: 1 }, { h: "Instituições da rede", t: 1, f: (v, l) => instit(l.r) }, { h: "Nota anterior", f: fant }, { h: "Nota 2025", f: fnota }];
  const abre = c => programas()[c] && abrirPrograma(c);
  tabela($("#q-assoc"), tAssoc, assoc.map(r => L(r, x => cap(x.nome), x => cap(x.area), "nivel", "assoc", x => isNum(x.ant) ? +x.ant : x.ant === "A" ? "A" : null, "nota")), { ordem: 0, aoClicar: abre });
  tabela($("#q-rede"), tRede, rede.map(r => L(r, x => cap(x.nome), "ies", "assoc", x => isNum(x.ant) ? +x.ant : x.ant === "A" ? "A" : null, "nota")), { ordem: 0, aoClicar: abre });
  const tCons = [{ h: "Programa", t: 1 }, { h: "Área de avaliação", t: 1 }, { h: "Grande área", t: 1 }, { h: "Nível", t: 1 }, { h: "Município", t: 1 }, { h: "Vínculo", t: 1 }, { h: "Nota anterior", f: fant }, { h: "Nota 2025", f: fnota },
    { h: "Variação", f: v => v == null ? "–" : `<span class="d ${v > 0 ? "up" : v < 0 ? "dn" : ""}">${v > 0 ? "▲ +" : v < 0 ? "▼ " : "= "}${v}</span>` }];
  const linhas = x.map(r => L(r, y => cap(y.nome), y => cap(y.area), y => cap(y.ga), "nivel", y => campusDe(y.mun), y => ({ Sede: "Sede", "Associação": "Associação", Rede: "Rede" }[y.vinc]),
    y => isNum(y.ant) ? +y.ant : y.ant === "A" ? "A" : null, "nota", y => dl(y)));
  tabela($("#q-tab"), tCons, linhas, { ordem: 7, desc: true, aoClicar: abre });
  $("#q-csv").onclick = () => baixar("avaliacao_quadrienal_ufscar.csv", csv([["codigo", "programa", "area_avaliacao", "grande_area", "nivel", "municipio", "vinculo", "conceito_anterior", "nota_quadrienal_2025"],
    ...x.map(r => [r.cod, r.nome, r.area, r.ga, r.nivel, r.mun, VINC[r.vinc], r.ant, r.nota ?? ""])]));
};

// ---------- Pós-Graduação Lato sensu (especialização, e-MEC) ----------
ABAS.lato = el => {
  const L = D.lato;
  if (!L) { el.innerHTML = '<h2 class="sec">Pós-Graduação Lato sensu</h2><p class="sub">Dados do e-MEC indisponíveis no momento.</p>'; return; }
  const E = L.cursos, uniqS = a => [...new Set(a)].filter(Boolean).sort((p, q) => String(p).localeCompare(String(q), "pt"));
  const mods = uniqS(E.map(r => r.modalidade)), areas = uniqS(E.map(r => r.area)), campi = uniqS(E.map(r => r.campus));
  const f = S.lato;
  el.innerHTML = `<h2 class="sec">Pós-Graduação Lato sensu</h2>
    <p class="sub">Cursos de <b>especialização</b> cadastrados no e-MEC pela UFSCar (retrato do cadastro em ${esc(L.coletado_em.split("-").reverse().join("/"))}). “Ativo” = curso em oferta; “Inativo” = curso ou turma não mais ofertado. Cada turma pode aparecer como um curso separado. Fonte: <a href="${esc(L.url)}" target="_blank" rel="noopener">e-MEC</a> (API Olinda do MEC). Os filtros de grande área, nível e universo da barra superior não se aplicam a esta aba.</p>
    <div id="l0"></div>
    <div class="grade">
      <article class="card"><h3>Especializações por situação e modalidade</h3><p class="sub">todos os cursos cadastrados</p><div class="graf"><canvas id="l1"></canvas></div></article>
      <article class="card"><h3>Especializações por área (OCDE/CINE)</h3><p class="sub">acompanha os filtros abaixo</p><div class="graf"><canvas id="l2"></canvas></div></article>
      <article class="card"><h3>Cursos por município</h3><p class="sub">acompanha os filtros abaixo</p><div class="graf"><canvas id="l3"></canvas></div></article>
      <article class="card"><h3>Cursos por faixa de carga horária</h3><p class="sub">acompanha os filtros abaixo</p><div class="graf"><canvas id="l4"></canvas></div></article>
    </div>
    <h2 class="sec">Consulta de cursos de especialização</h2>
    <div class="controles">
      <label>Situação<select id="l-sit">${[["", "Todas"], ["Ativo", "Ativo"], ["Inativo", "Inativo"]].map(([v, t]) => `<option value="${v}" ${f.sit === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Modalidade<select id="l-mod"><option value="">Todas</option>${mods.map(m => `<option ${f.mod === m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></label>
      <label>Área<select id="l-area"><option value="">Todas</option>${areas.map(m => `<option value="${esc(m)}" ${f.area === m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></label>
      <label>Município<select id="l-camp"><option value="">Todos</option>${campi.map(m => `<option value="${esc(m)}" ${f.camp === m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></label>
      <label>Busca<input type="search" id="l-q" placeholder="nome do curso…" value="${esc(f.q)}"></label>
      <button class="btn" id="l-csv">Baixar CSV</button>
    </div>
    <div class="tabela-wrap"><table id="l-tab"></table></div>`;

  const x = E.filter(r => (!f.sit || r.sit === f.sit) && (!f.mod || r.modalidade === f.mod) && (!f.area || r.area === f.area) && (!f.camp || r.campus === f.camp) && (!f.q || sa(r.nome).includes(sa(f.q))));
  const at = E.filter(r => r.sit === "Ativo"), kpi1 = (t, v, s) => `<div class="kpi" style="cursor:default"><h3>${t}</h3><div class="v">${v}</div>${s ? `<p class="sub" style="margin:0">${s}</p>` : ""}</div>`;
  $("#l0").innerHTML = `<div class="kpis">${kpi1("Especializações cadastradas", fmt(E.length), `${uniqS(E.map(r => r.area)).length} áreas`)}${kpi1("Ativas", fmt(at.length), `${fmt(pct(at.length, E.length), 0)}% do total`)}${kpi1("Inativas", fmt(E.length - at.length))}${kpi1("Vagas (ativas)", fmt(sum(at, "vagas")))}${kpi1("Carga horária mediana (ativas)", fmt(mediana(at.map(r => r.ch)), 0), "horas, sem distorção das residências")}${kpi1("Residências (ativas)", fmt(at.filter(r => /resid[eê]ncia/i.test(r.nome)).length), "médicas e multiprofissionais (5.760 h ou mais)")}${kpi1("Cursos a distância (ativos)", fmt(at.filter(r => r.modalidade === "EAD").length), `${fmt(at.filter(r => r.modalidade !== "EAD").length)} presenciais`)}</div>`;
  grafico("l1", "bar", mods, ["Ativo", "Inativo"].map((s, i) => barra(s, i ? DV.neu : AZUL(),mods.map(m => E.filter(r => r.sit === s && r.modalidade === m).length))), { stacked: true, dec: 0, legend: true });
  const conta = k => Object.entries(x.reduce((m, r) => ((m[r[k] || "Não informado"] = (m[r[k] || "Não informado"] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const ar = conta("area").slice(0, 12), mu = conta("campus").slice(0, 10);
  grafico("l2", "bar", ar.map(a => a[0]), [barra("Cursos", AZUL(), ar.map(a => a[1]))], { dec: 0, horizontal: true });
  grafico("l3", "bar", mu.map(a => a[0]), [barra("Cursos", AZUL(), mu.map(a => a[1]))], { dec: 0, horizontal: true });
  const faixas = [["até 360 h", r => r.ch <= 360], ["361–450 h", r => r.ch > 360 && r.ch <= 450], ["451–600 h", r => r.ch > 450 && r.ch <= 600], ["mais de 600 h", r => r.ch > 600]];
  grafico("l4", "bar", faixas.map(a => a[0]), [barra("Cursos", AZUL(), faixas.map(([, fn]) => x.filter(r => r.ch != null && fn(r)).length))], { dec: 0 });

  const cols = [{ h: "Curso", t: 1 }, { h: "Área", t: 1 }, { h: "Modalidade", t: 1 }, { h: "Município", t: 1 }, { h: "Situação", t: 1, f: v => `<span class="pill ${v === "Ativo" ? "em_dia" : ""}">${esc(v)}</span>` }, { h: "Vagas", f: v => fmt(v) }, { h: "Carga horária", f: v => fmt(v) }, { h: "Duração (meses)", f: v => fmt(v) }];
  tabela($("#l-tab"), cols, x.map(r => ({ id: r.cod, v: [r.nome, r.area, r.modalidade, r.campus, r.sit, r.vagas, r.ch, r.dur] })), { ordem: 0 });
  [["#l-sit", "sit"], ["#l-mod", "mod"], ["#l-area", "area"], ["#l-camp", "camp"]].forEach(([id, k]) => $(id).onchange = e => { f[k] = e.target.value; render(); });
  $("#l-q").oninput = e => { f.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $("#l-q"); q.focus(); q.setSelectionRange(pos, pos); };
  $("#l-csv").onclick = () => baixar("especializacoes_ufscar.csv", csv([["codigo", "curso", "area", "modalidade", "municipio", "situacao", "vagas", "carga_horaria", "duracao_meses"], ...x.map(r => [r.cod, r.nome, r.area, r.modalidade, r.campus, r.sit, r.vagas ?? "", r.ch ?? "", r.dur ?? ""])]));
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
  const pal = CAT();
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
      ${tlinha(p)}
      <div class="sub" style="margin:0">${u.associadas.length ? `${u.associadas.length} IES associadas${u.associadas.length < 14 ? ": " + esc(u.associadas.join(", ")) : ""}` : ""}</div></button>`;
  };
  el.innerHTML = `<h2 class="sec">Programas em rede com participação da UFSCar</h2>
    <p class="sub">Redes nacionais e associações entre instituições. Os dados de discentes e docentes são da <b>rede inteira</b> (a CAPES não separa por instituição associada), por isso esses números não entram nos totais da UFSCar (os programas entram só na contagem de programas). Clique em um cartão para ver a trajetória.</p>
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
const JUR = [["FEDERAL", "Federais"], ["ESTADUAL", "Estaduais"], ["MUNICIPAL", "Municipais"], ["PARTICULAR", "Privadas"]];
const NAT = { FEDERAL: "Federal", ESTADUAL: "Estadual", MUNICIPAL: "Municipal", PARTICULAR: "Privada" };
const jurSel = () => new Set(S.rkJur ?? (S.univ === "fed" ? ["FEDERAL"] : JUR.map(j => j[0])));
const jurTxt = () => { const s = jurSel(); return s.size === 4 ? "todas as naturezas" : JUR.filter(j => s.has(j[0])).map(j => j[1].toLowerCase()).join(", "); };
const RK = ["prog", "mat", "ing", "tit", "perm", "razao", "conc", "meses"];
ABAS.ranking = el => {
  const ref = S.a1, a0 = S.a0;
  const todas = [...new Set(Y.disc_a[ref].map(r => r.ies).filter(Boolean))].filter(s => D.ies[s]);
  const jurs = jurSel();
  const lista = todas.filter(s => jurs.has(D.ies[s].jur) || S.sel.includes(s));
  const gI = s => ({ k: "i_" + s, t: r => r.ies === s });
  const lin = lista.map(s => { const g = gI(s); return { id: s, v: [s, D.ies[s].uf, NAT[D.ies[s].jur] ?? "", val("prog", g, ref), val("mat", g, ref), pct(val("mat", g, ref) - val("mat", g, a0), val("mat", g, a0)), val("tit", g, ref), val("perm", g, ref), val("razao", g, ref), val("conc", g, ref), val("meses", g, ref)] }; }).filter(l => l.v[3] || l.v[4]);
  S.sel = S.sel.filter(s => lista.includes(s)); if (!S.sel.length) S.sel = [U];
  const outras = todas.filter(s => s !== U).sort((a, b) => a.localeCompare(b, "pt"));
  const par = S.sel.find(s => s !== U) || "";
  const optAnos = (v) => ANOS.map(a => `<option ${a === v ? "selected" : ""}>${a}</option>`).join("");
  el.innerHTML = `<h2 class="sec">Instituições do Sudeste (${jurTxt()})</h2>
    <p class="sub">Janela de comparação: <b>${a0}–${ref}</b>. Os indicadores da tabela são de ${ref}; a variação compara com ${a0}. Escolha uma instituição para comparar com a UFSCar ou clique nas linhas da tabela para incluir até 6 no gráfico.</p>
    <div class="card"><div class="controles">
      <label>Natureza das IES<span id="k-jur" class="chips-row">${JUR.map(([j, n]) => `<button type="button" class="chip ${jurs.has(j) ? "on" : ""}" data-j="${j}">${n}</button>`).join("")}<button type="button" class="chip" data-p="pub">Públicas</button><button type="button" class="chip" data-p="all">Todas</button></span></label>
      <label>Comparar a UFSCar com<select id="k-ies"><option value="">Escolha uma IES</option>${JUR.map(([j, n]) => `<optgroup label="${n}">${outras.filter(s => D.ies[s].jur === j).map(s => `<option value="${esc(s)}" ${s === par ? "selected" : ""}>${esc(s)} – ${esc(cap(D.ies[s].nome))}</option>`).join("")}</optgroup>`).join("")}</select></label>
      <label>Indicador<select id="k-met">${RK.map(k => `<option value="${k}" ${k === S.rkMetric ? "selected" : ""}>${M[k].t}</option>`).join("")}</select></label>
      <label>De<select id="k-a0">${optAnos(a0)}</select></label>
      <label>Até<select id="k-a1">${optAnos(ref)}</select></label>
      <label>Visualização<span class="seg" id="k-modo"><button data-v="abs" class="${S.rkModo === "abs" ? "on" : ""}">Valores</button><button data-v="idx" class="${S.rkModo === "idx" ? "on" : ""}">Índice</button></span></label></div>
      ${aviso(S.rkMetric)}
      <div class="leg" id="k-leg"></div><div class="graf alto"><canvas id="k-g"></canvas></div></div>
    <h2 class="sec">Ranking</h2><div class="tabela-wrap"><table id="k-tab"></table></div>
    <div id="k-area"></div>`;
  const draw = () => {
    const k = S.rkMetric, anos = anosRange(), idx = S.rkModo === "idx" && M[k].kind === "soma";
    const outrasSel = S.sel.filter(s => s !== U), corI = s => s === U ? cssVar("--c-u") : CAT()[outrasSel.indexOf(s) % 9];
    $("#k-leg").innerHTML = S.sel.map(s => `<button data-s="${s}" title="Remover ${esc(s)} do gráfico"><i class="dot" style="background:${corI(s)}"></i>${esc(s)} ×</button>`).join("");
    $$("#k-leg button").forEach(b => b.onclick = () => { S.sel = S.sel.filter(x => x !== b.dataset.s); if (!S.sel.length) S.sel = [U]; draw(); marca(); });
    destruirUm("k-g");
    grafico("k-g", "line", anos.map(String), S.sel.map((s, i) => { const v = serieDe(k, gI(s), anos); return linha(s, corI(s), idx ? v.map(x => v[0] ? 100 * x / v[0] : null) : v, s === U); }), { suf: M[k].suf, dec: idx ? 1 : M[k].dec, legend: true });
    $("#k-ies").value = S.sel.find(s => s !== U) || "";
  };
  const marca = () => $$("#k-tab tbody tr").forEach(tr => tr.classList.toggle("sel", S.sel.includes(tr.dataset.id)));
  tabela($("#k-tab"), [{ h: "IES", t: 1 }, { h: "UF", t: 1 }, { h: "Natureza", t: 1 }, { h: "Programas" }, { h: "Matriculados", f: v => fmt(v) }, { h: `Δ matric. vs ${a0}`, f: v => v == null ? "–" : `<span class="d ${v > 0 ? "up" : v < 0 ? "dn" : ""}">${v > 0 ? "+" : ""}${fmt(v, 1)}%</span>` }, { h: "Titulados", f: v => fmt(v) }, { h: "Docentes perm.", f: v => fmt(v) }, { h: "Disc./docente", f: v => fmt(v, 1) }, { h: "% conc. 5–7", f: v => fmt(v, 1) }, { h: "Meses p/ titular", f: v => fmt(v, 1) }],
    lin, { ordem: 4, desc: true, destaque: l => l.id === U ? "u" : "", aoClicar: s => { S.sel = S.sel.includes(s) ? S.sel.filter(x => x !== s) : [...S.sel, s].slice(-6); if (!S.sel.length) S.sel = [U]; draw(); marca(); } });
  $$("#k-jur button").forEach(b => b.onclick = () => { const p = b.dataset.p, cur = jurSel(); let nx; if (p) nx = p === "all" ? JUR.map(j => j[0]) : ["FEDERAL", "ESTADUAL", "MUNICIPAL"]; else { cur.has(b.dataset.j) ? cur.delete(b.dataset.j) : cur.add(b.dataset.j); nx = [...cur]; } if (nx.length) { S.rkJur = nx; render(); } });
  $("#k-met").onchange = e => { S.rkMetric = e.target.value; render(); };
  $("#k-ies").onchange = e => { S.sel = e.target.value ? [U, e.target.value] : [U]; draw(); marca(); };
  $("#k-a0").onchange = e => { S.a0 = Math.min(+e.target.value, S.a1); render(); };
  $("#k-a1").onchange = e => { S.a1 = Math.max(+e.target.value, S.a0); render(); };
  $$("#k-modo button").forEach(b => b.onclick = () => { S.rkModo = b.dataset.v; render(); });
  draw(); marca();
  comparaAreas($("#k-area"));
};

// ---------- Comparação por área de avaliação da CAPES ----------
// Base: Avaliação Quadrienal (todos os PPGs do país, com área de avaliação e IES). Matriculados, titulados e docentes
// por PPG só existem para a UFSCar (série por programa); para as demais IES a base agregada não traz a área de avaliação.
function comparaAreas(el) {
  const ref = S.a1, a0 = S.a0, gU = GRUPOS[0];
  const ativos = D.q.filter(r => !r.desat && nivelOk(r.grau, S.grau));
  const areasU = {};
  ativos.filter(gU.t).forEach(r => { areasU[r.area] = (areasU[r.area] || 0) + 1; });
  const areas = Object.keys(areasU).sort((a, b) => a.localeCompare(b, "pt"));
  if (!areas.length) { el.innerHTML = `<h2 class="sec">Comparação por área de avaliação</h2><p class="sub">Nenhum programa da UFSCar com os filtros atuais.</p>`; return; }
  if (!areas.includes(S.arArea)) S.arArea = areas.includes("INTERDISCIPLINAR") ? "INTERDISCIPLINAR" : areas[0];
  const naArea = ativos.filter(r => r.area === S.arArea);
  const fed = S.univ === "fed";
  const jurs = jurSel();
  const univ = naArea.filter(r => jurs.has(r.jur) || gU.t(r));
  const iesDe = r => r.redeU ? U : r.ies;
  const ies = [...new Set(univ.map(iesDe))].sort((a, b) => a.localeCompare(b, "pt"));
  if (S.arIes && !ies.includes(S.arIes)) S.arIes = "";
  const gs = GRUPOS.map(g => ({ g, rs: naArea.filter(r => g.t(r)) }));
  const f1 = v => v == null ? "–" : fmt(v, 1), f2 = v => v == null ? "–" : fmt(v, 2);
  const dl = v => v == null ? "–" : `<span class="d ${v > 0 ? "up" : v < 0 ? "dn" : ""}">${v > 0 ? "+" : ""}${fmt(v, 1)}%</span>`;
  const st = gs.map(({ rs }) => ({ rs, s: qStats(rs), dout: pct(rs.filter(r => /DOUTORADO/.test(r.grau)).length, rs.length), prof: pct(rs.filter(r => /PROFISSIONAL/.test(r.grau)).length, rs.length), c3: pct(rs.filter(r => r.nota <= 3).length, rs.length), c4: pct(rs.filter(r => r.nota === 4).length, rs.length), c5: pct(rs.filter(r => r.nota === 5).length, rs.length), cmax: rs.length ? Math.max(...rs.map(r => r.nota)) : null, ies: new Set(rs.map(iesDe)).size }));
  const IND = [["Programas", s => s.s.n, fmt], ["Instituições com programa na área", s => s.ies, fmt], ["Nota média (Quadrienal 2025)", s => s.s.media, f2], ["Maior nota", s => s.cmax, fmt], ["% com nota 3 ou menos", s => s.c3, f1], ["% com nota 4", s => s.c4, f1], ["% com nota 5", s => s.c5, f1], ["% com nota 6–7", s => s.s.c67, f1], ["% com nota 5–7", s => s.s.c57, f1], ["% com doutorado (acad. ou prof.)", s => s.dout, f1], ["% profissionais", s => s.prof, f1], ["% que subiram de nota", s => pct(s.s.sobe, s.s.cmp), f1], ["% que mantiveram a nota", s => pct(s.s.igual, s.s.cmp), f1], ["% que caíram de nota", s => pct(s.s.cai, s.s.cmp), f1], ["% 5–7 no ciclo anterior", s => s.s.ant57, f1]];
  // PPGs da UFSCar na área, com os indicadores do período escolhido
  const ser = (cod, a) => D.serie[cod]?.[a];
  const dosU = naArea.filter(r => r.ies === U && !r.redeU).sort((a, b) => b.nota - a.nota || a.nome.localeCompare(b.nome, "pt"));
  const tot = naArea.length;
  const linU = dosU.map(r => {
    const s1 = ser(r.cod, ref) || {}, s0 = ser(r.cod, a0) || {};
    const rk = 1 + naArea.filter(x => x.nota > r.nota).length;
    return { id: r.cod, v: [cap(r.nome), r.nivel, isNum(r.ant) ? +r.ant : (r.ant || null), r.nota, rk, s1.mat ?? null, s0.mat ? pct((s1.mat ?? 0) - s0.mat, s0.mat) : null, s1.ing ?? null, s1.tit ?? null, s1.des ?? null, s1.perm ?? null, s1.perm ? s1.mat / s1.perm : null, s1.tit ? s1.meses / s1.tit : null, s1.mat ? pct(s1.estr || 0, s1.mat) : null, s1.doc ? pct(s1.dr || 0, s1.doc) : null] };
  });
  // IES da área
  const porIes = {};
  univ.forEach(r => (porIes[iesDe(r)] ??= []).push(r));
  const linI = Object.entries(porIes).map(([s, rs]) => { const q = qStats(rs); return { id: s, v: [s, D.ies[s]?.uf || rs[0].uf || "", rs.length, q.media, Math.max(...rs.map(r => r.nota)), q.c57, q.c67, q.sobe, q.cai, pct(rs.filter(r => /DOUTORADO/.test(r.grau)).length, rs.length)] }; });
  // PPGs da área (todas as IES do universo, ou só da IES escolhida)
  const lista = univ.filter(r => !S.arIes || iesDe(r) === S.arIes);
  const linP = lista.map(r => ({ id: r.cod, v: [cap(r.nome), iesDe(r), r.uf, r.nivel, isNum(r.ant) ? +r.ant : (r.ant || null), r.nota, isNum(r.ant) ? r.nota - +r.ant : null, r.n1 ?? null, r.n2 ?? null] }));
  const nota = v => v == null ? "–" : hc(String(v));
  const dn = v => v == null ? "–" : `<span class="d ${v > 0 ? "up" : v < 0 ? "dn" : ""}">${v > 0 ? "+" : ""}${v}</span>`;
  el.innerHTML = `<h2 class="sec">Comparação por área de avaliação da CAPES</h2>
    <p class="sub">Compara os PPGs da UFSCar com os demais PPGs e IES da mesma <b>área de avaliação</b>, com os conceitos da Avaliação Quadrienal 2025 (resultado de 05/2026, sujeito a recursos) e as IES da natureza escolhida acima (${jurTxt()}${S.sem ? ", sem a UFSCar" : ""}); os grupos Sudeste e Brasil seguem o filtro “Universo de comparação”. Matriculados, titulados e docentes por PPG só existem para a UFSCar (aparecem na tabela dos PPGs da UFSCar, no período ${a0}–${ref}); para as outras IES a CAPES agregada não traz a área de avaliação.</p>
    <div class="card"><div class="controles">
      <label>Área de avaliação<select id="a-area">${areas.map(a => `<option value="${esc(a)}" ${a === S.arArea ? "selected" : ""}>${esc(cap(a))} (${areasU[a]})</option>`).join("")}</select></label>
      <label>Ver PPGs da IES<select id="a-ies"><option value="">Todas as IES da área</option>${ies.map(s => `<option value="${esc(s)}" ${s === S.arIes ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label></div>
      <div class="tabela-wrap"><table id="a-ind"></table></div></div>
    <article class="card" style="margin-top:14px"><h3>Distribuição das notas na área</h3><p class="sub">% de programas por nota</p><div class="graf"><canvas id="a-g"></canvas></div></article>
    <h3 class="sec">PPGs da UFSCar nesta área (${dosU.length})</h3>
    <p class="sub">Indicadores no período ${a0}–${ref}; posição entre os ${tot} programas da área no país.</p>
    <div class="tabela-wrap"><table id="a-ufscar"></table></div>
    <h3 class="sec">IES da área (${linI.length})</h3><p class="sub">Clique em uma IES para listar seus PPGs.</p>
    <div class="tabela-wrap"><table id="a-ies-t"></table></div>
    <h3 class="sec">PPGs da área${S.arIes ? " em " + esc(S.arIes) : ""} (${linP.length})</h3>
    <div class="tabela-wrap"><table id="a-ppg"></table></div>`;
  tabela($("#a-ind"), [{ h: "Indicador", t: 1 }, ...st.map((s, i) => ({ h: gs[i].g.nome, f: (v, l) => l.f(v) }))],
    IND.map(([nome, fn, f], i) => ({ id: i, f, v: [nome, ...st.map(fn)] })), { ordem: -1 });
  const dsN = ["≤3", "4", "5", "6", "7"], cnt = (rs, n) => rs.filter(r => n === 3 ? r.nota <= 3 : r.nota === n).length;
  grafico("a-g", "bar", dsN, gs.map(({ g, rs }) => barra(g.nome, cssVar(g.cor), [3, 4, 5, 6, 7].map(n => pct(cnt(rs, n), rs.length)))), { suf: "%", dec: 1, legend: true });
  tabela($("#a-ufscar"), [{ h: "Programa", t: 1 }, { h: "Nível", t: 1 }, { h: "Nota anterior", f: nota }, { h: "Nota 2025", f: nota }, { h: "Posição na área", f: v => `${v}º de ${tot}` }, { h: `Matric. ${ref}`, f: v => fmt(v) }, { h: `Δ vs ${a0}`, f: dl }, { h: "Ingress.", f: v => fmt(v) }, { h: "Titulados", f: v => fmt(v) }, { h: "Deslig./aband.", f: v => fmt(v) }, { h: "Docentes perm.", f: v => fmt(v) }, { h: "Disc./docente", f: f1 }, { h: "Meses p/ titular", f: f1 }, { h: "% estrang.", f: f1 }, { h: "% docentes doutores", f: f1 }],
    linU, { ordem: 3, desc: true, aoClicar: c => abrirPrograma(c) });
  tabela($("#a-ies-t"), [{ h: "IES", t: 1 }, { h: "UF", t: 1 }, { h: "Programas" }, { h: "Nota média", f: f2 }, { h: "Maior nota", f: v => fmt(v) }, { h: "% 5–7", f: f1 }, { h: "% 6–7", f: f1 }, { h: "Subiram", f: v => fmt(v) }, { h: "Caíram", f: v => fmt(v) }, { h: "% c/ doutorado", f: f1 }],
    linI, { ordem: 3, desc: true, destaque: l => l.id === U ? "u" : "", aoClicar: s => { S.arIes = s; render(); } });
  tabela($("#a-ppg"), [{ h: "Programa", t: 1 }, { h: "IES", t: 1 }, { h: "UF", t: 1 }, { h: "Nível", t: 1 }, { h: "Nota anterior", f: nota }, { h: "Nota 2025", f: nota }, { h: "Variação", f: dn }, { h: "Nota mestrado", f: nota }, { h: "Nota doutorado", f: nota }],
    linP, { ordem: 5, desc: true, destaque: l => l.v[1] === U ? "u" : "" });
  $("#a-area").onchange = e => { S.arArea = e.target.value; S.arIes = ""; render(); };
  $("#a-ies").onchange = e => { S.arIes = e.target.value; render(); };
}
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
    <li><b>Programas em rede:</b> programas com “em rede = sim” na base de Programas em que a UFSCar é a instituição sede ou consta entre as associadas. Os <b>4 programas em que a UFSCar é associada</b> (PROFMAT, PROFIS, PROEF e PROF-FILO) entram na contagem de programas e nos conceitos da UFSCar (56 próprios + 4 em rede = 60). A CAPES registra os discentes e docentes desses programas sob o código do programa coordenador, sem distinguir a instituição de cada pessoa; por isso, discentes, docentes, titulados e demais indicadores da UFSCar consideram apenas os programas próprios. Nos cartões de cada programa em rede os números são os da rede inteira. No Sudeste e no Brasil esses programas ficam apenas na coordenadora (sem dupla contagem).</li>
    <li><b>Indicadores por nível:</b> a aba “Por nível” separa mestrado acadêmico, mestrado profissional, doutorado acadêmico e doutorado profissional. Discentes são contados pelo nível em que estão matriculados; cursos e docentes, pelos programas que oferecem o nível (programa de mestrado e doutorado entra nos dois). O filtro “Nível” da barra superior também aceita cada nível isolado e vale para programas, discentes e docentes.</li>
    <li>Os indicadores de faixa etária, nacionalidade, bolsa de produtividade e titulação no exterior usam cubos sem o detalhe de grande área, então o filtro de área não os afeta (o painel avisa quando isso ocorre).</li>
    <li><b>Pós-Graduação Lato sensu:</b> cursos de especialização da UFSCar no cadastro do <a href="https://emec.mec.gov.br/" target="_blank" rel="noopener">e-MEC</a>, obtidos pela API Olinda do MEC (<code>etl/lato_sensu.py</code>; mesma fonte do repositório e-mec). É o retrato do cadastro na data da coleta, sem série histórica; “inativo” indica curso ou turma não mais ofertado. Cada turma pode constar como curso separado. Não há dados de matrículas ou concluintes de lato sensu nessa fonte.</li>
    <li><b>Avaliação Quadrienal:</b> notas do resultado da Avaliação Quadrienal (ciclo 2021-2024, chamada oficialmente “Quadrienal 2025”), planilha da CAPES de 27/05/2026, cruzada pelo código do programa com a base de Programas 2024 (região, status e conceito anterior). O resultado só é definitivo após os recursos, conforme a CAPES.</li>
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
  el.innerHTML = `<b>Programas da UFSCar em ${S.ano}:</b> ${nS} próprios + ${nR} em rede (UFSCar associada) = ${nS + nR}. Discentes, docentes e demais indicadores consideram só os ${nS} programas próprios, porque nos programas em rede a CAPES não separa as pessoas por instituição e os números são da rede inteira.`;
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
    top.innerHTML = `<span class="fig-num">FIGURA ${String(n).padStart(2, "0")}</span><span class="fig-acoes"><button type="button" class="btn-outline mini b-tab" aria-expanded="false" title="Mostrar os valores desta figura em uma tabela">Ver tabela</button><button type="button" class="btn-outline mini b-csv" title="Baixar os dados desta figura em CSV">CSV</button></span>`;
    card.prepend(top);
    const titulo = () => card.querySelector("h3")?.innerText || "figura";
    top.querySelector(".b-csv").onclick = () => csvGrafico(cv.id, titulo());
    top.querySelector(".b-tab").onclick = e => tabelaGrafico(card, cv.id, titulo(), e.currentTarget);
  });
}
// alternativa textual de qualquer gráfico: tabela com os mesmos valores
function tabelaGrafico(card, id, titulo, btn) {
  const aberta = card.querySelector(".fig-tab");
  if (aberta) { aberta.remove(); btn.setAttribute("aria-expanded", "false"); btn.textContent = "Ver tabela"; return; }
  const c = charts[id]; if (!c) return;
  const { labels, datasets } = c.data;
  const n = v => v == null || Number.isNaN(+v) ? "–" : fmt(+v, Number.isInteger(+v) ? 0 : 2);
  const div = document.createElement("div"); div.className = "fig-tab";
  div.innerHTML = `<table><caption>${esc(titulo)}: valores do gráfico</caption><thead><tr><th class="t" scope="col">Categoria</th>${datasets.map(d => `<th scope="col">${esc(d.label || "Valor")}</th>`).join("")}</tr></thead>
    <tbody>${labels.map((l, i) => `<tr><th class="t" scope="row" style="position:static;background:none;border-bottom:1px solid var(--line-2);font-weight:600;color:var(--ink)">${esc(l)}</th>${datasets.map(d => `<td>${n(d.data[i])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  card.querySelector(".graf, .p3d")?.after(div);
  btn.setAttribute("aria-expanded", "true"); btn.textContent = "Ocultar tabela";
}
function sincFiltros() {
  $("#f-area").value = S.area; $("#f-grau").value = S.grau; $("#f-sem").checked = S.sem; $("#f-ano").value = S.ano;
  $$("#f-univ button").forEach(x => x.classList.toggle("on", x.dataset.v === S.univ));
}
function chipsFiltros() {
  const l = [];
  if (S.univ === "all") l.push(["Todas as IES", () => S.univ = "fed"]);
  if (S.area) l.push([cap(S.area), () => S.area = ""]);
  if (S.grau) l.push([$("#f-grau").selectedOptions[0].text, () => S.grau = ""]);
  if (S.sem) l.push(["Sem a UFSCar nas comparações", () => S.sem = false]);
  if (S.ano !== ANOS.at(-1)) l.push(["Ano de referência " + S.ano, () => S.ano = ANOS.at(-1)]);
  const el = $("#chips-out");
  el.innerHTML = l.map(([t], i) => `<button type="button" class="chip-out" data-i="${i}" title="Remover filtro">${esc(t)} ×</button>`).join("");
  $$(".chip-out", el).forEach(b => b.onclick = () => { l[+b.dataset.i][1](); sincFiltros(); render(); });
}
function render() {
  destruir(); destruir3d(); aplicaTema(); memo = new Map(); GRUPOS = grupos(); notaRede();
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
  try { S.rotulos = localStorage.getItem("rotulos") !== "0"; } catch { }
  $("#f-rotulos").checked = S.rotulos;
  $("#f-rotulos").onchange = e => { S.rotulos = e.target.checked; try { localStorage.setItem("rotulos", S.rotulos ? "1" : "0"); } catch { } render(); };
  $$("#f-univ button").forEach(b => b.onclick = () => { S.univ = b.dataset.v; $$("#f-univ button").forEach(x => x.classList.toggle("on", x === b)); render(); });
  $("#limpar").onclick = () => { Object.assign(S, { univ: "fed", area: "", grau: "", sem: false, ano: ANOS.at(-1), a0: ANOS[0], a1: ANOS.at(-1), busca: "", conc: "", mun: "", vinc: "", ord: "nota", grp: "", rkJur: null, arArea: "", arIes: "", qvin: "", qnota: "" }); $("#f-area").value = ""; $("#f-grau").value = ""; $("#f-sem").checked = false; $("#f-ano").value = S.ano; $$("#f-univ button").forEach(x => x.classList.toggle("on", x.dataset.v === "fed")); render(); };
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
  $("#carregando").remove(); $("#gerado").textContent = D.meta.gerado_em; const fa = $("#faixa-anos"); if (fa) fa.textContent = `${ANOS[0]}–${ANOS.at(-1)}`;
  iniciaFiltros(); statusPainel();
  const h = location.hash.slice(1); if (ABAS[h]) S.tab = h;
  render();
  window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (ABAS[t] && t !== S.tab) { S.tab = t; render(); } });
})();
