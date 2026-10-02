# Registra no Agendador de Tarefas do Windows a verificação semanal de atualizações da CAPES.
# Execute uma vez (PowerShell):   .\etl\agendar_windows.ps1
# Para remover:                   Unregister-ScheduledTask -TaskName "Painel PG UFSCar - verificar CAPES" -Confirm:$false
$raiz = Split-Path -Parent $PSScriptRoot
$acao = New-ScheduledTaskAction -Execute "py" -Argument "etl\atualizar.py" -WorkingDirectory $raiz
$gatilho = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 7:00
$cfg = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable
Register-ScheduledTask -TaskName "Painel PG UFSCar - verificar CAPES" -Action $acao -Trigger $gatilho -Settings $cfg `
  -Description "Verifica novos dados da CAPES e atualiza o painel da pós-graduação da UFSCar." | Out-Null
Write-Host "Tarefa criada: segundas-feiras às 07:00."
