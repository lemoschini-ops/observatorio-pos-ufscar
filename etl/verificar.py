"""Verifica se a CAPES publicou dados novos em relação ao que o painel já tem.

Fontes monitoradas:
  * Dados Abertos CAPES: Programas, Discentes e Docentes (novo ano-base ou arquivo revisado);
  * Resultado da Avaliação Quadrienal (nova planilha ou página modificada).

Grava site/data/status.json (exibido no painel) e devolve código de saída 10 se houver novidade,
para que agendadores (GitHub Actions, Agendador de Tarefas) possam disparar a atualização.

Uso:  py etl/verificar.py              # verifica e grava status.json
      py etl/verificar.py --registrar  # registra o estado remoto atual como "já incorporado"
"""
import hashlib
import json
import re
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_data as b  # noqa: E402

ESTADO = b.ROOT / "etl" / "estado.json"
STATUS = b.OUT / "status.json"
PAGINA_Q = ("https://www.gov.br/capes/pt-br/acesso-a-informacao/acoes-e-programas/avaliacao/"
            "avaliacao-quadrienal/resultado-da-avaliacao-quadrienal-2021-2024")
BASES = {"prog": "Programas", "disc": "Discentes", "doc": "Docentes"}
TITULO = re.compile(r"\[(\d{4}) a (\d{4})\]\s*(Programas|Discentes|Docentes) da P", re.I)
NOME_RES = re.compile(r"-(?:PROG|DISCENTES|DOCENTE)-(20\d\d)-|_(20\d\d)$")


def dados_abertos():
    """Estado remoto das bases: último ano publicado e data de modificação de cada pacote."""
    pacotes = b.descobrir_pacotes()
    saida = {}
    for base, nomes in pacotes.items():
        mod, ano = {}, 0
        for n in nomes:
            p = b.api("package_show", id=n)
            mod[n] = p["metadata_modified"]
            for r in p["resources"]:
                m = NOME_RES.search(r["name"])
                if r["format"] == "CSV" and m:
                    ano = max(ano, int(m.group(1) or m.group(2)))
        saida[base] = {"ultimo_ano": ano, "modificado": mod}
    return saida


def quadrienal():
    r = requests.get(PAGINA_Q, headers=b.HEADERS, timeout=90)
    r.raise_for_status()
    links = sorted(set(re.findall(r'href="([^"]+\.xlsx[^"]*)"', r.text)))
    mod = (re.search(r"Modificado em (\d\d/\d\d/\d{4} \d\d:\d\d)", r.text) or [None, ""])[1]
    etag = ""
    if links:
        h = requests.head("https://www.gov.br" + links[0], headers=b.HEADERS, timeout=60, allow_redirects=True)
        etag = h.headers.get("etag", "") + h.headers.get("content-length", "")
    return {"links": links, "pagina_modificada": mod, "assinatura": hashlib.md5((",".join(links) + etag).encode()).hexdigest()}


def estado_remoto():
    return {"dados_abertos": dados_abertos(), "quadrienal": quadrienal()}


def ano_local():
    meta = json.loads((b.OUT / "meta.json").read_text(encoding="utf-8"))
    return max(meta["anos"])


def comparar(remoto, base):
    """Lista de fontes com situação: em_dia | novo_ano | revisado | novo | sem_base."""
    fontes = []
    local = ano_local()
    for k, nome in BASES.items():
        r = remoto["dados_abertos"][k]
        antigo = (base or {}).get("dados_abertos", {}).get(k)
        if r["ultimo_ano"] > local:
            sit, det = "novo_ano", f"CAPES publicou o ano-base {r['ultimo_ano']} (o painel vai até {local})."
        elif antigo and antigo["modificado"] != r["modificado"]:
            sit, det = "revisado", "A CAPES alterou arquivos já incorporados (possível revisão de dados)."
        else:
            sit, det = "em_dia", f"Último ano publicado: {r['ultimo_ano']}."
        fontes.append({"id": k, "nome": f"{nome} da pós-graduação (dados abertos)", "situacao": sit, "detalhe": det,
                       "ultimo_ano": r["ultimo_ano"], "url": "https://dadosabertos.capes.gov.br/"})
    q, qa = remoto["quadrienal"], (base or {}).get("quadrienal")
    if qa and qa["assinatura"] != q["assinatura"]:
        sit, det = "novo", "A planilha ou a página do resultado da Quadrienal mudou (pode haver resultado pós-recursos)."
    else:
        sit, det = "em_dia", f"Página modificada em {q['pagina_modificada'] or 'data não informada'}."
    fontes.append({"id": "quadrienal", "nome": "Resultado da Avaliação Quadrienal", "situacao": sit, "detalhe": det,
                   "url": PAGINA_Q})
    return fontes


def registrar(remoto=None):
    ESTADO.write_text(json.dumps(remoto or estado_remoto(), indent=1, ensure_ascii=False), encoding="utf-8")


def main():
    if "--registrar" in sys.argv:
        registrar()
        print("estado remoto registrado como incorporado")
        return 0
    base = json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else None
    erro = None
    try:
        remoto = estado_remoto()
        fontes = comparar(remoto, base)
    except Exception as e:  # noqa: BLE001 — a verificação nunca deve derrubar o painel
        erro, fontes = f"{type(e).__name__}: {str(e)[:200]}", []
    novidades = [f for f in fontes if f["situacao"] != "em_dia"]
    status = {"verificado_em": time.strftime("%Y-%m-%dT%H:%M:%S"), "erro": erro, "fontes": fontes,
              "ha_novidade": bool(novidades), "sem_base": base is None}
    STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=1), encoding="utf-8")
    for f in fontes:
        print(f"[{f['situacao']}] {f['nome']}: {f['detalhe']}")
    if erro:
        print("Falha na verificação:", erro)
        return 1
    if base is None:
        print("Sem estado de referência: rode `py etl/verificar.py --registrar` após a última atualização.")
    return 10 if novidades else 0


if __name__ == "__main__":
    sys.exit(main())
