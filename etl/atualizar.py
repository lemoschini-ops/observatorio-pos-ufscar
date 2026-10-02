"""Verifica a CAPES e, se houver novidade, atualiza os dados do painel.

  1. etl/verificar.py          -> compara a CAPES com o estado já incorporado (status.json)
  2. etl/build_data.py         -> baixa só os arquivos novos (cache por arquivo) e regera os cubos
  3. etl/avaliacao.py          -> rebaixa a planilha da Quadrienal, se ela mudou
  4. etl/verificar.py          -> grava o novo status (tudo em dia)

Uso:  py etl/atualizar.py              # verifica e atualiza se necessário
      py etl/atualizar.py --so-verificar
      py etl/atualizar.py --forcar     # atualiza mesmo sem novidade

Saída: 0 = nada mudou, 10 = dados atualizados, 1 = erro.
"""
import json
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ETL = RAIZ / "etl"


def rodar(script, *args):
    print(f"\n$ {script} {' '.join(args)}", flush=True)
    return subprocess.run([sys.executable, str(ETL / script), *args], cwd=RAIZ).returncode


def main():
    cod = rodar("verificar.py")
    if cod == 1:
        return 1
    status = json.loads((RAIZ / "site" / "data" / "status.json").read_text(encoding="utf-8"))
    mudou = {f["id"] for f in status["fontes"] if f["situacao"] != "em_dia"}
    if "--so-verificar" in sys.argv:
        return 10 if mudou else 0
    if not mudou and "--forcar" not in sys.argv:
        print("\nNada novo na CAPES.")
        return 0

    if mudou & {"prog", "disc", "doc"} or "--forcar" in sys.argv:
        # --redescobrir: procura pacotes/arquivos novos; o cache evita rebaixar o que já existe
        if rodar("build_data.py", "--redescobrir") != 0:
            return 1
    if "quadrienal" in mudou or "--forcar" in sys.argv:
        if rodar("avaliacao.py", "--refresh") != 0:
            return 1
    # grava o estado como incorporado e atualiza o status exibido no painel
    rodar("verificar.py", "--registrar")
    rodar("verificar.py")
    print("\nDados atualizados. Revise o painel antes de publicar.")
    return 10


if __name__ == "__main__":
    sys.exit(main())
