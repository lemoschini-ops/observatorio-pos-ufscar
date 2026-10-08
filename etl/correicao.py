"""Corregedoria: processos disciplinares da UFSCar (CGU-PAD) e expulsões (CEAF), com comparação entre universidades federais.

Fontes oficiais (CGU):
  - CGU-PAD, dados abertos: https://www.gov.br/cgu/pt-br/acesso-a-informacao/dados-abertos/arquivos/cgu-pad
  - CEAF, Cadastro de Expulsões da Administração Federal (Portal da Transparência, arquivo diário).
Só se guardam contagens e linhas anônimas: sem número de processo, sem nomes, sem CPF.
"""
import csv
import io
import re
import statistics as st
import urllib.request
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from etl.build import CACHE, baixar
from etl.comparativo import _agrega_inep, _norm

PAD_URL = "https://dadosabertos-download.cgu.gov.br/CGUPAD/CGUPAD.csv"
CEAF_URL = "https://portaldatransparencia.gov.br/download-de-dados/ceaf/{d}"
UFSCAR = "Fundação Universidade Federal de São Carlos"
ANO_MAX = 2026


def _ano_data(s: str):
    m = re.match(r"(\d{4})/(\d{2})/(\d{2})", s or "")
    if not m:
        return None
    a, me, d = int(m[1]), int(m[2]), int(m[3])
    if not (1990 <= a <= ANO_MAX):
        return None
    try:
        return date(a, me, d)
    except ValueError:
        return None


def _tipo(t: str) -> str:
    t = t.lower()
    if t.startswith("processo administrativo disciplinar"):
        return "PAD"
    if "sindic" in t:
        return "Sindicância"
    if "rito sum" in t:
        return "Rito sumário"
    return "Outros"


def _fase(f: str) -> str:
    if f == "Processo Julgado":
        return "Julgado"
    if f.startswith("Anulado"):
        return "Anulado"
    if f.startswith("Decisão") or f.startswith("Encaminhado") or f.startswith("Termo"):
        return "Decisão/recurso/TAC"
    return "Em apuração"


def _assunto(a: str) -> str:
    a = (a or "").strip().strip("-").strip()
    if not a:
        return "Não informado"
    a = re.split(r"\s+-\s+|\.\s+Descri", a)[0].strip(" -.")
    a = a[:80]
    return a[:1].upper() + a[1:] if a else "Não informado"


def _ceaf() -> dict | None:
    """Conta expulsões com lotação na UFSCar. O arquivo é diário; tenta os últimos dias."""
    for k in range(0, 12):
        d = (date.today() - timedelta(days=k)).strftime("%Y%m%d")
        try:
            arq = baixar(CEAF_URL.format(d=d), CACHE / f"ceaf_{d}.zip")
        except Exception:
            continue
        with zipfile.ZipFile(arq) as zf:
            nome = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
            rows = list(csv.DictReader(io.StringIO(zf.read(nome).decode("cp1252")), delimiter=";"))
        lot = [(r.get("ÓRGÃO DE LOTAÇÃO") or "").upper() for r in rows]
        return {"data_arquivo": f"{d[6:]}/{d[4:6]}/{d[:4]}", "total_cadastro": len(rows),
                "ufscar": sum(1 for x in lot if "UNIVERSIDADE FEDERAL DE SÃO CARLOS" in x or "UFSCAR" in x),
                "universidades_federais": sum(1 for x in lot if "UNIVERSIDADE FEDERAL" in x or "UNIVERSIDADE TECNOLÓGICA FEDERAL" in x)}
    return None


def coletar_correicao() -> dict:
    arq = baixar(PAD_URL, CACHE / "cgupad.csv")
    csv.field_size_limit(10 ** 9)
    rows = list(csv.DictReader(io.StringIO(arq.read_bytes().decode("cp1252")), delimiter=";"))
    inep = _agrega_inep(2024)  # servidores = docentes + técnicos (denominador da comparação)
    por_nome = {_norm(re.sub(r"\s+-\s+[A-Z]+$", "", i["nome_raw"])): i for i in inep.values()}

    uf, assuntos, tipos, fases = [], [], [], []
    ix = lambda lst, v: lst.index(v) if v in lst else (lst.append(v) or len(lst) - 1)  # noqa: E731
    agg = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0, 0]))  # sigla -> ano -> [n, investigados, julgados, dias_soma, dias_n]
    sem_par = Counter()
    anos_validos = Counter()
    for r in rows:
        d0 = _ano_data(r["Data_Instauracao"])
        if not d0:
            continue
        anos_validos[d0.year] += 1
        ent = r["Entidade"]
        if "Universidade Federal" not in ent and "Universidade Tecnológica Federal" not in ent:
            continue
        i = por_nome.get(_norm(ent))
        if not i:
            sem_par[ent] += 1
            continue
        d1 = _ano_data(r["Data_Fase_Atual"])
        julg = r["Fase_Atual"] == "Processo Julgado"
        dias = (d1 - d0).days if (julg and d1 and d1 >= d0) else None
        a = agg[i["sigla"]][d0.year]
        a[0] += 1
        a[1] += int(r["investigados"] or 0)
        a[2] += julg
        if dias is not None:
            a[3] += dias
            a[4] += 1
        if ent == UFSCAR:
            uf.append([d0.year, ix(tipos, _tipo(r["Tipo_Processo"])), ix(fases, _fase(r["Fase_Atual"])), ix(assuntos, _assunto(r["Assuntos"])),
                       int(r["investigados"] or 0), int(r["advertências"] or 0), int(r["suspensões"] or 0), int(r["expulsivas"] or 0),
                       int(r["outras"] or 0), dias])

    univ = []
    for i in inep.values():
        if i["sigla"] in agg:
            univ.append({"sigla": i["sigla"], "nome": i["nome"], "uf": i["uf"], "regiao": i["regiao"], "servidores": int(i["doc"] + i["tae"]),
                         "anos": {str(y): v for y, v in sorted(agg[i["sigla"]].items())}})
    ceaf = _ceaf()
    print(f"  CGU-PAD: {len(uf)} processos UFSCar; {len(univ)} universidades pareadas; sem par: {sum(sem_par.values())} ({len(sem_par)} entidades)", flush=True)
    return {
        "fonte": "CGU – Dados abertos: CGU-PAD (processos disciplinares)",
        "url": "https://www.gov.br/cgu/pt-br/acesso-a-informacao/dados-abertos/arquivos/cgu-pad",
        "fonte_ceaf": "CGU – Cadastro de Expulsões da Administração Federal (CEAF), via Portal da Transparência",
        "url_ceaf": "https://portaldatransparencia.gov.br/download-de-dados/ceaf",
        "colunas": ["ano", "tipo", "fase", "assunto", "investigados", "advertencias", "suspensoes", "expulsivas", "outras", "dias"],
        "tipos": tipos, "fases": fases, "assuntos": assuntos, "linhas": uf,
        "universidades": univ, "ano_ultimo_completo": 2022,
        "total_pais": {str(y): n for y, n in sorted(anos_validos.items()) if 2010 <= y <= 2023},
        "ceaf": ceaf,
        "nota": "Cada linha é um procedimento, sem número de processo, sem nomes e sem dados dos investigados. O extrato público do CGU-PAD tem poucos registros de instaurações a partir de 2023 (89 no país inteiro), por isso a análise vai até 2022.",
    }
