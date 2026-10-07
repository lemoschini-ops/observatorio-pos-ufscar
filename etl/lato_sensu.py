"""Cursos de pós-graduação lato sensu (especialização) da UFSCar no cadastro e-MEC.

Fonte: API Olinda/OData do MEC (PDA_Cursos_Especializacao_Brasil), IES 7 (UFSCar), a mesma usada em
https://github.com/lemoschini-ops/e-mec (baixar_emec.py). Retrato atual do cadastro, sem histórico.
Saída: site/data/lato_sensu.json

Uso: py etl/lato_sensu.py
"""
import json
import sys
import time
from pathlib import Path

import requests

try:  # certificados do Windows (o servidor do MEC usa uma cadeia que o Python nem sempre reconhece)
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

RAIZ = Path(__file__).resolve().parent.parent
BASE = "https://olinda.mec.gov.br/olinda-ide/servico/PDA_SERES/versao/v1/odata/"
ENTIDADE = "PDA_Cursos_Especializacao_Brasil"
COD_UFSCAR = 7


def get(url, tentativas=4):
    for i in range(tentativas):
        try:
            r = requests.get(url, timeout=300)
            r.raise_for_status()
            return r
        except requests.RequestException:
            if i == tentativas - 1:
                raise
            time.sleep(5)


def num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def main():
    linhas, skip = [], 0
    while True:
        v = get(f"{BASE}{ENTIDADE}?$format=json&$filter=CODIGO_IES%20eq%20{COD_UFSCAR}&$top=1000&$skip={skip}").json()["value"]
        linhas += v
        if len(v) < 1000:
            break
        skip += 1000
    cursos = [{
        "cod": num(r.get("COD_DA_ESPECIALIZACAO")), "nome": (r.get("NOME_ESPECIALIZACAO") or "").strip(),
        "area": (r.get("OCDE_CINE") or "").strip() or "Não informada", "modalidade": r.get("MODALIDADE"),
        "campus": r.get("MUNICIPIO"), "uf": r.get("UF"), "sit": r.get("SITUACAO"),
        "vagas": num(r.get("VAGAS")), "ch": num(r.get("CARGA_HORARIA")), "dur": num(r.get("DURACAO_MESES")),
    } for r in linhas]
    cursos.sort(key=lambda c: (c["sit"] != "Ativo", c["nome"]))
    saida = RAIZ / "site" / "data" / "lato_sensu.json"
    saida.write_text(json.dumps({
        "coletado_em": time.strftime("%Y-%m-%d"),
        "fonte": "e-MEC (API Olinda do MEC), PDA_Cursos_Especializacao_Brasil, IES 7 (UFSCar)",
        "url": "https://emec.mec.gov.br/", "cursos": cursos,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ativos = sum(c["sit"] == "Ativo" for c in cursos)
    print(f"{len(cursos)} cursos de especialização ({ativos} ativos) -> {saida.name}")


if __name__ == "__main__":
    sys.exit(main())
