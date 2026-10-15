@echo off
REM Atualizao automtica diria da base de dados TCU/CGU UFSCar
REM Executa o ETL de coleta e sincroniza o site esttico

cd /d "%~dp0\.."
echo [%date% %time%] Iniciando atualizacao da base de dados... >> data\atualizacao.log
py -m etl.build >> data\atualizacao.log 2>&1
if %ERRORLEVEL% EQU 0 (
    py -m etl.export_site >> data\atualizacao.log 2>&1
    echo [%date% %time%] Atualizacao concluida com sucesso. >> data\atualizacao.log
) else (
    echo [%date% %time%] Erro ao executar o build da base de dados. >> data\atualizacao.log
)
