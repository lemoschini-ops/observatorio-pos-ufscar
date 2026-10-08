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
async def universidades(sigla: str | None = Query(None, description="Ex.: UFSCAR, UFABC")):
    unis = _dados()["universidades"]
    if sigla:
        unis = [u for u in unis if u["sigla"].lower() == sigla.lower()]
        if not unis:
            raise HTTPException(404, f"Universidade '{sigla}' não encontrada.")
    return unis


@router.get("/ceaf", summary="Expulsões da Administração Federal (CEAF): contagem agregada")
async def ceaf():
    c = _dados().get("ceaf")
    if not c:
        raise HTTPException(404, "CEAF não coletado.")
    return c
