param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
$taskBuildRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\release\win-unpacked')).Path
if (-not (Test-Path -LiteralPath (Join-Path $taskBuildRoot '메이플로그.exe'))) { throw '먼저 프로그램 빌드가 필요합니다.' }
Add-Type -AssemblyName System.IO.Compression
$taskZipStream = [IO.File]::Open($OutputPath, [IO.FileMode]::CreateNew)
$taskZip = [IO.Compression.ZipArchive]::new($taskZipStream, [IO.Compression.ZipArchiveMode]::Create)
function Add-TextEntry([string]$Name, [string]$Text, [Text.Encoding]$Encoding) {
  $taskEntry = $taskZip.CreateEntry('메이플로그/' + $Name)
  $taskWriter = [IO.StreamWriter]::new($taskEntry.Open(), $Encoding)
  try { $taskWriter.Write($Text) } finally { $taskWriter.Dispose() }
}
try {
  foreach ($taskFile in (Get-ChildItem -LiteralPath $taskBuildRoot -File -Recurse)) {
    $taskRelative = $taskFile.FullName.Substring($taskBuildRoot.Length + 1).Replace('\','/')
    $taskEntry = $taskZip.CreateEntry('메이플로그/' + $taskRelative, [IO.Compression.CompressionLevel]::Fastest)
    $taskEntryStream = $taskEntry.Open(); $taskSource = [IO.File]::OpenRead($taskFile.FullName)
    try { $taskSource.CopyTo($taskEntryStream) } finally { $taskSource.Dispose(); $taskEntryStream.Dispose() }
  }
  Add-TextEntry 'make-shortcut.ps1' @'
param([string]$DesktopDirectory = '', [switch]$Quiet)
$ErrorActionPreference = 'Stop'
try {
$taskExe = Join-Path $PSScriptRoot '메이플로그.exe'
if (-not (Test-Path -LiteralPath $taskExe)) { throw '압축을 모두 풀고 실행해주세요.' }
$taskShell = New-Object -ComObject WScript.Shell
if (-not $DesktopDirectory) { $DesktopDirectory = $taskShell.SpecialFolders.Item('Desktop') }
if (-not (Test-Path -LiteralPath $DesktopDirectory)) { throw '바탕화면 폴더를 찾을 수 없습니다.' }
$taskLink = Join-Path $DesktopDirectory '메이플로그.lnk'
$taskShortcut = $taskShell.CreateShortcut($taskLink)
$taskShortcut.TargetPath = $taskExe
$taskShortcut.WorkingDirectory = $PSScriptRoot
$taskShortcut.IconLocation = $taskExe + ',0'
$taskShortcut.Description = '메이플로그 실행'
$taskShortcut.Save()
if (-not (Test-Path -LiteralPath $taskLink)) { throw '바로가기 저장에 실패했습니다.' }
Write-Host '바탕화면 바로가기를 만들었습니다. 이 프로그램 폴더는 지우거나 옮기지 마세요.'
if (-not $Quiet) { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show("바탕화면에 메이플로그 바로가기를 만들었습니다.`n`n$taskLink", '메이플로그', 'OK', 'Information') | Out-Null }
} catch {
  if (-not $Quiet) { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show("바로가기를 만들지 못했습니다.`n압축을 전부 푼 뒤 다시 실행해주세요.`n`n$($_.Exception.Message)", '메이플로그', 'OK', 'Error') | Out-Null }
  Write-Error $_
  exit 1
}
'@ ([Text.UTF8Encoding]::new($true))
  Add-TextEntry '바로가기 만들기.cmd' "@echo off`r`nsetlocal`r`n`"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`" -NoProfile -ExecutionPolicy Bypass -File `"%~dp0make-shortcut.ps1`" %*`r`nif errorlevel 1 pause`r`n" ([Text.ASCIIEncoding]::new())
  Add-TextEntry '사용 안내.txt' @'
메이플로그 — 설치 없이 사용하기 (Windows 64비트)

1. ZIP 전체를 원하는 폴더에 압축 해제하세요.
2. 메이플로그.exe를 실행하면 바로 사용할 수 있습니다.
3. 바탕화면 바로가기가 필요하면 「바로가기 만들기.cmd」를 실행하세요.
   설치나 관리자 권한은 필요하지 않습니다.

메이플로그.exe만 따로 옮기지 마세요. 함께 들어 있는 파일과 폴더가 모두 필요합니다.
바로가기를 만든 뒤 프로그램 폴더를 옮기면 바로가기를 다시 만들어주세요.
바로가기 이름은 「메이플로그」입니다. 같은 이름의 바로가기가 있으면 이 폴더를 가리키도록 갱신합니다.

이 파일에는 제작자의 개인 기록이나 백업이 들어 있지 않습니다.
기록은 각 Windows 계정의 %APPDATA%\Maplelog에 자동 저장됩니다.
같은 PC·계정의 기존 기록은 유지되며, 처음 사용하는 사람은 빈 기록으로 시작합니다.
기록은 USB 폴더를 따라 이동하지 않습니다. 다른 PC로 기록을 옮기려면 본인의 백업을 사용하세요.

업데이트할 때는 프로그램을 종료하고 기존 프로그램 폴더에 새 파일 전체를 덮어쓰세요.
이 ZIP 파일만 다른 사람에게 전달하면 됩니다.
'@ ([Text.UTF8Encoding]::new($true))
} finally { $taskZip.Dispose(); $taskZipStream.Dispose() }
Get-Item -LiteralPath $OutputPath | Select-Object FullName, Length
