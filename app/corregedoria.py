"""Endpoints de Corregedoria (CGU-PAD e CEAF) da UFSCar.

O portal gov.br/corregedorias não oferece API; os dados abertos que ele referencia
(CGU-PAD e CEAF) são coletados por `py -m etl.build --only cor` e gravados em
data/painel.json. Estes endpoints expõem esse recorte, sem dados pessoais.
"""
import json
from collections import defaultdict
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

PAINEL = Path(__file__).resolve().parent.parent / "data" / "painel.json"
router = APIRouter(prefix="/corregedoria", tags=["corregedoria"])


def _dados() -> dict:
    if not PAINEL.exists():
        raise HTTPException(404, "Dados ainda não coletados. Rode: py -m etl.build --only cor")
    cor = json.loads(PAINEL.read_text(encoding="utf-8")).get("cgu", {}).get("correicao")
    if not cor:
        raise HTTPException(404, "Bloco de corregedoria ausente. Rode: py -m etl.build --only cor")
    return cor


def _procedimentos(cor: dict) -> list[dict]:
    out = []
    for lin in cor["linhas"]:
        r = dict(zip(cor["colunas"], lin))
        r["tipo"] = cor["tipos"][r["tipo"]]
        r["fase"] = cor["fases"][r["fase"]]
        r["assunto"] = cor["assuntos"][r["assunto"]]
        out.append(r)
    return out


@router.get("/fontes", summary="Fontes oficiais e observações metodológicas")
async def fontes():
    c = _dados()
    return {k: c[k] for k in ("fonte", "url", "fonte_ceaf", "url_ceaf", "ano_ultimo_completo", "nota")}


@router.get("/procedimentos", summary="Procedimentos disciplinares da UFSCar (CGU-PAD), anonimizados")
async def procedimentos(ano: int | None = None, tipo: str | None = Query(None, description="Sindicância, PAD, Rito sumário"),
                        fase: str | None = None, assunto: str | None = None):
    rows = _procedimentos(_dados())
    for campo, val in (("ano", ano), ("tipo", tipo), ("fase", fase), ("assunto", assunto)):
        if val is not None:
            rows = [r for r in rows if str(r[campo]).lower() == str(val).lower()]
    return {"total": len(rows), "procedimentos": rows}


@router.get("/resumo-anual", summary="Totais por ano: procedimentos, investigados, penalidades e prazo médio")
async def resumo_anual():
    acc = defaultdict(lambda: {"procedimentos": 0, "investigados": 0, "advertencias": 0, "suspensoes": 0,
                               "expulsivas": 0, "outras": 0, "_dias": 0, "_n": 0})
    for r in _procedimentos(_dados()):
        a = acc[r["ano"]]
        a["procedimentos"] += 1
        for k in ("investigados", "advertencias", "suspensoes", "expulsivas", "outras"):
            a[k] += r[k]
        if r["dias"] is not None:
            a["_dias"] += r["dias"]
            a["_n"] += 1
    return [{"ano": ano, **{k: v for k, v in a.items() if not k.startswith("_")},
             "dias_medio_ate_julgamento": round(a["_dias"] / a["_n"]) if a["_n"] else None}
            for ano, a in sorted(acc.items())]


@router.get("/universidades", summary="Comparativo de procedimentos por universidade federal")
async def universidades(sigla: str | None = Query(None, description="Ex.: UFABC. Padrão: só UFSCAR"),
                        comparar: bool = Query(False, description="true = todas as universidades federais")):
    unis = _dados()["universidades"]
    if not sigla and not comparar:
        sigla = "UFSCAR"
    if sigla:
        unis = [u for u in unis if u["sigla"].lower() == sigla.lower()]
        if not unis:
            raise HTTPException(404, f"Universidade '{sigla}' não encontrada.")
    return unis


@router.get("/ceaf", summary="Expulsões da Administração Federal (CEAF): contagem agregada")
async def ceaf(comparar: bool = Query(False, description="true = inclui totais do país e das universidades federais")):
    c = _dados().get("ceaf")
    if not c:
        raise HTTPException(404, "CEAF não coletado.")
    return c if comparar else {"data_arquivo": c["data_arquivo"], "ufscar": c["ufscar"]}


def _taxas(a: list) -> dict:
    n, inv, julg, dias, dn = a
    return {"procedimentos": n, "investigados": inv, "taxa_julgamento": round(julg / n, 3) if n else None,
            "dias_medio_julgamento": round(dias / dn) if dn else None}


def _mediana(v: list[float]) -> float | None:
    v = sorted(x for x in v if x is not None)
    if not v:
        return None
    m = len(v) // 2
    return round(v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2, 2)


@router.get("/indicadores", summary="Indicadores de corregedoria da UFSCar vs. universidades federais")
async def indicadores(ano: int | None = Query(None, description="Padrão: último ano completo (2022)"),
                      comparar: bool = Query(False, description="true = inclui ranking e medianas das universidades federais")):
    cor = _dados()
    ano = ano or cor["ano_ultimo_completo"]
    y = str(ano)
    unis = cor["universidades"]
    por_mil = {u["sigla"]: u["anos"][y][0] / u["servidores"] * 1000 for u in unis if y in u["anos"] and u["servidores"]}
    uf = next((u for u in unis if u["sigla"] == "UFSCAR"), None)
    if not uf or y not in uf["anos"]:
        raise HTTPException(404, f"Sem procedimentos da UFSCar em {ano}.")
    ordem = sorted(por_mil, key=por_mil.get, reverse=True)
    sudeste = [por_mil[u["sigla"]] for u in unis if u["regiao"] == "Sudeste" and u["sigla"] in por_mil]

    procs = [p for p in _procedimentos(cor) if p["ano"] == ano]
    n = len(procs)
    pen = {k: sum(p[k] for p in procs) for k in ("advertencias", "suspensoes", "expulsivas", "outras")}
    res = {
        "ano": ano,
        "ufscar": {
            **_taxas(uf["anos"][y]),
            "procedimentos_por_1000_servidores": round(por_mil["UFSCAR"], 2),
            "pct_pad": round(sum(p["tipo"] == "PAD" for p in procs) / n, 3) if n else None,
            "penalidades": pen,
            "penalidades_por_procedimento": round(sum(pen.values()) / n, 2) if n else None,
        },
        "ceaf": {k: v for k, v in (cor.get("ceaf") or {}).items() if k in ("data_arquivo", "ufscar")},
        "serie_ufscar": [{"ano": int(a), **_taxas(v), "procedimentos_por_1000_servidores": round(v[0] / uf["servidores"] * 1000, 2)}
                         for a, v in sorted(uf["anos"].items()) if int(a) <= cor["ano_ultimo_completo"]],
        "nota": "Servidores = docentes + técnicos do Censo 2024 (denominador fixo). " + cor["nota"],
    }
    if comparar:
        res["ufscar"]["posicao_ranking"] = f"{ordem.index('UFSCAR') + 1}º de {len(ordem)}"
        res["referencia"] = {
            "mediana_brasil_por_1000_servidores": _mediana(list(por_mil.values())),
            "mediana_sudeste_por_1000_servidores": _mediana(sudeste),
            "universidades_comparadas": len(por_mil),
        }
        res["ceaf"] = cor.get("ceaf")
    return res
