# BOUCAN — met en ligne la version du dossier (ou revient à la précédente) dans Docker.
#
#   Double-clic sur « Mettre en ligne.bat » (ou : powershell -File scripts\deploy.ps1)
#   Revenir à la version d'avant : « Revenir a la version precedente.bat » (ou : -Rollback)
#   -Force : ne pas demander confirmation si des joueurs sont connectés.
#
# Ce que fait le script : vérifie Docker, prévient si des parties sont en cours,
# garde l'image actuelle sous le nom boucan:precedente, reconstruit l'image depuis
# les sources de ce dossier, remplace le conteneur boucan-game (même nom, même port)
# et attend que le jeu réponde. Le tunnel Cloudflare n'est jamais touché : il suit
# automatiquement le nouveau conteneur.
param(
  [switch]$Rollback,
  [switch]$Force
)

# Native commands (docker) write progress on stderr: failures are checked with $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) {
  Say ''
  Say "ÉCHEC : $text" 'Red'
  exit 1
}

# ── Docker ───────────────────────────────────────────────────────────────────
$docker = (Get-Command docker -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $docker) {
  foreach ($candidate in @(
      "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe",
      "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe"
    )) {
    if (Test-Path $candidate) { $docker = $candidate; break }
  }
}
if (-not $docker) { Fail "Docker est introuvable. Installe / ouvre Docker Desktop." }
& $docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker Desktop n'est pas démarré. Lance-le, attends qu'il soit prêt, puis recommence." }

# Port publié (BOUCAN_PORT dans .env, 3001 par défaut).
$port = 3001
if (Test-Path "$root\.env") {
  $line = Get-Content "$root\.env" | Where-Object { $_ -match '^\s*BOUCAN_PORT\s*=\s*(\d+)' } | Select-Object -First 1
  if ($line -and $line -match '(\d+)\s*$') { $port = [int]$Matches[1] }
}
$container = 'boucan-game'

# État du jeu lu DANS le conteneur : fiable même si un autre programme de
# l'ordinateur (serveur de dev…) occupe aussi le port.
function Get-Health {
  $json = & $docker exec $container wget -qO- http://127.0.0.1:3001/health 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $json) { return $null }
  try { return ($json -join '') | ConvertFrom-Json } catch { return $null }
}

# ── Parties en cours ? ───────────────────────────────────────────────────────
$before = Get-Health
if ($before -and ($before.rooms -gt 0 -or $before.players -gt 0) -and -not $Force) {
  Say "Attention : $($before.players) joueur(s) dans $($before.rooms) partie(s) en ce moment." 'Yellow'
  Say "La mise à jour redémarre le jeu : ces parties seront coupées." 'Yellow'
  $answer = Read-Host "Continuer quand même ? (o/N)"
  if ($answer -notmatch '^(o|oui|y|yes)$') { Say 'Annulé, rien n''a changé.' 'Cyan'; exit 0 }
}

# ── Image ────────────────────────────────────────────────────────────────────
& $docker image inspect boucan:latest *> $null
$hasCurrent = $LASTEXITCODE -eq 0

if ($Rollback) {
  & $docker image inspect boucan:precedente *> $null
  if ($LASTEXITCODE -ne 0) { Fail "aucune version précédente n'est gardée (il faut avoir mis en ligne au moins une fois avec ce script)." }
  Say 'Retour à la version précédente…' 'Cyan'
  if ($hasCurrent) { & $docker tag boucan:latest boucan:annulee | Out-Null }
  & $docker tag boucan:precedente boucan:latest
  if ($LASTEXITCODE -ne 0) { Fail 'impossible de restaurer l''image précédente.' }
  if ($hasCurrent) { & $docker tag boucan:annulee boucan:precedente | Out-Null; & $docker rmi boucan:annulee *> $null }
} else {
  if ($hasCurrent) {
    & $docker tag boucan:latest boucan:precedente
    Say 'Version actuelle gardée de côté (boucan:precedente).' 'DarkGray'
  }
  Say 'Construction de la nouvelle version (1 à 3 minutes)…' 'Cyan'
  & $docker compose build boucan
  if ($LASTEXITCODE -ne 0) { Fail 'la construction a échoué (voir les messages ci-dessus). Le jeu en ligne n''a pas changé.' }
}

# ── Remplacement du conteneur (le tunnel n'est pas touché) ───────────────────
Say 'Redémarrage du jeu…' 'Cyan'
& $docker compose up -d --no-deps --no-build --force-recreate boucan
if ($LASTEXITCODE -ne 0) { Fail 'le conteneur n''a pas pu démarrer.' }

# ── Vérification ─────────────────────────────────────────────────────────────
$after = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  $h = Get-Health
  if ($h -and $h.status -eq 'ok') { $after = $h; break }
}
if (-not $after) { Fail "le jeu ne répond pas. Voir : docker logs $container" }

Say ''
Say "C'est en ligne ! Serveur $($after.serverVersion), protocole $($after.protocolVersion), $($after.environment)." 'Green'
Say "  Local  : http://localhost:$port" 'Green'
# Un autre programme sur le même port (ex. « npm run dev ») intercepte les visites locales.
$others = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } |
  Where-Object { $_ -and $_.ProcessName -notmatch '^(com\.docker|docker|wslrelay|vpnkit)' } | Select-Object -Unique
foreach ($p in $others) {
  Say "  Attention : le programme « $($p.ProcessName) » (PID $($p.Id)) occupe aussi le port $port sur cet ordinateur." 'Yellow'
  Say "  En local, http://localhost:$port peut afficher ce programme au lieu de la version Docker (le lien public n'est pas concerné)." 'Yellow'
}
$tunnel = & $docker ps --filter 'name=tunnel' --format '{{.Names}}' | Select-Object -First 1
if ($tunnel) {
  $url = & $docker logs $tunnel 2>&1 | Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches |
    ForEach-Object { $_.Matches } | Select-Object -Last 1
  if ($url) { Say "  Public : $($url.Value)" 'Green' }
}
Say "  Revenir à la version d'avant : « Revenir a la version precedente.bat »" 'DarkGray'
exit 0
