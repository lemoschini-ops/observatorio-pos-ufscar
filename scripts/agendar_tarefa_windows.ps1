# Script PowerShell para registrar uma Tarefa Agendada no Windows
# Atualiza a base de dados da UFSCar a cada 24 horas (diariamente)

param (
    [string]$Horario = "03:00",
    [string]$NomeTarefa = "UFSCar_Transparencia_AtualizacaoDiaria"
)

$raiz = Split-Path -Parent $PSScriptRoot
$scriptBat = Join-Path $PSScriptRoot "atualizar_diario.bat"

Write-Host "Configurando tarefa agendada: $NomeTarefa" -ForegroundColor Cyan
Write-Host "Horrio dirio de execuo: $Horario" -ForegroundColor Cyan
Write-Host "Script a ser executado: $scriptBat" -ForegroundColor Cyan

# Verifica se a tarefa j existe e remove para recriar
$existente = Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue
if ($existente) {
    Write-Host "Tarefa j existente encontrada. Recriando..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $NomeTarefa -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute $scriptBat -WorkingDirectory $raiz
$trigger = New-ScheduledTaskTrigger -Daily -At $Horario
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $NomeTarefa -Action $action -Trigger $trigger -Settings $settings -Description "Atualizacao automatica diaria da base de dados TCU e CGU da UFSCar"

Write-Host "Tarefa '$NomeTarefa' registrada com sucesso no Agendador do Windows!" -ForegroundColor Green
Write-Host "Para verificar o status: Get-ScheduledTask -TaskName $NomeTarefa"
