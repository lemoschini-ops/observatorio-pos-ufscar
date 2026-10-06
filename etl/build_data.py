"""Gera os JSONs agregados do painel a partir dos CSVs abertos da CAPES (Plataforma Sucupira).

Os CSVs são lidos por streaming e agregados em memória: nenhum dado pessoal
(nome, CPF, orientador, título de tese) é gravado em disco. Só ficam contagens.
O DataStore SQL da CAPES não é usado porque carrega apenas parte das linhas
(ex.: 1.000 de ~100 mil docentes), o que distorceria os totais.

Etapas:
  1. Programas  -> cubo de programas, metadados dos programas da UFSCar e
                   programas em rede de que a UFSCar participa.
  2. Discentes e Docentes -> cubos agregados + série por programa (UFSCar e redes).

Uso:  py etl/build_data.py            # reaproveita o cache de agregados em etl/cache
      py etl/build_data.py --refresh  # baixa tudo de novo (~2,5 GB de tráfego)
"""
import csv
import hashlib
import json
import re
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

BASE = "https://dadosabertos.capes.gov.br/api/3/action/"
HEADERS = {"User-Agent": "Mozilla/5.0 (UFSCar-PG-Painel)"}  # o portal não responde a clientes sem UA
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "etl" / "cache"
OUT = ROOT / "site" / "data"
REFRESH = "--refresh" in sys.argv
REDESCOBRIR = REFRESH or "--redescobrir" in sys.argv  # procura pacotes/arquivos novos sem rebaixar o que já está em cache
UFSCAR = "UFSCAR"

PACOTES = {
    "prog": [
        "programas-da-pos-graduacao-stricto-census-do-brasil-de-2013-a-2015",
        "2017-a-2020-programas-da-pos-graduacao-stricto-sensu-no-brasil",
        "2021-a-2024-programas-da-pos-graduacao-stricto-sensu-no-brasil",
    ],
    "disc": [
        "discentes-da-pos-graduacao-stricto-sensu-do-brasil-2013-a-2016",
        "discentes-da-pos-graduacao-stricto-sensu-do-brasil-2017-a-2019",
        "2021-a-2024-discentes-da-pos-graduacao-stricto-sensu-do-brasil",
    ],
    "doc": [
        "docentes-da-pos-graduacao-stricto-sensu-do-brasil-2013-a-2016",
        "2017-a-2020-docentes-da-pos-graduacao-stricto-sensu-no-brasil",
        "2021-a-2024-docentes-da-pos-graduacao-stricto-sensu-no-brasil",
    ],
}

# cubos: nome -> colunas de dimensão e de medida (ano é sempre a 1ª coluna).
# "ies" só vale para o Sudeste (fora dele fica vazio) e "ie" marca apenas a UFSCar,
# o que mantém os arquivos pequenos sem perder os totais do Brasil.
CUBOS = {
    "prog": (["ies", "reg", "jur", "ga", "grau", "conc", "sit", "rede"], ["n"]),
    "disc_a": (["ies", "reg", "jur", "ga", "grau", "sit", "ing", "rede"], ["n", "meses"]),
    "disc_b": (["ie", "reg", "jur", "faixa", "nac", "grau", "sit", "ing", "rede"], ["n"]),
    "doc_a": (["ies", "reg", "jur", "ga", "grau", "cat", "reg_trab", "dr", "rede"], ["n"]),
    "doc_b": (["ie", "reg", "jur", "cat", "faixa", "nac", "bolsa", "ext", "rede"], ["n"]),
}
# "rede" = "S" marca linhas COPIADAS dos programas em rede em que a UFSCar é apenas associada.
# A CAPES registra esses programas sob a IES coordenadora e não separa discentes/docentes por
# instituição; a cópia (com ies/ie = UFSCAR) permite somá-los aos totais da UFSCar. As linhas
# originais (rede = "") continuam na coordenadora, de modo que Sudeste e Brasil não duplicam.
REDE_UFSCAR = ("UFSCAR", "SUDESTE", "FEDERAL")
# medidas da série por programa (UFSCar e redes)
SERIE_DISC = ["mat", "tit", "ing", "des", "meses", "estr", "mat_m", "mat_d"]
SERIE_DOC = ["doc", "perm", "dr"]


def api(action, retries=5, **params):
    for t in range(retries):
        try:
            j = requests.get(BASE + action, params=params, headers=HEADERS, timeout=300).json()
            if j.get("success"):
                return j["result"]
            raise RuntimeError(str(j.get("error"))[:300])
        except Exception:  # noqa: BLE001
            if t == retries - 1:
                raise
            time.sleep(5 * (t + 1))


