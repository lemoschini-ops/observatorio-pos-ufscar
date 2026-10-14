# Análise dos dados do Observatório da Pós-Graduação da UFSCar

Base: CAPES Dados Abertos (Programas, Discentes e Docentes, 2013–2024; gerado em 06/10/2026), Avaliação Quadrienal (planilha de 27/05/2026) e e-MEC (lato sensu, coletado em 07/10/2026). Todos os números foram recalculados a partir dos JSONs em `site/data/`.

**Duas leituras dos totais.** O painel, por padrão, inclui nos totais da UFSCar os 4 programas em rede em que ela é associada, e esses programas trazem a rede inteira (matriculados, titulados e docentes de todas as IES). Por isso:

| 2024 | Só programas próprios (56) | Com os 4 em rede (painel padrão) |
|---|---|---|
| Matriculados | 3.548 | 8.510 |
| Titulados | 1.104 | 2.141 |
| Docentes permanentes | 1.150 | 3.582 |

Para comparar a UFSCar com outras IES, a leitura "só próprios" é a justa. As variações do painel com redes (ex.: docentes permanentes +108%) devem ser lidas com cautela.

## 1. Programas

**Crescimento.** A UFSCar passou de 46 programas (2013) para 56 (2024), +22%, com expansão contínua exceto em 2022–2023. O Brasil foi de 3.568 para 4.635 (+30%) e as federais de 2.041 para 2.743 (+34%). Desde 2021 o número brasileiro está estável (4.6–4.7 mil).

**Composição em 2024 (56 programas).**
- Nível: 35 mestrado/doutorado (62,5%), 12 só mestrado acadêmico, 9 mestrado profissional (16%). Não há doutorado isolado nem doutorado profissional. No Brasil, 18,4% são profissionais e 58% têm doutorado.
- Grande área: Multidisciplinar 12, Ciências Humanas 10, Engenharias 9, Exatas e da Terra 7, Sociais Aplicadas 6, Biológicas 4, Saúde 4, Agrárias 2, Linguística/Letras/Artes 2. O perfil é diversificado, com peso grande da Multidisciplinar (21%).
- Todos "em funcionamento".

**Conceitos CAPES 2024 (base de Programas).**

| Universo | Programas | % conc. 3 | % conc. 5–7 | % conc. 6–7 |
|---|---|---|---|---|
| UFSCar | 56 | 14,3 | 42,9 | 14,3 |
| Federais Sudeste | 973 | 17,6 | 41,4 | 19,5 |
| Sudeste (todas) | 1.970 | 14,8 | 46,4 | 21,6 |
| Federais Brasil | 2.743 | 22,2 | 35,4 | 14,0 |
| Brasil | 4.635 | 20,4 | 37,0 | 14,5 |

UFSCar (3 / 4 / 5 / 6 / 7 / A): 8 / 21 / 16 / 3 / 5 / 3. Está acima da média nacional e das federais do Sudeste em proporção de 5–7, mas abaixo delas na faixa de excelência (6–7): 14,3% contra 19,5%.

Com 56 programas, é a 6ª maior entre as 64 federais do Sudeste (UFRJ 125, UFMG 87, UFF 77, UNIFESP 63, UFES 56).

Observação sobre a série: de 2020 para 2021 a distribuição muda bruscamente (conceito 3 cai de 15 para 8 e conceito 5 sobe de 6 para 16). Reflete a reavaliação oficial no início da base 2021–2024, não uma mudança de desempenho em um ano.

## 2. Discentes (programas próprios, salvo indicação)

**Série.**

| Ano | Matriculados | Titulados | Ingressantes | Desligados + abandono |
|---|---|---|---|---|
| 2013 | 3.058 | 897 | 1.360 | 186 |
| 2019 | 3.598 | 1.192 | 1.349 | 149 |
| 2020 | 3.587 | 1.057 | 1.223 | 140 |
| 2022 | 3.769 | 985 | 1.311 | 264 |
| 2024 | 3.548 | 1.104 | 1.273 | 273 |

