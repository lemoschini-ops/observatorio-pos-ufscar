# API Transparência UFSCar

API (FastAPI) que consulta os dados da Universidade Federal de São Carlos no
[Portal da Transparência](https://portaldatransparencia.gov.br) via API oficial da CGU.

## Uso
1. Obtenha uma chave gratuita: https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email
2. Copie `.env.example` para `.env` e preencha `PORTAL_TRANSPARENCIA_API_KEY`.
3. `py -m pip install -r requirements.txt`
4. `py -m uvicorn app.main:app --port 8765 --reload`
5. Documentação interativa em http://127.0.0.1:8765/docs

Interface web em `/` (consulta interativa, filtro, ordenação, gráfico e exportação CSV).

Endpoints: `/despesas`, `/servidores`, `/contratos`, `/licitacoes`, `/convenios`, `/viagens`, `/cartoes`, `/orgao`.
Datas no formato `dd/MM/yyyy`. O órgão (código SIAFI 26238) é aplicado automaticamente.

## Painel de indicadores TCU + CGU
Painel em `/painel` (JSON em `/api/painel`). Os dados são coletados por `py -m etl.build` e gravados em `data/painel.json`.

| Bloco | Fonte oficial | Acesso |
|---|---|---|
| TCU · iESGo 2024 | planilha pública do TCU (https://iesgo.tcu.gov.br) | download (o TCU não oferece API para o iESGo) |
| CGU · Acesso à Informação | dados abertos Fala.BR (CSV anual) | download, sem chave |
| CGU · Portal da Transparência | API oficial | exige `PORTAL_TRANSPARENCIA_API_KEY` |

Opções: `--only iesgo,lai,ouv,portal,comp` e `--anos 2020-2026`. Downloads ficam em `data/_cache/`.
O código SIAFI da UFSCar é validado contra o cadastro do Portal antes de qualquer agregação (o TCU lista 26280).

### Comparativo com universidades federais (`--only comp`)
| Dado | Fonte |
|---|---|
| Série oficial dos Indicadores TCU da UFSCar (2009–2025) | planilha pública da ProPlan (https://www.proplan.ufscar.br/governanca/indicadores-tcu) |
| Docentes, técnicos, matrículas, ingressantes, concluintes por universidade federal | INEP – Censo da Educação Superior (microdados, 2022–2024) |
| Conceito e nº de cursos de pós-graduação | CAPES – Dados Abertos |
| iESGo por UF/região | TCU, cruzado com o INEP por nome |

Os indicadores comparativos são **calculados** com fórmulas simplificadas (ex.: alunos de graduação, não "aluno equivalente"); não são os valores oficiais do TCU, que só existem para a UFSCar. Grupos: SP (UFSCar, UFABC, UNIFESP), Sudeste (19) e Brasil (69 universidades federais).

### Ouvidoria e navegação do painel
- **Ouvidoria** (`--only ouv`): manifestações do e-Ouv/Fala.BR (CGU) da UFSCar e do HU-UFSCar (Ebserh, órgão separado). O painel guarda uma linha anônima por manifestação (ano, mês, tipo, assunto, prazo, satisfação), sem texto nem dados do manifestante. A coleta lê um zip de ~190 MB e leva alguns minutos.
- **Navegação**: o estado fica na URL (`#tab=ouv&de=2023&ate=2025&tipo=Reclamação`), então links, voltar/avançar e "Copiar link" preservam filtros. Gráficos são clicáveis (filtram ano, tipo, assunto, índice), tabelas ordenam e buscam, e há exportação em PNG/CSV e impressão.

### Publicação estática (Cloudflare Pages)
`py -m etl.export_site` gera a pasta `site/` (HTML, CSS, JS e `data/painel.json`), sem servidor. No Cloudflare Pages: conectar este repositório, *Build command* vazio e *Build output directory* `site`. Para atualizar: `py -m etl.build`, `py -m etl.export_site`, commit e push.

### Corregedoria (`--only cor`)
- **CGU-PAD** (dados abertos da CGU): procedimentos disciplinares por órgão. Guardam-se só linhas anônimas da UFSCar (ano, tipo, fase, assunto, nº de investigados, penalidades, dias até o julgamento) e totais por universidade e ano, sem número de processo.
- **CEAF** (Portal da Transparência, arquivo diário): só contagem de expulsões com lotação na UFSCar e nas universidades federais; nomes e CPF não são guardados.
- O extrato público do CGU-PAD tem poucos registros a partir de 2023, então a análise vai até 2022. A comparação usa procedimentos por 1.000 servidores (docentes + técnicos do Censo 2024).
