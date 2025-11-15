Write-Host "=== Twitch RPG GitHub Auto Push ===" -ForegroundColor Cyan

# 監視対象ファイル
$Path = "C:\twitch-rpg-bot\players.json"
$folder = Split-Path $Path
$file = Split-Path $Path -Leaf

Write-Host "Monitoring file: $Path"

# Git 設定
$branch = "master"

# FileSystemWatcher 開始
$fsw = New-Object IO.FileSystemWatcher $folder, $file
$fsw.NotifyFilter = [IO.NotifyFilters]'LastWrite'
$fsw.EnableRaisingEvents = $true

Register-ObjectEvent $fsw Changed -Action {
    $timestamp = Get-Date -Format "yyyy/MM/dd HH:mm:ss"
    Write-Host "[CHANGED] $($Event.SourceEventArgs.Name) at $timestamp" -ForegroundColor Yellow

    try {
        Start-Sleep -Milliseconds 300  # players.json が書き終わるのを待つ
        
        Push-Location $folder

        git add players.json
        git commit -m "Auto-update players.json at $timestamp" | Out-Null
        git push origin master

        Pop-Location

        Write-Host "[OK] GitHub へ push 完了 ($timestamp)" -ForegroundColor Green
    }
    catch {
        Write-Host "[ERROR] Git push に失敗しました" -ForegroundColor Red
        Write-Host $_
    }
}

Write-Host "Auto upload started. Watching for changes..."