- Matrícula cresceu 23% de 2013 a 2022 e recuou 6% em 2022–2024 (pico de 3.769 em 2022).
- Desligamentos e abandonos subiram de 140–186 por ano (2013–2020) para 264–273 (2022–2024). Esse é o sinal mais claro de deterioração na série.
- Titulados: pico em 2019 (1.192), queda em 2020 (pandemia), em 2022 (985) o mínimo recente, recuperação a 1.104 em 2024.
- Pessoas distintas (base de pessoas): 4.807 em 2024 (pico de 4.947 em 2023).

**Equilíbrio mestrado × doutorado.** Em 2013 havia mais mestrandos (1.641) que doutorandos (1.417). Desde 2022 a razão é praticamente 1:1 (2024: 1.710 mestrado, 1.838 doutorado). Quase todo o crescimento da base foi no doutorado (+30%), enquanto o mestrado ficou estável.

**Tempo para titular (meses, 2024).** UFSCar 38,0, contra 37,6 nas federais do Sudeste, 36,4 nas federais do Brasil e 36,2 no Brasil. Subiu de 33 (2013–2016) para 38 (2022–2024), movimento que vem junto com o aumento do desligamento. Por nível: mestrado 28,0, mestrado profissional 29,7, doutorado 54,6.

**Eficiência de titulação (titulados ÷ matriculados, 2024).** UFSCar 31,1%, melhor que as federais do Sudeste (28,5%), federais do Brasil (27,0%) e Brasil (28,2%). Isso mostra que o fluxo de saída é alto em relação à base, apesar do tempo médio maior.

**Matriculados por grande área (próprios, 2024):** Humanas 976 (27,5%), Engenharias 627, Multidisciplinar 549, Exatas 530, Saúde 329, Linguística/Letras/Artes 185, Biológicas 179, Sociais Aplicadas 137, Agrárias 36. Sociais Aplicadas tem poucos matriculados para 6 programas (23 por programa), e Agrárias é a menor área.

**Perfil.**
- Idade: 7,4% têm 20–24 anos (Brasil 6,1%) e 32,9% têm 25–29 (Brasil 27,6%). Acima de 40 anos são 21,9% (Brasil 28,5%). A UFSCar tem um corpo discente mais jovem que o nacional.
- Estrangeiros: 2,0% (Brasil 1,5%). Era 2,4% em 2013 e chegou a 3,1% em 2015, com recuo até 1,7% em 2023.

## 3. Docentes (programas próprios)

**Série de permanentes:** 942 (2013), 1.024 (2019), 1.150 (2024), +22%. Salto de 1.025 para 1.129 em 2021 (coincide com a reavaliação dos programas). Colaboradores caíram de 225 para 193. Visitantes são pouquíssimos (17).

**Perfil dos permanentes em 2024:**
- Regime: dedicação exclusiva 87% (1.002), integral 5,7% (65), parcial 7,2% (83).
- Doutores: 99,8% (1.148 de 1.150), igual ao Brasil (99,8%).
- Faixa etária (todos os docentes): 40–49 anos concentram 39%; 60 anos ou mais são 24,3% e 70 ou mais 7,4%. Só 10% têm menos de 40. Há envelhecimento do corpo docente.
- Nacionalidade: 2,3% estrangeiros.
- Docentes com bolsa (campo `bolsa`): 29%.
- Por área (permanentes): Multidisciplinar 238, Humanas 211, Engenharias 194, Exatas 184, Saúde 100, Sociais 82, Biológicas 70, Letras 43, Agrárias 28.

**Razão discente/docente permanente (2024):** UFSCar 3,09, abaixo das federais do Sudeste (3,27), federais do Brasil (3,40) e Brasil (3,51). A UFSCar tem folga relativa de docentes, o que é favorável à orientação, mas também indica que a recente queda de matrícula pesa mais na capacidade ociosa. Participação de docentes não permanentes: 15,4% (Brasil 17,1%).

## 4. Crescimento comparado, 2013–2024 (com redes, como no painel)

