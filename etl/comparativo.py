"""Comparativo da UFSCar com as universidades federais (SP, Sudeste e Brasil).

Fontes oficiais:
  - ProPlan/UFSCar: série histórica dos Indicadores TCU (Decisão 408/2002), planilha pública.
  - INEP: Censo da Educação Superior (microdados de IES e cursos) -> indicadores calculados.
  - CAPES: Dados Abertos, programas de pós-graduação stricto sensu -> conceito médio.
  - TCU: iESGo 2024 (cruzado com o INEP por nome para obter UF/região).

IMPORTANTE: os indicadores "calculados" usam fórmulas simplificadas sobre dados abertos
(ex.: alunos de graduação em vez de "aluno equivalente"). São comparáveis entre
universidades, mas NÃO são os valores oficiais do TCU (esses só existem para a UFSCar,
na série da ProPlan).
"""
import csv
import io
import re
import statistics as st
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict

from etl.build import CACHE, baixar

INEP_URL = "https://download.inep.gov.br/microdados/microdados_censo_da_educacao_superior_{ano}.zip"
CAPES_URL = {
    2022: "https://dadosabertos.capes.gov.br/dataset/414275c0-2056-4a12-b1a6-b525b74850d5/resource/ead1fb95-dce7-46da-b253-998dddc3f448/download/br-capes-colsucup-prog-2022-2025-03-31.csv",
    2023: "https://dadosabertos.capes.gov.br/dataset/414275c0-2056-4a12-b1a6-b525b74850d5/resource/ddff2931-c0df-4bf8-a0fc-a97ad9cd74a0/download/br-capes-colsucup-prog-2023-2025-03-31.csv",
    2024: "https://dadosabertos.capes.gov.br/dataset/414275c0-2056-4a12-b1a6-b525b74850d5/resource/76ccbd76-7f3a-40c3-a4dc-7d6f65858db8/download/br-capes-colsucup-prog-2024-2025-12-01.csv",
}
PROPLAN_SHEET = "https://docs.google.com/spreadsheets/d/1kHJR9wIm0zPrONpruXRt8wf8zvQkpLC-0p5Hbetpwyk/export?format=csv&gid={gid}"
PROPLAN_IND, PROPLAN_COMP = 263098465, 1770285723
UFSCAR_CO_IES = "7"

# metrica -> (rótulo, unidade, sentido: "maior"=melhor, "menor"=melhor, None=neutro, descrição)
METRICAS = {
    "mat_grad": ("Matrículas na graduação", "alunos", None, "Matrículas em cursos de graduação (Censo INEP)."),
    "aluno_docente": ("Alunos de graduação por docente", "alunos/docente", None, "Matrículas de graduação ÷ docentes em exercício."),
    "aluno_tae": ("Alunos de graduação por técnico-administrativo", "alunos/TAE", None, "Matrículas de graduação ÷ técnicos-administrativos."),
    "tae_docente": ("Técnico-administrativo por docente", "TAE/docente", None, "Técnicos-administrativos ÷ docentes em exercício."),
    "iqcd": ("Índice de qualificação do corpo docente (IQCD)", "1 a 5", "maior", "(5·doutores + 3·mestres + 2·especialistas + 1·demais) ÷ docentes. Mesma fórmula do TCU, sobre docentes em exercício."),
    "pct_doutores": ("Docentes com doutorado", "%", "maior", "Doutores ÷ docentes em exercício."),
    "pct_de": ("Docentes em dedicação exclusiva", "%", None, "Docentes em tempo integral com DE ÷ docentes em exercício."),
    "conclusao": ("Concluintes ÷ ingressantes (no ano)", "%", "maior", "Aproximação da taxa de sucesso: concluintes do ano ÷ ingressantes do ano (graduação)."),
    "pct_noturno": ("Matrículas no período noturno", "%", None, "Matrículas noturnas ÷ matrículas de graduação."),
    "pct_ead": ("Matrículas em EAD", "%", None, "Matrículas em cursos a distância ÷ matrículas de graduação."),
    "capes": ("Conceito CAPES médio dos cursos de pós-graduação", "3 a 7", "maior", "Média dos conceitos dos cursos de mestrado/doutorado acadêmicos e profissionais (CAPES)."),
    "n_cursos_pos": ("Cursos de pós-graduação stricto sensu", "cursos", None, "Cursos de mestrado/doutorado em funcionamento (CAPES)."),
}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()
    s = re.sub(r"\bFUNDACAO\b|\bDA\b|\bDE\b|\bDO\b|\bDOS\b|\bDAS\b|\bE\b|[^A-Z ]", " ", s)
    return " ".join(s.split())


def _f(x) -> float:
    try:
        return float(str(x).replace(",", ".")) if str(x).strip() else 0.0
    except ValueError:
        return 0.0


