# Builds the Windows installer and signs it with the Certum Open Source Code Signing certificate
# (SimplySign, cloud). Run on your own PC: `npm run release`.
#
# Before running: start SimplySign Desktop and log in with the code from the SimplySign mobile app.
# The certificate then shows up in Windows' certificate store (Current User > Personal), and
# electron-builder signs, with SHA-256 and a Certum timestamp, every file Smart App Control checks:
# the app exe, its dll files, the uninstaller and the installer.
#
#   -Thumbprint <sha1>   use this certificate instead of looking for "Open Source Developer"
param([string]$Thumbprint)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# 1. the signing certificate (valid, for code signing, with its key available)
if (-not $Thumbprint) {
  $now = Get-Date
  $certs = @(Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
    Where-Object { $_.Subject -like '*Open Source Developer*' -and $_.NotBefore -le $now -and $_.NotAfter -gt $now -and $_.HasPrivateKey })
  if ($certs.Count -eq 0) {
    Write-Host '서명용 인증서를 찾지 못했어요.' -ForegroundColor Red
    Write-Host 'SimplySign Desktop을 켜고 휴대폰 앱의 코드로 로그인했는지 확인해 주세요.'
    exit 1
  }
  if ($certs.Count -gt 1) {
    Write-Host '인증서가 여러 개 있어요. -Thumbprint 로 하나를 골라 주세요:' -ForegroundColor Yellow
    $certs | ForEach-Object { Write-Host "  $($_.Thumbprint)  $($_.Subject)  ~$($_.NotAfter.ToString('yyyy-MM-dd'))" }
    exit 1
  }
  $Thumbprint = $certs[0].Thumbprint
}
$cert = Get-Item "Cert:\CurrentUser\My\$Thumbprint"
Write-Host "인증서: $($cert.Subject)  (만료 $($cert.NotAfter.ToString('yyyy-MM-dd')))"

# 2. build and sign
if (Test-Path dist) { Remove-Item -Recurse -Force dist }
npx electron-builder --win nsis --publish never "-c.win.signtoolOptions.certificateSha1=$Thumbprint"
if ($LASTEXITCODE -ne 0) { Write-Host '빌드 또는 서명에 실패했어요.' -ForegroundColor Red; exit 1 }

# 3. check every exe / dll that ships, and the installer
$files = @(Get-ChildItem dist\win-unpacked -Recurse -Include *.exe, *.dll) + @(Get-ChildItem dist\FoxPet-Setup-*.exe)
$bad = @($files | Where-Object { (Get-AuthenticodeSignature $_.FullName).Status -ne 'Valid' })
if ($bad.Count) {
  Write-Host '서명이 안 된 파일이 있어요:' -ForegroundColor Red
  $bad | ForEach-Object { Write-Host "  $($_.FullName)" }
  exit 1
}
$setup = Get-ChildItem dist\FoxPet-Setup-*.exe | Select-Object -First 1
Write-Host "완료: 파일 $($files.Count)개 모두 서명됨" -ForegroundColor Green
Write-Host "설치 파일: $($setup.FullName)"
