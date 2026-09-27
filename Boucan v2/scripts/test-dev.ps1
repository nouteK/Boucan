# BOUCAN — lance la branche dev dans Docker pour l'essayer, À CÔTÉ du jeu en ligne (sans y toucher).
#
#   Double-clic sur « Tester la version dev.bat » (ou : powershell -File scripts\test-dev.ps1)
#     → http://localhost:3002 + un lien public temporaire (https://….trycloudflare.com)
#       pour jouer à plusieurs / sur téléphone.
#   Arrêter : « Arreter la version dev.bat » (ou : -Stop)
#   -Local  : sans lien public.
#   -Branch <nom> : essayer une autre branche que dev.
#
# Conteneurs séparés (projet compose « boucan-test », docker-compose.test.yml) : boucan-test
# (port BOUCAN_TEST_PORT, 3002 par défaut) et boucan-test-tunnel. Le conteneur de
# production boucan-game et son tunnel ne sont jamais touchés. Relancer le script met
# à jour la version de test ; le lien public reste le même tant que le tunnel de test tourne.
param(
  [switch]$Stop,
  [switch]$Local,
  [string]$Branch = 'dev'
)

# Native commands (docker, git) write progress on stderr: failures are checked with $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. "$PSScriptRoot\lib.ps1"

$docker = Find-Docker
$compose = @('compose', '-f', 'docker-compose.test.yml')
$container = 'boucan-test'
$port = [int](Get-EnvValue $root 'BOUCAN_TEST_PORT' 3002)

if ($Stop) {
  & $docker @compose down
  if ($LASTEXITCODE -ne 0) { Fail 'impossible d''arrêter la version de test.' }
  Say 'Version de test arrêtée (le jeu en ligne n''a pas bougé).' 'Cyan'
  exit 0
}

$git = Find-Git
$source = Resolve-Branch $git $Branch
Say "Version à tester : branche $Branch, commit $($source.Sha) « $($source.Subject) »" 'Cyan'
Say 'Construction (1 à 3 minutes)…' 'Cyan'
Build-FromBranch $docker $git $source $Branch 'boucan:test'

Say 'Démarrage de la version de test…' 'Cyan'
if ($Local) {
  & $docker @compose stop tunnel *> $null
  & $docker @compose up -d --no-build boucan
} else {
  & $docker @compose up -d --no-build
}
if ($LASTEXITCODE -ne 0) { Fail 'la version de test n''a pas pu démarrer.' }

$h = Wait-Health $docker $container
if (-not $h) { Fail "la version de test ne répond pas. Voir : docker logs $container" }

Say ''
Say "Version de test prête : branche $Branch @ $($source.Sha) (serveur $($h.serverVersion), protocole $($h.protocolVersion))." 'Green'
Say "  Sur ce PC : http://localhost:$port" 'Green'
if (-not $Local) {
  $url = Get-TunnelUrl $docker 'boucan-test-tunnel' 30
  if ($url) { Say "  Public    : $url   (téléphones, amis — lien temporaire)" 'Green' }
  else { Say "  Lien public pas encore prêt : relancer ce script dans un instant ou voir « docker logs boucan-test-tunnel »." 'Yellow' }
}
Say '  Le jeu en ligne (branche main) n''a pas été touché.' 'DarkGray'
Say '  Arrêter la version de test : « Arreter la version dev.bat »' 'DarkGray'
exit 0
