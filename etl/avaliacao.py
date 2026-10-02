"""Resultado da Avaliação Quadrienal (ciclo 2021-2024, chamada oficialmente "Quadrienal 2025").

Fonte oficial: planilha publicada pela CAPES em 27/05/2026 em
https://www.gov.br/capes/pt-br/acesso-a-informacao/acoes-e-programas/avaliacao/avaliacao-quadrienal/resultado-da-avaliacao-quadrienal-2021-2024

A planilha traz área, IES, código e nome do programa, nível e as notas (CTC-ES 238 a 240,
reconsideração na 241 e "recomendação final da nota"). Região, status jurídico, grande área
e conceito anterior vêm do CSV de Programas 2024 (cruzamento pelo código do programa).

Uso:  py etl/avaliacao.py            # reaproveita a planilha em etl/fontes
      py etl/avaliacao.py --refresh  # baixa de novo
"""
import json
import re
import sys
import time
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_data as b  # noqa: E402

URL = ("https://www.gov.br/capes/pt-br/centrais-de-conteudo/documentos/avaliacao/"
       "27052026_Resultado_2826627_Resultados_da_Avaliacao_Quadrienal_2025_para_publicacao_25_5___senha.xlsx"
       "/@@download/file")
PAGINA = ("https://www.gov.br/capes/pt-br/acesso-a-informacao/acoes-e-programas/avaliacao/"
          "avaliacao-quadrienal/resultado-da-avaliacao-quadrienal-2021-2024")
XLSX = b.ROOT / "etl" / "fontes" / "resultado_quadrienal_2025.xlsx"


def baixa():
    XLSX.parent.mkdir(parents=True, exist_ok=True)
    if XLSX.exists() and "--refresh" not in sys.argv:
        return
    r = requests.get(URL, headers=b.HEADERS, timeout=120)
    r.raise_for_status()
    XLSX.write_bytes(r.content)
    print("planilha baixada:", len(r.content), "bytes", flush=True)


def nota(v):
    m = re.match(r"\d", str(v).strip())
    return int(str(v).strip()[0]) if m else None


def main():
    baixa()
    d = pd.read_excel(XLSX, header=4)
    d.columns = ["area", "ies", "nome_ies", "cod", "nome", "nivel", "n1", "n2", "final"]
    d = d.dropna(subset=["cod"])
    d["cod"] = d["cod"].astype(str).str.extract(r"(\d+P\d+)")[0]
    d = d.dropna(subset=["cod"])

    rec = json.loads((b.CACHE / "recursos.json").read_text(encoding="utf-8"))
    ref = [r for r in rec["prog"] if "2024" in r["name"]][0]
    base = {x["CD_PROGRAMA_IES"]: x for x in b.linhas_csv(ref["url"])}

    cols = ["cod", "ies", "area", "nome", "nivel", "desat", "ant", "n1", "n2", "nota", "reg", "jur", "uf", "ga", "grau"]
    rows, sem = [], 0
    for _, x in d.iterrows():
        p = base.get(x.cod)
        sem += p is None
        rows.append([
            x.cod, str(x.ies).strip(), str(x.area).strip(), str(x.nome).strip(),
            str(x.nivel).replace("*", "").strip(), "**" in str(x.nivel),
            (p or {}).get("CD_CONCEITO_PROGRAMA", ""), nota(x.n1), nota(x.n2), nota(x["final"]),
            (p or {}).get("NM_REGIAO", ""), (p or {}).get("CS_STATUS_JURIDICO", ""), (p or {}).get("SG_UF_PROGRAMA", ""),
            (p or {}).get("NM_GRANDE_AREA_CONHECIMENTO", ""), (p or {}).get("NM_GRAU_PROGRAMA", "")])
    out = {
        "publicado": "2026-05-27", "pagina": PAGINA,
        "obs": "Planilha oficial da CAPES (recomendação final da nota, CTC-ES 238 a 241). A página da CAPES informa que o "
               "resultado só é definitivo após o esgotamento dos recursos (prazo de 16/06/2026).",
        "cols": cols, "rows": rows,
    }
    (b.OUT / "quadrienal.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(rows)} programas avaliados; {sem} sem correspondência no CSV de Programas 2024 (sem região/status)")


if __name__ == "__main__":
    main()
