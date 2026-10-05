"""Gera site/ (site estático para Cloudflare Pages ou qualquer hospedagem de arquivos).

Uso:  py -m etl.export_site
Copia o painel (static/) e data/painel.json, trocando os caminhos absolutos da API
por caminhos relativos. Rode depois de `py -m etl.build` para publicar dados novos.
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"


def main() -> None:
    if SITE.exists():
        shutil.rmtree(SITE)
    (SITE / "data").mkdir(parents=True)
    html = (ROOT / "static" / "painel.html").read_text(encoding="utf-8")
    html = html.replace("/static/", "")
    (SITE / "index.html").write_text(html, encoding="utf-8")
    js = (ROOT / "static" / "painel.js").read_text(encoding="utf-8").replace("fetch('/api/painel')", "fetch('data/painel.json')")
    assert "data/painel.json" in js
    (SITE / "painel.js").write_text(js, encoding="utf-8")
    for nome in ("painel.css", "logo_proplan.png"):
        shutil.copy(ROOT / "static" / nome, SITE / nome)
    shutil.copy(ROOT / "data" / "painel.json", SITE / "data" / "painel.json")
    (SITE / "_headers").write_text("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n/data/*\n  Cache-Control: public, max-age=300\n", encoding="utf-8")
    print(f"OK -> {SITE}")


if __name__ == "__main__":
    main()