| Universo | Matriculados | Titulados | Docentes perm. |
|---|---|---|---|
| UFSCar | +47,6% | +30,6% | +107,7%* |
| Federais Sudeste | +45,3% | +33,8% | +51,3% |
| Sudeste (todas) | +27,2% | +22,1% | +33,8% |
| Federais Brasil | +58,5% | +39,7% | +58,4% |
| Brasil | +48,4% | +36,0% | +48,6% |

*Distorcido pelas redes. Sem redes: +22%.

Participação da UFSCar em 2024 (com redes): 5,65% dos matriculados do Sudeste e 2,58% do Brasil. A UFSCar acompanha o Brasil na matrícula, mas titula menos do que cresce (+31% contra +48%), enquanto as federais do Brasil titulam +40%.

## 5. Avaliação Quadrienal (resultado de 05/2026, sujeito a recursos)

**Universo.** 4.555 programas avaliados; 54 programas ativos da UFSCar (mais 1 desativado) entre os 55 da planilha.

**Distribuição de notas, programas ativos.**

| Universo | Programas | % nota ≤3 | % 4 | % 5 | % 5–7 | % 6–7 |
|---|---|---|---|---|---|---|
| UFSCar | 54 | 9,3 | 37,0 | 35,2 | 53,7 | 18,5 |
| Federais Sudeste | 962 | 10,8 | 39,6 | 27,2 | 49,6 | 22,3 |
| Sudeste | 1.922 | 10,3 | 35,5 | 28,4 | 54,2 | 25,8 |
| Federais Brasil | 2.714 | 14,1 | 41,9 | 26,6 | 44,0 | 17,4 |
| Brasil | 4.538 | 13,7 | 40,6 | 27,4 | 45,7 | 18,2 |

UFSCar: nota 3 (5), 4 (20), 5 (19), 6 (4), 7 (6), com os 6 programas de nota 3 contando o desativado. Tem 53,7% de programas 5–7, acima das federais do Sudeste e do Brasil, quase empatada com o Sudeste como um todo. A faixa 6–7 (18,5%) está na média nacional, bem abaixo das federais do Sudeste (22,3%).

**Ranking do Sudeste federal (IES com 25+ programas), nota média:**

| IES | Programas | % 5–7 | % 6–7 | Nota média |
|---|---|---|---|---|
| UFMG | 87 | 75,9 | 49,4 | 5,52 |
| FIOCRUZ | 32 | 78,1 | 46,9 | 5,38 |
| UFRJ | 124 | 64,5 | 40,3 | 5,20 |
| UFV | 44 | 68,2 | 34,1 | 5,14 |
| **UFSCar** | **54** | **53,7** | **18,5** | **4,74** |
| UFLA | 40 | 52,5 | 25,0 | 4,72 |
| UFF | 76 | 44,7 | 21,1 | 4,68 |
| UNIFESP | 63 | 46,0 | 19,0 | 4,63 |

A UFSCar é a 5ª do grupo, bem próxima da UFLA e distante do primeiro bloco (UFMG, Fiocruz, UFRJ, UFV).

**Movimento em relação ao ciclo anterior (52 programas com nota anterior numérica):** 18 subiram, 27 mantiveram e 7 caíram. Proporção de subidas (35%) superior à das federais do Sudeste (29%) e ao Brasil (31%), e de quedas (13%) maior que a do Sudeste federal (8%) e do Brasil (7%).
- **Subiram:** Genética Evolutiva e Biol. Molecular 5→6, Engenharia Civil 5→6, Engenharia de Produção (acadêmico) 5→6, Psicologia 6→7, Sociologia 6→7, e vários de 4→5 (Ecologia e Recursos Naturais, Ciências Ambientais, Planejamento e Uso de Recursos Renováveis, Ciência da Informação, Geografia, Agroecologia, Gerontologia, Ciência dos Materiais, Conservação da Fauna).
- **Caíram:** Engenharia Química 7→6, Educação 6→5, Ciência Política 5→4, Filosofia 5→4, CTS 5→4, Química (profissional) 5→4. "Educação" (outro código) 4→3 foi desativado.
- Programas que saíram da nota A: Administração (4), Produção de Conteúdo Multiplataforma e Engenharia de Produção profissional (ambos 3).
- Nota 7 em 2025: Educação Especial, Fisioterapia, Ciência e Engenharia dos Materiais, Química, Psicologia, Sociologia (6 programas).
- Nota 3 em 2025 (a atenção): Educação (profissional), Ensino de Ciências Exatas (profissional), Engenharia Elétrica, Engenharia de Produção profissional, Produção de Conteúdo Multiplataforma, e o programa desativado de Educação.

