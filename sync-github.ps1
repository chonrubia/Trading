$env:Path = 'C:\Program Files\Git\bin;' + $env:Path
Set-Location 'C:\Users\chonr\desktop\open'
git add -A
$st = git status --porcelain
if (-not $st) { echo 'SIN_CAMBIOS'; exit 0 }
$msg = if ($args[0]) { $args[0] } else { 'auto: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') }
git -c user.name='chonrubia' -c user.email='chonrubia@users.noreply.github.com' commit -m $msg | Select-Object -Last 1
git push origin main 2>&1 | Select-Object -Last 2