def _br(x):
    x = (x or "").strip()
    if not x:
        return None
    try:
        return float(x.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def _csv_zip(zf, sufixo):
    nome = next(n for n in zf.namelist() if n.upper().endswith(sufixo.upper()))
    csv.field_size_limit(10 ** 9)
    with zf.open(nome) as raw:
        yield from csv.DictReader(io.TextIOWrapper(raw, encoding="cp1252", newline=""), delimiter=";")


# ------------------------------------------------------------------ ProPlan (oficial UFSCar)
def serie_proplan() -> dict:
    out = {"fonte": "ProPlan/UFSCar – Indicadores TCU (Decisão 408/2002)",
           "url": "https://www.proplan.ufscar.br/governanca/indicadores-tcu", "indicadores": [], "componentes": []}
    for chave, gid in (("indicadores", PROPLAN_IND), ("componentes", PROPLAN_COMP)):
        arq = baixar(PROPLAN_SHEET.format(gid=gid), CACHE / f"proplan_{chave}.csv")
        rows = list(csv.reader(open(arq, encoding="utf-8", newline="")))
        cab = next(r for r in rows if "Ano" in "".join(r[:3]) or "2009" in r)
        anos = [int(c) for c in cab if c.strip().isdigit()]
        i0 = next(i for i, c in enumerate(cab) if c.strip().isdigit())
        for r in rows[rows.index(cab) + 1:]:
            rot = (r[1] if len(r) > 1 else "").strip()
            if not rot or not re.match(r"9\.1", rot):
                continue
            cod, _, nome = rot.partition(" ")
            nome = nome.lstrip("- ").strip()
            vals = {a: _br(r[i0 + k]) for k, a in enumerate(anos) if i0 + k < len(r)}
            out[chave].append({"codigo": cod, "nome": nome, "serie": {str(a): v for a, v in vals.items() if v is not None}})
    return out


# ------------------------------------------------------------------ INEP + CAPES
def _agrega_inep(ano: int) -> dict:
    zpath = baixar(INEP_URL.format(ano=ano), CACHE / f"inep_{ano}.zip")
    ies = {}
    with zipfile.ZipFile(zpath) as zf:
        for r in _csv_zip(zf, f"ED_SUP_IES_{ano}.CSV"):
            if r["TP_CATEGORIA_ADMINISTRATIVA"] != "1" or r["TP_ORGANIZACAO_ACADEMICA"] != "1":
                continue  # só universidades federais
            d = _f(r["QT_DOC_EXE"])
            ies[r["CO_IES"]] = {
                "co_ies": r["CO_IES"], "sigla": r["SG_IES"], "nome": r["NO_IES"].title().replace(" De ", " de ").replace(" Do ", " do ").replace(" Da ", " da "),
                "nome_raw": r["NO_IES"], "uf": r["SG_UF_IES"], "regiao": r["NO_REGIAO_IES"],
                "doc": d, "tae": _f(r["QT_TEC_TOTAL"]),
                "dout": _f(r["QT_DOC_EX_DOUT"]), "mest": _f(r["QT_DOC_EX_MEST"]), "esp": _f(r["QT_DOC_EX_ESP"]),
                "grad": _f(r.get("QT_DOC_EX_GRAD")) + _f(r.get("QT_DOC_EX_SEM_GRAD")), "de": _f(r["QT_DOC_EX_INT_DE"]),
                "mat": 0.0, "ing": 0.0, "conc": 0.0, "not": 0.0, "ead": 0.0,
            }
        for r in _csv_zip(zf, f"CADASTRO_CURSOS_{ano}.CSV"):
            i = ies.get(r["CO_IES"])
            if not i or r["TP_NIVEL_ACADEMICO"] != "1":
                continue
            m = _f(r["QT_MAT"])
            i["mat"] += m
            i["ing"] += _f(r["QT_ING"])
            i["conc"] += _f(r["QT_CONC"])
            i["not"] += _f(r["QT_MAT_NOTURNO"])
            if r["TP_MODALIDADE_ENSINO"] == "2":
                i["ead"] += m
    return ies


def _capes(ano: int) -> dict:
    arq = baixar(CAPES_URL[ano], CACHE / f"capes_{ano}.csv")
    por = defaultdict(list)
    for r in csv.DictReader(open(arq, encoding="cp1252", newline=""), delimiter=";"):
        if r["DS_SITUACAO_PROGRAMA"].upper() != "EM FUNCIONAMENTO":
            continue
        c = r["CD_CONCEITO_PROGRAMA"].strip()
        if not c.isdigit() or not 3 <= int(c) <= 7:
            continue
        # um programa pode ter mestrado e doutorado: cada curso conta uma vez
        n = 2 if "DOUTORADO" in r["NM_GRAU_PROGRAMA"].upper() and "MESTRADO" in r["NM_GRAU_PROGRAMA"].upper() else 1
        por[r["CD_ENTIDADE_EMEC"].strip()].extend([int(c)] * n)
    return por


def _metricas(i: dict, capes: list | None) -> dict:
    d, m = i["doc"], i["mat"]
    div = lambda a, b, k=1: (a / b * k) if b else None  # noqa: E731
    m_ = {
        "mat_grad": m,
        "aluno_docente": div(m, d), "aluno_tae": div(m, i["tae"]), "tae_docente": div(i["tae"], d),
        "iqcd": div(5 * i["dout"] + 3 * i["mest"] + 2 * i["esp"] + 1 * i["grad"], d),
        "pct_doutores": div(i["dout"], d, 100), "pct_de": div(i["de"], d, 100),
        "conclusao": div(i["conc"], i["ing"], 100), "pct_noturno": div(i["not"], m, 100),
        "pct_ead": div(i["ead"], m, 100),
        "capes": st.mean(capes) if capes else None, "n_cursos_pos": len(capes) if capes else None,
    }
    return {k: (round(v, 3) if v is not None else None) for k, v in m_.items()}


def _stats(vals: list[float], v):
    vals = [x for x in vals if x is not None]
    if not vals or v is None:
        return None
    ordem = sorted(vals, reverse=True)
    return {"n": len(vals), "media": round(st.mean(vals), 3), "mediana": round(st.median(vals), 3),
            "min": round(min(vals), 3), "max": round(max(vals), 3), "posicao": ordem.index(v) + 1}


def comparativo(anos=(2022, 2023, 2024), iesgo: dict | None = None) -> dict:
    por_ano = {}
    for ano in anos:
        try:
            ies = _agrega_inep(ano)
        except Exception as e:
            print(f"  INEP {ano}: indisponível ({e})")
            continue
        try:
            capes = _capes(ano)
        except Exception as e:
            print(f"  CAPES {ano}: indisponível ({e})")
            capes = {}
        linhas = []
        for co, i in ies.items():
            linhas.append({"co_ies": co, "sigla": i["sigla"], "nome": i["nome"], "uf": i["uf"], "regiao": i["regiao"],
                           **_metricas(i, capes.get(co))})
        por_ano[ano] = linhas
        print(f"  INEP {ano}: {len(linhas)} universidades federais", flush=True)
    if not por_ano:
        return {}
    ult = max(por_ano)
    grupos = {"SP": lambda x: x["uf"] == "SP", "Sudeste": lambda x: x["regiao"] == "Sudeste", "Brasil": lambda x: True}
    resumo = {}
    for ano, linhas in por_ano.items():
        uf = next((x for x in linhas if x["co_ies"] == UFSCAR_CO_IES), None)
        if uf is None:
            continue
        resumo[str(ano)] = {}
        for met in METRICAS:
            v = uf[met]
            resumo[str(ano)][met] = {"ufscar": v, **{g: _stats([x[met] for x in linhas if f(x)], v) for g, f in grupos.items()}}
    out = {
        "metricas": {k: {"nome": v[0], "unidade": v[1], "melhor": v[2], "descricao": v[3]} for k, v in METRICAS.items()},
        "ano_referencia": ult, "anos": sorted(por_ano), "resumo": resumo,
        "universidades": {str(a): sorted(l, key=lambda x: x["sigla"]) for a, l in por_ano.items() if a == ult},
        "grupos": {"SP": sorted(x["sigla"] for x in por_ano[ult] if x["uf"] == "SP"),
                   "Sudeste": len([x for x in por_ano[ult] if x["regiao"] == "Sudeste"]), "Brasil": len(por_ano[ult])},
        "fontes": [
            {"nome": "INEP – Censo da Educação Superior (microdados)", "url": "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-da-educacao-superior"},
            {"nome": "CAPES – Dados Abertos: programas de pós-graduação stricto sensu", "url": "https://dadosabertos.capes.gov.br"},
        ],
        "nota": "Indicadores calculados a partir de dados abertos, com fórmulas simplificadas, para comparar universidades entre si. Não substituem os indicadores oficiais do TCU (Decisão 408/2002), que usam alunos e docentes “equivalentes”.",
    }
    # --- iESGo por grupo (cruzamento por nome com o INEP)
    if iesgo:
        idx = {_norm(x["nome_raw"] if "nome_raw" in x else x["nome"]): x for x in por_ano[ult]}
        idx.update({_norm(x["nome"]): x for x in por_ano[ult]})
        por_sigla = {x["sigla"].upper(): x for x in por_ano[ult]}
        casados, sem = [], []
        for p in iesgo["pares"]:
            x = idx.get(_norm(p["nome"])) or por_sigla.get(str(p["sigla"]).upper())
            (casados if x else sem).append({**p, "uf": x["uf"] if x else None, "regiao": x["regiao"] if x else None})
        sem = [s["sigla"] for s in sem if re.search(r"UNIVERSIDADE", s["nome"].upper()) and "FEDERAL" in s["nome"].upper()]
        res = {}
        for ind in ("iESGo", "iGG", "iES"):
            ref = next((c[ind] for c in casados if c["sigla"] == "UFSCar"), None)
            res[ind] = {"ufscar": ref, **{g: _stats([c[ind] for c in casados if f(c)], ref) for g, f in grupos.items()}}
        out["iesgo"] = {"resumo": res, "pares": sorted([c for c in casados], key=lambda c: -(c["iESGo"] or 0)),
                        "nao_casadas": sem, "fonte": iesgo["fonte"], "url": iesgo["url"]}
    return out