**Cuidado:** a planilha é a recomendação final, e o resultado só é definitivo após os recursos (prazo 16/06/2026).

## 6. Pós-Graduação lato sensu (e-MEC)

327 cursos de especialização registrados, dos quais 70 ativos (21%) e 257 inativos.
- Local: 307 em São Carlos, 14 em Sorocaba, e alguns em polos fora do campus.
- Modalidade (ativos): 51 EaD (73%), 19 presenciais. As vagas autorizadas somam 7.322, sendo 6.518 em EaD (89%) e 804 presenciais.
- Áreas (ativos): Educação 23, Saúde e bem-estar 23, Negócios/administração/direito 8, Computação/TIC 6, Engenharia 4, Ciências sociais 3, Agricultura 2, Artes 1. Educação e Saúde somam 66% dos cursos ativos.
- Mediana: carga horária 420 h, duração 21 meses e 60 vagas por curso. Há cursos grandes, de até 600 vagas.

O lato sensu tem escala semelhante à de toda a matrícula stricto sensu em vagas autorizadas (7,3 mil contra 8,5 mil matriculados com redes), mas essas vagas não são matrículas efetivas.

## 7. Principais conclusões

1. **Escala e portfólio.** 56 programas próprios (+22% em 11 anos), 6ª maior federal do Sudeste, com diversificação ampla de áreas e peso de 62,5% de programas com doutorado.
2. **Qualidade.** 53,7% dos programas com nota 5–7: acima das federais e do Brasil, mas sem presença suficiente na faixa 6–7 (18,5% contra 22,3% das federais do Sudeste). A UFSCar está num segundo bloco, atrás de UFMG, Fiocruz, UFRJ e UFV.
3. **Dinâmica positiva na Quadrienal.** 18 subidas contra 7 quedas; Genética, Engenharias Civil e de Produção, Psicologia e Sociologia são destaques.
4. **Ponto de atenção principal: fluxo discente.** Desligamentos e abandonos dobraram (de ~140 para ~270 por ano), o tempo para titular subiu 5 meses desde 2013 (doutorado em 54,6 meses) e a matrícula recuou 6% desde 2022.
5. **Eficiência.** Apesar disso, a relação titulados/matriculados (31,1%) e a razão discente/docente (3,09) são melhores que as de seus pares.
6. **Corpo docente.** Totalmente doutor e quase todo em dedicação exclusiva, mas envelhecendo: 24% com 60 anos ou mais e só 10% abaixo de 40.
7. **Programas a acompanhar.** Os de nota 3 (Educação profissional, Ensino de Ciências Exatas, Engenharia Elétrica, Eng. de Produção profissional, Produção de Conteúdo Multiplataforma) e os que caíram de nota (Educação, Ciência Política, Filosofia, CTS, Eng. Química).

## 8. Limites dos dados

- Discentes e docentes são vínculos (curso–aluno, docente–programa), não pessoas. Pessoas distintas existem só como total (base de pessoas).
- Redes: totais incluem a rede inteira em 4 programas em que a UFSCar é associada. Por isso as comparações entre IES usam os programas próprios.
- Os conceitos de 2013–2020 e de 2021–2024 vêm de ciclos avaliativos distintos, o que quebra a comparabilidade da série.
- A Quadrienal depende dos recursos. O lato sensu reflete cadastro no e-MEC (vagas autorizadas), não matrículas.
- Os dados abertos da CAPES mais recentes são de 2024; não há ano-base 2025 publicado (verificado em 14/10/2026).
- Variações como "meses para titular" são médias ponderadas pelo número de titulados no ano, sem distinguir turmas.