def descobrir_pacotes():
    """Localiza no portal os pacotes de Programas, Discentes e Docentes de 2013 em diante,
    inclusive períodos novos (ex.: 2025 a 2028). Se a busca falhar, usa a lista fixa PACOTES."""
    padrao = re.compile(r"\[(\d{4}) a (\d{4})\]\s*(Programas|Discentes|Docentes) da P", re.I)
    chave = {"programas": "prog", "discentes": "disc", "docentes": "doc"}
    achados = {k: set(v) for k, v in PACOTES.items()}
    try:
        for p in api("package_search", q="pós-graduação stricto sensu", rows=200)["results"]:
            m = padrao.search(p.get("title", ""))
            if m and int(m.group(1)) >= 2013:
                achados[chave[m.group(3).lower()]].add(p["name"])
    except Exception as e:  # noqa: BLE001
        print("  descoberta de pacotes falhou, usando a lista fixa:", type(e).__name__, flush=True)
    return {k: sorted(v) for k, v in achados.items()}


def recursos():
    f = CACHE / "recursos.json"
    if f.exists() and not REDESCOBRIR:
        return json.loads(f.read_text(encoding="utf-8"))
    out = {}
    for base, nomes in descobrir_pacotes().items():
        out[base] = []
        for nome in nomes:
            for r in api("package_show", id=nome)["resources"]:
                if r["format"] == "CSV":
                    out[base].append({"id": r["id"], "name": r["name"], "url": r["url"]})
        print(base, len(out[base]), "arquivos CSV", flush=True)
    f.write_text(json.dumps(out, indent=1), encoding="utf-8")
    return out


def linhas_csv(url, tentativas=4):
    """Itera sobre as linhas do CSV (latin-1, separador ';'), reiniciando se a conexão cair."""
    for t in range(tentativas):
        try:
            with requests.get(url, headers=HEADERS, stream=True, timeout=(30, 120)) as r:
                r.raise_for_status()
                yield from csv.DictReader((l.decode("latin-1") for l in r.iter_lines()), delimiter=";")
            return
        except (requests.RequestException, OSError):
            if t == tentativas - 1:
                raise
            print("  nova tentativa de download", flush=True)
            time.sleep(10)


