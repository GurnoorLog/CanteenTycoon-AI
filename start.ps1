Write-Host "=== CanteenTycoon -- Starting Servers ===" -ForegroundColor Cyan
Write-Host "ML API  : http://localhost:5000 (Flask + LightGBM)" -ForegroundColor Green
Write-Host "App     : http://localhost:8080 (Static + Proxy)" -ForegroundColor Green
Write-Host ""

$ml = Start-Process -PassThru -FilePath python -ArgumentList "app.py" -WindowStyle Hidden
$web = Start-Process -PassThru -FilePath python -ArgumentList "server.py" -WindowStyle Hidden

Write-Host "ML API PID: $($ml.Id)" -ForegroundColor Yellow
Write-Host "Web  PID: $($web.Id)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to stop both servers..." -ForegroundColor Magenta
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Stop-Process -Id $ml.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $web.Id -Force -ErrorAction SilentlyContinue
Write-Host "Servers stopped." -ForegroundColor Cyan
