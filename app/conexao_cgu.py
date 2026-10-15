"""Conexão com os dados abertos do Fala.BR (CGU): status e atualização sob demanda de LAI e Ouvidoria.

A CGU não tem API para esses dados; etl.fonte_cgu compara o arquivo publicado com o do cache e só
baixa quando mudou. Se algo mudou, recalcula os blocos LAI e Ouvidoria do painel e o site estático.
"""
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.scheduler import _lock
from etl import fonte_cgu

router = APIRouter(prefix="/api/cgu", tags=["conexão CGU"])

_ultima: dict[str, Any] = {"status": "idle", "inicio": None, "fim": None, "arquivos": None, "erro": None}


def _anos(ini: int) -> list[int]:
    return list(range(ini, date.today().year + 1))


def atualizar_lai_ouvidoria(desde: int = 2020, forcar: bool = False) -> dict[str, Any]:
    if not _lock.acquire(blocking=False):
        return {"status": "ocupado"}
    _ultima.update(status="executando", inicio=datetime.now().isoformat(timespec="seconds"), fim=None, erro=None)
    try:
        arquivos = fonte_cgu.sincronizar_tudo(_anos(desde), forcar)
        _ultima["arquivos"] = arquivos
        quais = []
        if any(k.startswith("lai_") and v["status"] == "atualizado" for k, v in arquivos.items()):
            quais.append("lai")
        if arquivos.get("ouvidoria", {}).get("status") == "atualizado":
            quais.append("ouv")
        if quais:
            from etl.build import build_painel
            from etl.export_site import main as export_site_main
            build_painel(only=",".join(quais), anos_str=f"{desde}-{date.today().year}")
            export_site_main()
        _ultima["status"] = "sucesso"
        _ultima["painel_recalculado"] = quais
    except Exception as e:
        _ultima.update(status="erro", erro=str(e))
    finally:
        _ultima["fim"] = datetime.now().isoformat(timespec="seconds")
        _lock.release()
    return _ultima


@router.get("/status", summary="Arquivos da CGU (LAI e Ouvidoria) no cache e, opcionalmente, o que a CGU publicou")
def status(verificar: bool = Query(False, description="Consulta a CGU para saber se há versão nova (não baixa)"),
           desde: int = 2020):
    arquivos = fonte_cgu.status_local(_anos(desde))
    if verificar:
        for chave, (url, destino) in fonte_cgu.fontes(_anos(desde)).items():
            try:
                remoto = fonte_cgu.consultar_remoto(url)
                tam = arquivos[chave]["tamanho"]
                arquivos[chave]["remoto_agora"] = remoto
                arquivos[chave]["ha_versao_nova"] = tam is None or (remoto["tamanho"] is not None and remoto["tamanho"] != tam)
            except OSError as e:
                arquivos[chave]["remoto_agora"] = {"erro": str(e)}
    return {"ultima_atualizacao": _ultima, "arquivos": arquivos}


@router.post("/atualizar", summary="Baixa da CGU o que mudou e recalcula LAI e Ouvidoria no painel")
def atualizar(background_tasks: BackgroundTasks, desde: int = 2020, forcar: bool = False):
    if _lock.locked():
        raise HTTPException(409, "Uma atualização já está em andamento.")
    background_tasks.add_task(atualizar_lai_ouvidoria, desde, forcar)
    return {"status": "iniciado", "verificar_em": "/api/cgu/status"}
