"""Conexão com os dados abertos do Fala.BR (CGU): LAI e Ouvidoria.

A CGU não oferece API para esses dados, só arquivos zip publicados periodicamente. Este módulo
consulta o servidor (HEAD), compara data e tamanho com o que está em data/_cache e só baixa de
novo quando o arquivo mudou. O registro de cada arquivo fica em data/_cache/fonte_cgu.json.

Uso:  py -m etl.fonte_cgu [--anos 2025-2026] [--forcar]   (só sincroniza, não recalcula o painel)
"""
import argparse
import json
import re
import time
import urllib.request
import zipfile
from datetime import date, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "_cache"
REGISTRO = CACHE / "fonte_cgu.json"

# Base completa de pedidos e recursos (a pasta Arquivos_FalaBR_Filtrado só tem os publicados no BuscaLAI)
LAI_URL = "https://dadosabertos-download.cgu.gov.br/FalaBR/Arquivos_FalaBR/Pedidos_csv_{ano}.zip"
LAI_REC_URL = "https://dadosabertos-download.cgu.gov.br/FalaBR/Arquivos_FalaBR/Recursos_Reclamacoes_csv_{ano}.zip"
OUV_URL = "https://dadosabertos-download.cgu.gov.br/e-Ouv/manifestacoes-ouvidoria.zip"
UA = {"User-Agent": "painel-ufscar/1.0"}


def fontes(anos: list[int]) -> dict[str, tuple[str, Path]]:
    """Arquivos acompanhados: chave -> (url, caminho no cache)."""
    out = {}
    for a in anos:
        out[f"lai_{a}"] = (LAI_URL.format(ano=a), CACHE / f"lai_{a}.zip")
        out[f"lai_rec_{a}"] = (LAI_REC_URL.format(ano=a), CACHE / f"lai_rec_{a}.zip")
    out["ouvidoria"] = (OUV_URL, CACHE / "ouvidoria.zip")
    return out


def _ler_registro() -> dict:
    try:
        return json.loads(REGISTRO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _gravar_registro(reg: dict) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    REGISTRO.write_text(json.dumps(reg, ensure_ascii=False, indent=1), encoding="utf-8")


def consultar_remoto(url: str) -> dict:
    """Data e tamanho publicados pela CGU, sem baixar o arquivo."""
    req = urllib.request.Request(url, headers=UA, method="HEAD")
    with urllib.request.urlopen(req, timeout=60) as r:
        lm = r.headers.get("Last-Modified")
        return {
            "tamanho": int(r.headers.get("Content-Length") or 0) or None,
            "modificado": parsedate_to_datetime(lm).isoformat() if lm else None,
            "etag": r.headers.get("ETag"),
        }


def data_extracao(zpath: Path) -> str | None:
    """Data da extração da CGU, lida do prefixo AAAAMMDD dos CSVs (LAI) ou da data interna do zip."""
    try:
        with zipfile.ZipFile(zpath) as zf:
            nomes = zf.infolist()
            for i in nomes:
                m = re.match(r"(\d{4})(\d{2})(\d{2})_", Path(i.filename).name)
                if m:
                    return date(*map(int, m.groups())).isoformat()
            if nomes:
                return date(*max(i.date_time for i in nomes)[:3]).isoformat()
    except (OSError, zipfile.BadZipFile, ValueError):
        pass
    return None


PAUSA = 5  # segundos entre downloads; a CGU bloqueia (HTTP 405) rajadas de requisições
_ultimo_download = 0.0


def _baixar(url: str, destino: Path) -> None:
    global _ultimo_download
    time.sleep(max(0.0, _ultimo_download + PAUSA - time.monotonic()))
    _ultimo_download = time.monotonic()
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_suffix(destino.suffix + ".part")
    req = urllib.request.Request(url, headers=UA)
    for tentativa in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            break
        except OSError:
            if tentativa == 3:
                raise
            time.sleep(5 * (tentativa + 1))
    with zipfile.ZipFile(tmp) as zf:  # não substitui o cache por um download corrompido
        if zf.testzip() is not None:
            raise zipfile.BadZipFile(f"arquivo corrompido: {url}")
    tmp.replace(destino)


def sincronizar(chave: str, url: str, destino: Path, forcar: bool = False) -> dict:
    """Baixa o arquivo só se a CGU publicou versão diferente da que está no cache.

    Sem rede, mantém o arquivo do cache (status "offline") para o ETL seguir funcionando."""
    reg = _ler_registro()
    anterior = reg.get(chave, {})
    item = {"url": url, "arquivo": destino.name, "verificado_em": datetime.now().isoformat(timespec="seconds")}
    try:
        remoto = consultar_remoto(url)
    except OSError as e:
        item.update(anterior | {"status": "offline" if destino.exists() else "erro", "erro": str(e)})
        item["verificado_em"] = datetime.now().isoformat(timespec="seconds")
        reg[chave] = item
        _gravar_registro(reg)
        return item

    local_tam = destino.stat().st_size if destino.exists() else None
    mudou = (
        forcar
        or local_tam is None
        or (remoto["tamanho"] and remoto["tamanho"] != local_tam)
        or (remoto["modificado"] and anterior.get("remoto", {}).get("modificado") not in (None, remoto["modificado"]))
    )
    if mudou:
        _baixar(url, destino)
        item["baixado_em"] = datetime.now().isoformat(timespec="seconds")
        item["status"] = "atualizado"
    else:
        item["baixado_em"] = anterior.get("baixado_em")
        item["status"] = "sem_mudanca"
    item["remoto"] = remoto
    item["tamanho"] = destino.stat().st_size
    item["data_extracao"] = data_extracao(destino)
    reg[chave] = item
    _gravar_registro(reg)
    return item


def sincronizar_tudo(anos: list[int], forcar: bool = False) -> dict:
    out = {}
    for chave, (url, destino) in fontes(anos).items():
        try:
            out[chave] = sincronizar(chave, url, destino, forcar)
        except Exception as e:  # um arquivo com problema não impede os demais
            out[chave] = {"url": url, "status": "erro", "erro": str(e)}
        print(f"  {chave}: {out[chave]['status']} (extração {out[chave].get('data_extracao')})", flush=True)
    return out


def status_local(anos: list[int]) -> dict:
    """O que está no cache agora, sem consultar a CGU."""
    reg = _ler_registro()
    out = {}
    for chave, (url, destino) in fontes(anos).items():
        out[chave] = reg.get(chave, {}) | {
            "arquivo": destino.name,
            "existe": destino.exists(),
            "tamanho": destino.stat().st_size if destino.exists() else None,
            "data_extracao": data_extracao(destino) if destino.exists() else None,
        }
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--anos", default=f"2020-{date.today().year}")
    ap.add_argument("--forcar", action="store_true", help="baixa tudo de novo, mesmo sem mudança")
    a = ap.parse_args(argv)
    ini, fim = (int(x) for x in a.anos.split("-"))
    sincronizar_tudo(list(range(ini, fim + 1)), a.forcar)


if __name__ == "__main__":
    main()
