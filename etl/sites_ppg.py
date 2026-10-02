"""Endereços dos sites dos programas de pós-graduação no domínio ufscar.br.

Fonte: páginas oficiais da ProPG/UFSCar
  https://www.propg.ufscar.br/pt-br/pos-na-ufscar/programas
  https://www.propg.ufscar.br/pt-br/atendimento/programas-de-pos-graduacao-da-ufscar-lista-de-contatos
O PROF-FILO foi localizado por busca no domínio ufscar.br.

A CAPES não informa o site de cada programa; o vínculo é feito pelo código do programa (manual, abaixo).
O script confere se cada endereço responde (e pertence a ufscar.br) e grava site/data/ppg_sites.json.
Programas sem site próprio localizado apontam para a página geral de programas da ProPG.

Uso: py etl/sites_ppg.py
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import requests

RAIZ = Path(__file__).resolve().parent.parent
GERAL = "https://www.propg.ufscar.br/pt-br/pos-na-ufscar/programas"
P = "33001014"  # prefixo dos códigos de programas da UFSCar

SITES = {
    P + "076P0": "https://www.ppga.ufscar.br/",                     # Administração (Sorocaba)
    P + "034P5": "https://www.ppgaa.ufscar.br/pt-br",              # Agricultura e Ambiente
    P + "022P7": "https://www.ppgadr.ufscar.br/pt-br",             # Agroecologia e Desenvolvimento Rural
    P + "023P3": "http://www.ppgas.ufscar.br",                     # Antropologia Social
    P + "020P4": "https://www.ppgbiotec.ufscar.br/pt-br",          # Biotecnologia
    P + "042P8": "https://www.ppgbma.ufscar.br/",                  # Biotecnologia e Monitoramento Ambiental
    P + "026P2": "https://www.ppgpol.ufscar.br/pt-br",             # Ciência Política
    P + "008P4": "https://www.ppgcc.ufscar.br/pt-br",              # Ciência da Computação (São Carlos)
    P + "044P0": "https://www.ppgcc.ufscar.br/pt-br",              # Ciência da Computação (Sorocaba, incorporado ao PPGCC)
    P + "052P3": "https://www.ppgci.ufscar.br/pt-br",              # Ciência da Informação
    P + "032P2": "https://www.ppgcm.ufscar.br/pt-br",              # Ciência dos Materiais (Sorocaba)
    P + "004P9": "https://www.ppgcem.ufscar.br/pt-br",             # Ciência e Engenharia de Materiais
    P + "027P9": "https://www.ppgcts.ufscar.br/pt-br",             # Ciência, Tecnologia e Sociedade
    P + "047P0": "http://www.ppgcam.ufscar.br",                    # Ciências Ambientais
    P + "037P4": "http://www.pipgcf.ufscar.br",                    # Ciências Fisiológicas (PIPGCF)
    P + "048P6": "https://www.ppgcfau.ufscar.br/pt-br",            # Conservação da Fauna
    P + "003P2": "http://www.ppgern.ufscar.br",                    # Ecologia e Recursos Naturais
    P + "035P1": "https://www.ppgec.ufscar.br/pt-br",              # Economia
    P + "001P0": "https://www.ppge.ufscar.br/pt-br",               # Educação (São Carlos)
    P + "043P4": "https://www.ppged.ufscar.br/pt-br",              # Educação (Sorocaba)
    P + "070P1": "https://www.ppgedcm-ar.ufscar.br/pt-br",         # Educação em Ciências e Matemática
    P + "002P6": "https://www.ppgees.ufscar.br/pt-br",             # Educação Especial
    P + "028P5": "http://www.ppgenf.ufscar.br",                    # Enfermagem
    P + "013P8": "https://www.ppgep.ufscar.br/pt-br",              # Engenharia de Produção (São Carlos)
    P + "039P7": "https://www.ppgeps.ufscar.br/",                  # Engenharia de Produção (Sorocaba)
    P + "074P7": "https://www.ppgpep.ufscar.br/pt-br",             # Engenharia de Produção (profissional)
    P + "072P4": "http://www.ppgee.ufscar.br",                     # Engenharia Elétrica
    P + "073P0": "https://www.ppgemec.ufscar.br/",                 # Engenharia Mecânica
    P + "006P1": "https://www.ppgeq.ufscar.br/pt-br",              # Engenharia Química
    P + "015P0": "https://www.ppgeu.ufscar.br/pt-br",              # Engenharia Urbana
    P + "029P1": "https://www.ppgece.ufscar.br/",                  # Ensino de Ciências Exatas
    P + "017P3": "https://www.pipges.ufscar.br/pt-br",             # Estatística (PIPGEs, nome antigo)
    P + "045P7": "https://www.pipges.ufscar.br/pt-br",             # Estatística (PIPGEs)
    P + "018P0": "https://ppgeciv.ufscar.br/",                     # Engenharia Civil (antes Estruturas e Construção Civil)
    P + "075P3": "https://www.ppgech.ufscar.br/pt-br",             # Estudos da Condição Humana
    P + "041P1": "https://www.ppglit.ufscar.br/pt-br/front-page",  # Estudos de Literatura
    P + "010P9": "https://www.ppgfil.ufscar.br/pt-br",             # Filosofia
    P + "016P7": "http://www.ppgft.ufscar.br",                     # Fisioterapia
    P + "011P5": "https://www.ppgf.ufscar.br/pt-br",               # Física
    P + "012P1": "http://www.ppggev.ufscar.br/",                   # Genética Evolutiva e Biologia Molecular
    P + "071P8": "https://www.ppggeo.ufscar.br/",                  # Geografia
    P + "069P3": "http://www.ppggero.ufscar.br",                   # Gerontologia
    P + "038P0": "http://www.gestaodaclinica.ufscar.br",           # Gestão da Clínica
    P + "046P3": "https://www.ppgads.ufscar.br/pt-br",             # Administração e Sociedade (antes Gestão de Organizações e Sistemas Públicos)
    P + "030P0": "https://www.ppgis.ufscar.br/pt-br",              # Imagem e Som
    P + "021P0": "https://www.ppgl.ufscar.br/pt-br",               # Linguística
    P + "007P8": "https://www.dm.ufscar.br/ppgm/",                 # Matemática
    P + "050P0": "https://www.ppgpur.ufscar.br/pt-br",             # Planejamento e Uso de Recursos Renováveis
    P + "077P6": "https://www.ppgpcm.ufscar.br/pt-br",             # Produção de Conteúdo Multiplataforma
    P + "051P7": "https://www.ppgpvba.ufscar.br/pt-br",            # Produção Vegetal e Bioprocessos Associados
    P + "049P2": "https://www.ppgpe.ufscar.br/pt-br",              # Profissional em Educação
    P + "031P6": "https://www.ppgpsi.ufscar.br/pt-br",             # Psicologia
    P + "005P5": "https://www.ppgq.ufscar.br/pt-br",               # Química
    P + "024P0": "https://www.ppgpq.ufscar.br/pt-br",              # Química (profissional)
    P + "025P6": "https://www.ppgs.ufscar.br/",                    # Sociologia
    P + "040P5": "https://www.ppgsga.ufscar.br/pt-br",             # Sustentabilidade na Gestão Ambiental
    P + "036P8": "http://www.ppgto.ufscar.br",                     # Terapia Ocupacional
    # programas em rede com a UFSCar como associada (site do polo/núcleo UFSCar)
    "31075010001P2": "https://www.profmat.ufscar.br/index.php",    # PROFMAT
    "33283010001P5": "https://www.mnpefsorocaba.ufscar.br/",       # PROFIS (polo Sorocaba)
    "33004137068P8": "http://www.proef.ufscar.br/",                # PROEF
    "40001016170P6": "https://www.prof-filo.ufscar.br/pt-br",      # PROF-FILO
}
# 33001014033P9 (Diversidade Biológica e Conservação, encerrado em 2016) não tem site próprio: usa a página geral.
OUTROS = ["33001014033P9"]


def confere(item):
    cod, url = item
    host = urlparse(url).hostname or ""
    if not host.endswith("ufscar.br"):
        return cod, {"url": GERAL, "status": "fora_do_dominio", "original": url}
    for tent in (url, url.replace("http://", "https://")):
        try:
            r = requests.get(tent, headers={"User-Agent": "Mozilla/5.0"}, timeout=40, allow_redirects=True)
            fim = urlparse(r.url).hostname or ""
            if r.status_code < 400 and fim.endswith("ufscar.br"):
                return cod, {"url": tent if tent.startswith("https") else url, "status": "ok"}
        except requests.RequestException:
            continue
    return cod, {"url": url, "status": "nao_respondeu"}  # mantém o endereço oficial; o painel avisa


def main():
    with ThreadPoolExecutor(max_workers=8) as ex:
        res = dict(ex.map(confere, SITES.items()))
    for c in OUTROS:
        res[c] = {"url": GERAL, "status": "pagina_geral"}
    saida = RAIZ / "site" / "data" / "ppg_sites.json"
    saida.write_text(json.dumps({"geral": GERAL, "sites": res}, ensure_ascii=False, indent=1), encoding="utf-8")
    cont = {}
    for v in res.values():
        cont[v["status"]] = cont.get(v["status"], 0) + 1
    print(len(res), "programas;", cont)
    for c, v in res.items():
        if v["status"] not in ("ok", "pagina_geral"):
            print("  ", c, v)


if __name__ == "__main__":
    sys.exit(main())
