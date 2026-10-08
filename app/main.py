"""API de acesso aos dados da UFSCar no Portal da Transparência (CGU).

Encapsula a API oficial https://api.portaldatransparencia.gov.br e aplica o
órgão da UFSCar como filtro padrão em cada consulta.
"""
import asyncio
import os
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_URL = "https://api.portaldatransparencia.gov.br/api-de-dados"


def _load_env() -> None:
    env = Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env()
API_KEY = os.getenv("PORTAL_TRANSPARENCIA_API_KEY", "")
ORGAO = os.getenv("UFSCAR_CODIGO_ORGAO", "26280")
ORGAO_SUPERIOR = os.getenv("UFSCAR_ORGAO_SUPERIOR", "26000")

app = FastAPI(
    title="API Transparência UFSCar",
    description="Dados da Universidade Federal de São Carlos no Portal da Transparência do Governo Federal.",
    version="1.0.0",
)
client = httpx.AsyncClient(timeout=30)

from app.corregedoria import router as corregedoria_router  # noqa: E402

app.include_router(corregedoria_router)


async def consultar(path: str, params: dict) -> list | dict:
    if not API_KEY:
        raise HTTPException(500, "PORTAL_TRANSPARENCIA_API_KEY não configurada (veja .env.example).")
    params = {k: v for k, v in params.items() if v is not None}
    for tentativa in range(3):
        try:
            r = await client.get(f"{BASE_URL}{path}", params=params, headers={"chave-api-dados": API_KEY})
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Falha ao contatar o Portal da Transparência: {e}")
        if r.status_code == 429 and tentativa < 2:
            await asyncio.sleep(2 * (tentativa + 1))
            continue
        break
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text[:500])
    return r.json()


STATIC = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(STATIC / "index.html")


PAINEL = Path(__file__).resolve().parent.parent / "data" / "painel.json"


@app.get("/painel", include_in_schema=False)
async def painel_pagina():
    return FileResponse(STATIC / "painel.html")


@app.get("/api/painel", tags=["painel"], summary="Indicadores TCU (iESGo) e CGU (LAI, Portal) da UFSCar")
async def painel():
    if not PAINEL.exists():
        raise HTTPException(404, "Dados ainda não coletados. Rode: py -m etl.build")
    return FileResponse(PAINEL, media_type="application/json")


@app.get("/api/auditoria", tags=["painel"], summary="Auditoria interna da UFSCar (RAINT) e e-CGU")
async def auditoria():
    arq = PAINEL.parent / "auditoria.json"
    if not arq.exists():
        raise HTTPException(404, "data/auditoria.json não encontrado.")
    return FileResponse(arq, media_type="application/json")


@app.get("/info", tags=["info"])
async def raiz():
    return {"orgao": ORGAO, "orgao_superior": ORGAO_SUPERIOR, "docs": "/docs", "chave_configurada": bool(API_KEY)}


@app.get("/despesas", tags=["despesas"], summary="Despesas anuais por órgão")
async def despesas(ano: int = Query(..., ge=2013), pagina: int = 1):
    return await consultar("/despesas/por-orgao", {"ano": ano, "orgaoSuperior": ORGAO_SUPERIOR, "orgao": ORGAO, "pagina": pagina})


@app.get("/servidores", tags=["pessoal"], summary="Servidores em exercício na UFSCar")
async def servidores(pagina: int = 1, tipo_servidor: int | None = Query(None, description="1=Civil, 2=Militar"),
                     situacao: int | None = Query(None, description="1=Ativo, 2=Inativo, 3=Pensionista")):
    return await consultar("/servidores", {"orgaoServidorExercicio": ORGAO, "tipoServidor": tipo_servidor,
                                           "situacaoServidor": situacao, "pagina": pagina})


@app.get("/contratos", tags=["contratos"], summary="Contratos do Poder Executivo Federal")
async def contratos(data_inicial: str = Query(..., description="dd/MM/yyyy"),
                    data_final: str = Query(..., description="dd/MM/yyyy"), pagina: int = 1):
    return await consultar("/contratos", {"dataInicial": data_inicial, "dataFinal": data_final,
                                          "codigoOrgao": ORGAO, "pagina": pagina})


@app.get("/licitacoes", tags=["contratos"], summary="Licitações do Poder Executivo Federal")
async def licitacoes(data_inicial: str = Query(..., description="dd/MM/yyyy"),
                     data_final: str = Query(..., description="dd/MM/yyyy"), pagina: int = 1):
    return await consultar("/licitacoes", {"dataInicial": data_inicial, "dataFinal": data_final,
                                           "codigoOrgao": ORGAO, "pagina": pagina})


@app.get("/convenios", tags=["contratos"], summary="Convênios")
async def convenios(data_inicial: str = Query(..., description="dd/MM/yyyy"),
                    data_final: str = Query(..., description="dd/MM/yyyy"), pagina: int = 1):
    return await consultar("/convenios", {"dataInicial": data_inicial, "dataFinal": data_final,
                                          "orgao": ORGAO, "pagina": pagina})


@app.get("/viagens", tags=["despesas"], summary="Viagens a serviço")
async def viagens(data_ida_de: str = Query(..., description="dd/MM/yyyy"), data_ida_ate: str = Query(..., description="dd/MM/yyyy"),
                  data_retorno_de: str = Query(..., description="dd/MM/yyyy"), data_retorno_ate: str = Query(..., description="dd/MM/yyyy"),
                  pagina: int = 1):
    return await consultar("/viagens", {"dataIdaDe": data_ida_de, "dataIdaAte": data_ida_ate,
                                        "dataRetornoDe": data_retorno_de, "dataRetornoAte": data_retorno_ate,
                                        "codigoOrgao": ORGAO, "pagina": pagina})


@app.get("/cartoes", tags=["despesas"], summary="Gastos com cartão de pagamento do governo federal")
async def cartoes(mes_inicio: str = Query(..., description="MM/yyyy"), mes_fim: str = Query(..., description="MM/yyyy"), pagina: int = 1):
    return await consultar("/cartoes", {"mesExtratoInicio": mes_inicio, "mesExtratoFim": mes_fim,
                                        "codigoOrgao": ORGAO, "pagina": pagina})


@app.get("/orgao", tags=["info"], summary="Dados cadastrais do órgão (SIAFI)")
async def orgao():
    return await consultar("/orgaos-siafi", {"codigo": ORGAO, "pagina": 1})
