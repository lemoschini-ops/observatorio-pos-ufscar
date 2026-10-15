"""Agendador de atualizao automtica da base de dados a cada 24 horas.

Executa o ETL (etl.build.build_painel) e a exportao do site esttico (etl.export_site)
periodicamente em segundo plano, sem bloquear as requisies da API FastAPI.
"""
import asyncio
from datetime import datetime, timedelta
import json
import logging
import os
from pathlib import Path
import threading
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException

logger = logging.getLogger("painel.scheduler")
router = APIRouter(prefix="/api/atualizacao", tags=["atualizacao"])

ROOT = Path(__file__).resolve().parent.parent
PAINEL_PATH = ROOT / "data" / "painel.json"

_lock = threading.Lock()
_stop_event = asyncio.Event()
_scheduler_task: asyncio.Task | None = None

_estado: dict[str, Any] = {
    "ativo": True,
    "status": "idle",  # "idle" | "executando" | "sucesso" | "erro"
    "intervalo_horas": int(os.getenv("AUTO_UPDATE_HOURS", "24")),
    "ultima_execucao": None,
    "proxima_execucao": None,
    "progresso": "Aguardando agendamento",
    "ultimo_erro": None,
    "duracao_segundos": None,
}


def _carregar_ultima_data() -> datetime | None:
    """L a data da ltima gerao gravada em data/painel.json, se existir."""
    if PAINEL_PATH.exists():
        try:
            d = json.loads(PAINEL_PATH.read_text(encoding="utf-8"))
            ts = d.get("gerado_em")
            if ts:
                return datetime.fromisoformat(ts)
        except Exception:
            pass
    return None


def executar_pipeline_atualizacao() -> dict[str, Any]:
    """Executa o pipeline completo (build_painel + export_site). Thread-safe."""
    if not _lock.acquire(blocking=False):
        return {"status": "ocupado", "mensagem": "Uma atualizao j est em andamento."}

    inicio = datetime.now()
    _estado["status"] = "executando"
    _estado["progresso"] = "Executando ETL dos dados oficiais (TCU, CGU, INEP, CAPES)..."
    _estado["ultimo_erro"] = None

    try:
        from etl.build import build_painel
        from etl.export_site import main as export_site_main

        logger.info("Iniciando atualizao automtica da base de dados...")
        build_painel()

        _estado["progresso"] = "Sincronizando arquivos do site esttico..."
        export_site_main()

        duracao = round((datetime.now() - inicio).total_seconds(), 1)
        _estado["status"] = "sucesso"
        _estado["ultima_execucao"] = datetime.now().isoformat(timespec="seconds")
        _estado["duracao_segundos"] = duracao
        _estado["progresso"] = f"Atualizao concluda com sucesso em {duracao}s."
        logger.info("Atualizao da base de dados concluda com sucesso em %ss.", duracao)
        return {"status": "sucesso", "duracao_segundos": duracao}

    except Exception as e:
        duracao = round((datetime.now() - inicio).total_seconds(), 1)
        _estado["status"] = "erro"
        _estado["ultimo_erro"] = str(e)
        _estado["progresso"] = f"Falha na atualizao aps {duracao}s: {e}"
        logger.exception("Erro durante a atualizao automtica da base de dados: %s", e)
        return {"status": "erro", "erro": str(e)}

    finally:
        _lock.release()


async def _loop_agendador() -> None:
    """Loop assncrono que dorme at a prxima execuo e roda a cada 24 horas."""
    intervalo_seg = _estado["intervalo_horas"] * 3600

    # Calcula se j deve rodar ou quanto tempo esperar com base na ltima gerao
    ultima = _carregar_ultima_data()
    agora = datetime.now()

    if ultima:
        _estado["ultima_execucao"] = ultima.isoformat(timespec="seconds")
        segundos_desde_ultima = (agora - ultima).total_seconds()
        tempo_restante = intervalo_seg - segundos_desde_ultima
        if tempo_restante <= 0:
            delay_inicial = 5  # aguarda 5s para o servidor inicializar completamente
        else:
            delay_inicial = tempo_restante
    else:
        delay_inicial = 5

    proxima = agora + timedelta(seconds=delay_inicial)
    _estado["proxima_execucao"] = proxima.isoformat(timespec="seconds")
    _estado["progresso"] = f"Prxima atualizao agendada para {proxima.strftime('%d/%m/%Y %H:%M:%S')}."

    logger.info("Agendador ativo: prxima atualizao em %.0f segundos (%s).", delay_inicial, _estado["proxima_execucao"])

    while not _stop_event.is_set():
        try:
            # Aguarda o tempo calculado ou cancelamento
            await asyncio.wait_for(_stop_event.wait(), timeout=delay_inicial)
            break  # stop_event foi acionado
        except asyncio.TimeoutError:
            # Tempo atingido: executa em thread para no travar o event loop da API
            logger.info("Disparando atualizao automtica peridica (a cada %d horas)...", _estado["intervalo_horas"])
            await asyncio.to_thread(executar_pipeline_atualizacao)

            delay_inicial = intervalo_seg
            proxima = datetime.now() + timedelta(seconds=intervalo_seg)
            _estado["proxima_execucao"] = proxima.isoformat(timespec="seconds")


def iniciar_agendador() -> None:
    """Inicia o loop agendador em segundo plano."""
    global _scheduler_task
    if os.getenv("DISABLE_AUTO_UPDATE", "").lower() in ("1", "true", "yes"):
        _estado["ativo"] = False
        _estado["progresso"] = "Atualizao automtica desativada via DISABLE_AUTO_UPDATE."
        return

    _stop_event.clear()
    _scheduler_task = asyncio.create_task(_loop_agendador())


def parar_agendador() -> None:
    """Finaliza o loop agendador."""
    _stop_event.set()
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()


@router.get("/status", summary="Status da atualizao automtica da base de dados")
async def status_atualizacao():
    """Retorna o estado atual do agendador, ltima execuo e prxima execuo prevista."""
    return {
        **_estado,
        "em_execucao": _lock.locked(),
    }


@router.post("/executar", summary="Dispara a atualizao imediata da base de dados")
async def disparar_atualizacao(background_tasks: BackgroundTasks):
    """Aciona a atualizao imediata da base de dados em segundo plano."""
    if _lock.locked():
        raise HTTPException(409, "A base de dados j est sendo atualizada no momento.")

    background_tasks.add_task(executar_pipeline_atualizacao)
    return {
        "status": "iniciado",
        "mensagem": "Atualizao da base de dados disparada em segundo plano.",
        "verificar_em": "/api/atualizacao/status"
    }