def inteiro(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def ies_sudeste(r):
    return r["SG_ENTIDADE_ENSINO"] if r["NM_REGIAO"] == "SUDESTE" else ""


def marca_ufscar(r):
    return UFSCAR if r["SG_ENTIDADE_ENSINO"] == UFSCAR else ""


# ---------------------------------------------------------------- Programas
def agregar_prog(url):
    cubo, info, meta = defaultdict(set), {}, []
    for r in linhas_csv(url):
        ano = inteiro(r["AN_BASE"])
        sig = r["SG_ENTIDADE_ENSINO"]
        dims = (r["NM_GRANDE_AREA_CONHECIMENTO"], r["NM_GRAU_PROGRAMA"], r["CD_CONCEITO_PROGRAMA"], r["DS_SITUACAO_PROGRAMA"])
        cubo[(ano, ies_sudeste(r), r["NM_REGIAO"], r["CS_STATUS_JURIDICO"], *dims, "")].add(r["CD_PROGRAMA_IES"])
        if r["NM_REGIAO"] == "SUDESTE":
            info[sig] = [r["NM_ENTIDADE_ENSINO"], r["SG_UF_PROGRAMA"], r["CS_STATUS_JURIDICO"]]
        rede = r["IN_REDE"] == "SIM"
        associadas = [s.strip() for s in r["SG_ENTIDADE_ENSINO_REDE"].split(";") if s.strip()]
        if rede and UFSCAR in associadas and sig != UFSCAR:
            cubo[(ano, *REDE_UFSCAR, *dims, "S")].add(r["CD_PROGRAMA_IES"])
        if sig == UFSCAR or (rede and UFSCAR in associadas):
            meta.append({
                "ano": ano, "cod": r["CD_PROGRAMA_IES"], "nome": r["NM_PROGRAMA_IES"],
                "area": r["NM_AREA_AVALIACAO"], "ga": r["NM_GRANDE_AREA_CONHECIMENTO"],
                "grau": r["NM_GRAU_PROGRAMA"], "modal": r["NM_MODALIDADE_PROGRAMA"],
                "conc": r["CD_CONCEITO_PROGRAMA"], "mun": r["NM_MUNICIPIO_PROGRAMA_IES"],
                "sit": r.get("DS_SITUACAO_PROGRAMA", ""),
                "inicio": r.get("AN_INICIO_PROGRAMA") or r.get("ANO_INICIO_PROGRAMA", ""),
                "ies": sig, "rede": rede, "associadas": associadas,
                "papel": "sede" if sig == UFSCAR else "associada"})
    rows = [list(k) + [len(v)] for k, v in cubo.items()]
    return {"rows": rows, "info": info, "meta": meta}


# ------------------------------------------------------ Discentes e Docentes
def agregar_pessoas(base, url, codigos):
    cubo_a, cubo_b = defaultdict(lambda: [0, 0]), defaultdict(int)
    pessoas, serie = defaultdict(set), defaultdict(lambda: defaultdict(int))
    for r in linhas_csv(url):
        ano = inteiro(r["AN_BASE"])
        reg, jur = r["NM_REGIAO"], r["CS_STATUS_JURIDICO"]
        ie, ies = marca_ufscar(r), ies_sudeste(r)
        cod = r["CD_PROGRAMA_IES"]
        alvo = (r["SG_ENTIDADE_ENSINO"] == UFSCAR) or cod in codigos
        copia = cod in codigos and r["SG_ENTIDADE_ENSINO"] != UFSCAR  # programa em rede com a UFSCar associada
        if base == "disc":
            sit, ing, grau = r["NM_SITUACAO_DISCENTE"], r["ST_INGRESSANTE"], r["DS_GRAU_ACADEMICO_DISCENTE"]
            nac = "ESTRANGEIRO" if r["DS_TIPO_NACIONALIDADE_DISCENTE"] == "ESTRANGEIRO" else "BRASILEIRO"
            meses = inteiro(r["QT_MES_TITULACAO"])
            ga = r["NM_GRANDE_AREA_CONHECIMENTO"]
            a = cubo_a[(ano, ies, reg, jur, ga, grau, sit, ing, "")]
            a[0] += 1
            a[1] += meses
            cubo_b[(ano, ie, reg, jur, r["DS_FAIXA_ETARIA"], nac, grau, sit, ing, "")] += 1
            if copia:
                a = cubo_a[(ano, *REDE_UFSCAR, ga, grau, sit, ing, "S")]
                a[0] += 1
                a[1] += meses
                cubo_b[(ano, UFSCAR, REDE_UFSCAR[1], REDE_UFSCAR[2], r["DS_FAIXA_ETARIA"], nac, grau, sit, ing, "S")] += 1
            if alvo:
                s = serie[(ano, cod)]
                if sit == "MATRICULADO":
                    s["mat"] += 1
                    s["mat_m" if "MESTRADO" in grau else "mat_d"] += 1
                    s["estr"] += nac == "ESTRANGEIRO"
                    s["ing"] += ing == "SIM"
                elif sit == "TITULADO":
                    s["tit"] += 1
                    s["meses"] += meses
                elif sit in ("DESLIGADO", "ABANDONOU"):
                    s["des"] += 1
        else:
            cat, dr = r["DS_CATEGORIA_DOCENTE"], r["IN_DOUTOR"]
            bolsa = "N" if r["CD_CAT_BOLSA_PRODUTIVIDADE"] in ("NA", "") else "S"
            ext = "S" if r["NM_PAIS_IES_TITULACAO"] not in ("BRASIL", "") else "N"
            nac = "ESTRANGEIRO" if r["DS_TIPO_NACIONALIDADE_DOCENTE"] == "ESTRANGEIRO" else "BRASILEIRO"
            ga, grau_p, reg_t = r["NM_GRANDE_AREA_CONHECIMENTO"], r["NM_GRAU_PROGRAMA"], r["DS_REGIME_TRABALHO"]
            cubo_a[(ano, ies, reg, jur, ga, grau_p, cat, reg_t, dr, "")][0] += 1
            cubo_b[(ano, ie, reg, jur, cat, r["DS_FAIXA_ETARIA"], nac, bolsa, ext, "")] += 1
            if copia:
                cubo_a[(ano, *REDE_UFSCAR, ga, grau_p, cat, reg_t, dr, "S")][0] += 1
                cubo_b[(ano, UFSCAR, REDE_UFSCAR[1], REDE_UFSCAR[2], cat, r["DS_FAIXA_ETARIA"], nac, bolsa, ext, "S")] += 1
            if alvo:
                s = serie[(ano, cod)]
                s["doc"] += 1
                s["perm"] += cat == "PERMANENTE"
                s["dr"] += dr == "S"
        pessoas[(ano, ies, reg, jur)].add(r["ID_PESSOA"])
    return {
        "a": [list(k) + v for k, v in cubo_a.items()],
        "b": [list(k) + [v] for k, v in cubo_b.items()],
        "pes": [list(k) + [len(v)] for k, v in pessoas.items()],
        "serie": [[k[0], k[1], dict(v)] for k, v in serie.items()],
    }


def tarefa(args):
    base, r, codigos = args
    h = hashlib.md5(",".join(sorted(codigos)).encode()).hexdigest()[:8] if base != "prog" else "x"
    f = CACHE / f"v3_{base}_{r['id']}_{h}.json"
    if f.exists() and not REFRESH:
        return json.loads(f.read_text(encoding="utf-8"))
    t = time.time()
    res = agregar_prog(r["url"]) if base == "prog" else agregar_pessoas(base, r["url"], codigos)
    f.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    print(f"ok {base} {r['name']} em {time.time() - t:.0f}s", flush=True)
    return res


# ------------------------------------------------------------------- saída
def codificar(cols_dim, cols_med, rows):
    """Codifica as colunas de texto em dicionários (arquivos ~3x menores)."""
    dic = {c: {} for c in cols_dim}
    out = []
    for r in rows:
        linha = [r[0]]
        for i, c in enumerate(cols_dim, 1):
            linha.append(dic[c].setdefault(r[i], len(dic[c])))
        linha += r[1 + len(cols_dim):]
        out.append(linha)
    return {"cols": ["ano"] + cols_dim + cols_med,
            "dict": {c: list(d) for c, d in dic.items()}, "rows": out}


def gravar(nome, obj):
    (OUT / nome).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    rec = recursos()

    # 1) programas: define quais códigos de programa em rede envolvem a UFSCar
    with ThreadPoolExecutor(max_workers=3) as ex:
        progs = list(ex.map(tarefa, [("prog", r, ()) for r in rec["prog"]]))
    meta = [m for p in progs for m in p["meta"]]
    codigos = tuple(sorted({m["cod"] for m in meta if m["rede"] and m["ies"] != UFSCAR}))
    print("programas em rede com a UFSCar como associada:", len(codigos), flush=True)

    # 2) discentes e docentes
    jobs = [(b, r, codigos) for b in ("disc", "doc") for r in rec[b]]
    with ThreadPoolExecutor(max_workers=3) as ex:
        pessoas = list(ex.map(tarefa, jobs))

    anos = sorted({r[0] for p in progs for r in p["rows"]})
    info = {}
    for p in progs:
        info.update(p["info"])
    gravar("ies.json", {k: {"nome": v[0], "uf": v[1], "jur": v[2]} for k, v in info.items()})

    gravar("prog.json", codificar(*CUBOS["prog"], [r for p in progs for r in p["rows"]]))
    for base, k in (("disc", "disc"), ("doc", "doc")):
        res = [p for (b, _, _), p in zip(jobs, pessoas) if b == base]
        gravar(f"{k}_a.json", codificar(*CUBOS[f"{k}_a"], [r for p in res for r in p["a"]]))
        gravar(f"{k}_b.json", codificar(*CUBOS[f"{k}_b"], [r for p in res for r in p["b"]]))
        gravar(f"{k}_pessoas.json", {"cols": ["ano", "ies", "reg", "jur", "n"],
                                     "rows": [r for p in res for r in p["pes"]]})

    # série por programa (UFSCar + redes) e metadados
    serie = defaultdict(dict)
    for (b, _, _), p in zip(jobs, pessoas):
        for ano, cod, v in p["serie"]:
            serie[cod].setdefault(ano, {}).update(v)
    gravar("prog_series.json", serie)
    meta.sort(key=lambda m: (m["nome"], m["ano"]))
    gravar("ufscar_programas.json", meta)
    gravar("meta.json", {"anos": anos, "gerado_em": time.strftime("%Y-%m-%d"),
                         "fonte": "CAPES - Dados Abertos (Plataforma Sucupira)",
                         "url": "https://dadosabertos.capes.gov.br/"})
    print("anos:", anos, "| programas em rede:", len(codigos))
    import verificar  # registra o estado remoto como já incorporado
    verificar.registrar()


if __name__ == "__main__":
    main()
