# Observatório da Pós-Graduação da UFSCar

Site estático que acompanha a pós-graduação stricto sensu da UFSCar e a compara com as
**Sudeste** e o **Brasil** (federais ou todas as IES, à escolha), com dados abertos da CAPES
(Plataforma Sucupira): Programas, Discentes e Docentes, 2013 a 2024.

## Estrutura
- `etl/build_data.py` baixa os CSVs da CAPES por streaming, agrega em memória e grava JSONs em `site/data/`.
  Nenhum dado pessoal é armazenado (só contagens).
- `site/` é o painel (HTML + JS + Chart.js), sem build. Pode ser publicado em qualquer hospedagem estática.

## Uso
```
py -m pip install requests
py etl/build_data.py            # gera site/data/*.json (usa cache em etl/cache)
py -m http.server 8780 --directory site
```
Abra http://localhost:8780. Use `--refresh` no ETL para baixar tudo de novo (~2,5 GB de tráfego).
Quando a CAPES publicar um novo ano, inclua o pacote em `PACOTES` e rode o ETL de novo.

## Observações
- O DataStore/API SQL da CAPES carrega só parte das linhas de Discentes e Docentes, por isso o ETL lê os CSVs completos.
- Docentes são vínculos docente–programa; discentes são vínculos curso–aluno com situação *matriculado* ou *titulado*.
- Fonte dos dados: https://dadosabertos.capes.gov.br/ (CC-BY).

## Painel
Abas: Visão geral, Série histórica (16 indicadores, 2013-2024), Discentes, Docentes, Programas (conceitos por ano),
Programas em rede (UFSCar sede ou associada) e Comparar IES do Sudeste. Filtros globais de universo, grande área, nível e ano.
Os dados de redes em que a UFSCar é apenas associada cobrem a rede inteira e não entram nos totais da UFSCar.

## Avaliação Quadrienal
`py -m pip install openpyxl pandas && py etl/avaliacao.py` baixa a planilha oficial de resultados (CAPES, 27/05/2026)
e gera `site/data/quadrienal.json`, cruzando pelo código do programa com a base de Programas 2024.

## Verificação automática de atualizações
- `py etl/verificar.py` consulta o portal de dados abertos (novo ano-base ou arquivos revisados de Programas, Discentes e Docentes) e a página da Quadrienal, e grava `site/data/status.json`. O painel mostra um aviso quando há novidade e a data da última verificação.
- `py etl/atualizar.py` verifica e, se houver novidade, baixa só os arquivos novos e regera os dados (códigos de saída: 0 nada novo, 10 atualizado, 1 erro).
- Agendamento: `.github/workflows/atualizar.yml` (GitHub Actions, toda segunda-feira, faz commit dos dados) ou `etl/agendar_windows.ps1` (Agendador de Tarefas do Windows).
- O estado já incorporado fica em `etl/estado.json`, registrado ao fim de cada atualização.

## Identidade visual
O estilo segue o portal da ProPlan/UFSCar (tema "zip-ufscar"): faixa superior azul-marinho `#244578`, cabeçalho branco,
menu cinza `#e6e6e6` em caixa alta, fundo `#fafafa`, texto `#4d4d4d`, Open Sans no texto e Montserrat nos títulos
(com barra dourada `#ffd700` à esquerda), botões azul-marinho arredondados e rodapé azul-marinho. Há botões de
tamanho de texto (A−/A+) e de alto contraste. Os logotipos da ProPlan e da ProPG (copiados dos sites oficiais para `site/assets/`) estão no cabeçalho;
a publicação em domínio institucional deve ser autorizada pelas pró-reitorias.

## Sites dos programas
`etl/sites_ppg.py` associa o código CAPES de cada programa ao site oficial no domínio `ufscar.br` (listas da ProPG; PROF-FILO por busca)
e confere se o endereço responde, gravando `site/data/ppg_sites.json`. Ao clicar no título/caixa do programa, o painel abre o site;
o botão "Trajetória" abre o histórico. Programa sem site próprio aponta para a página geral de programas da ProPG.
Se surgir um programa novo, acrescente o código em `SITES` e rode o script.

## Programas em rede e níveis
- Os 4 programas em rede em que a UFSCar é associada (PROFMAT, PROFIS, PROEF, PROF-FILO) entram nos totais da UFSCar por padrão (caixa no filtro). No ETL, cada programa gera linhas copiadas com `rede = "S"` (ies/ie = UFSCAR); Sudeste e Brasil ignoram essas cópias. Os números são os da rede inteira.
- A aba "Por nível" separa mestrado/doutorado acadêmico e profissional; o filtro "Nível" aceita cada um isoladamente.

## Design
O visual segue o "Guia de design" de painéis de indicadores da ProPlan/UFSCar: azul-marinho `#244578`/`#0f4a85`, amarelo `#f2b705` para a entidade em foco (UFSCar), Open Sans, raio de 18 px, foco amarelo, menu fixo em grade 2×5, filtros em cartão com chips, faixa de abertura, figuras numeradas com exportação CSV, tabelas com cabeçalho azul-marinho e zebra, tema claro/escuro automático e impressão sem menu e filtros.
