Get-ChildItem 'c:\Programming\rotmg-raid-bot\bot\src\commands\moderation\*.ts' | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $content = $content -replace '\.\./\.\./\.\./lib/', '../../lib/'
    Set-Content -Path $_.FullName -Value $content -NoNewline
}
Write-Host "Fixed moderation command imports"
