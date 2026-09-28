# BOUCAN — met en ligne la branche main (ou revient à la version précédente) dans Docker.
#
#   Double-clic sur « Mettre en ligne.bat » (ou : powershell -File scripts\deploy.ps1)
#   Revenir à la version d'avant : « Revenir a la version precedente.bat » (ou : -Rollback)
#   -Force : ne pas demander confirmation si des joueurs sont connectés.
#
# Ce que fait le script : vérifie Docker, prévient si des parties sont en cours,
# garde l'image actuelle sous le nom boucan:precedente, construit la nouvelle image
# depuis la branche git main (la plus récente entre ce PC et GitHub — jamais depuis
# les fichiers du dossier, qui peuvent contenir du travail en cours), remplace le
# conteneur boucan-game (même nom, même port) et attend que le jeu réponde. Le tunnel
# Cloudflare n'est jamais touché : il suit automatiquement le nouveau conteneur.
# Pour essayer la branche dev sans toucher au jeu en ligne : « Tester la version dev.bat ».
param(
  [switch]$Rollback,
  [switch]$Force
)

# Native commands (docker, git) write progress on stderr: failures are checked with $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. "$PSScriptRoot\lib.ps1"

$branch = 'main'
$docker = Find-Docker
# Port publié (BOUCAN_PORT dans .env, 3001 par défaut).
$port = [int](Get-EnvValue $root 'BOUCAN_PORT' 3001)
$container = 'boucan-game'

# ── Parties en cours ? ───────────────────────────────────────────────────────
$before = Get-Health $docker $container
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
  $git = Find-Git
  $source = Resolve-Branch $git $branch
  Say "Version à mettre en ligne : branche $branch, commit $($source.Sha) « $($source.Subject) »" 'Cyan'
  if ($hasCurrent) {
    & $docker tag boucan:latest boucan:precedente
    Say 'Version actuelle gardée de côté (boucan:precedente).' 'DarkGray'
  }
  Say 'Construction de la nouvelle version (1 à 3 minutes)…' 'Cyan'
  Build-FromBranch $docker $git $source $branch 'boucan:latest'
}

# ── Lien public : ALLOWED_ORIGINS doit l'accepter ────────────────────────────
# Le tunnel rapide change d'adresse à chaque redémarrage (Docker Desktop relancé…) : un
# ancien lien exact dans ALLOWED_ORIGINS empêcherait de jouer (la page s'affiche, le
# WebSocket est refusé). Seuls des liens exacts trycloudflare sont remplacés ; un domaine
# ou un motif (https://*.trycloudflare.com) n'est jamais modifié.
# Tunnel de production (projet compose « boucan ») : pas celui de la version de test.
$tunnel = & $docker ps --filter 'label=com.docker.compose.project=boucan' --filter 'label=com.docker.compose.service=tunnel' --format '{{.Names}}' | Select-Object -First 1
$publicUrl = $null
if ($tunnel) { $publicUrl = Get-TunnelUrl $docker $tunnel 20 }
$allowed = Get-EnvValue $root 'ALLOWED_ORIGINS' ''
$originWarning = $false
if ($publicUrl -and -not (Test-OriginAllowed $allowed $publicUrl)) {
  if (Test-OnlyQuickTunnelOrigins $allowed) {
    Set-EnvValue $root 'ALLOWED_ORIGINS' $publicUrl
    Say "ALLOWED_ORIGINS (.env) mis à jour avec le lien actuel du tunnel : $publicUrl" 'DarkGray'
  } else {
    $originWarning = $true
  }
}

# ── Remplacement du conteneur (le tunnel n'est pas touché) ───────────────────
Say 'Redémarrage du jeu…' 'Cyan'
& $docker compose up -d --no-deps --no-build --force-recreate boucan
if ($LASTEXITCODE -ne 0) { Fail 'le conteneur n''a pas pu démarrer.' }

# ── Vérification ─────────────────────────────────────────────────────────────
$after = Wait-Health $docker $container
if (-not $after) { Fail "le jeu ne répond pas. Voir : docker logs $container" }

Say ''
Say "C'est en ligne ! Serveur $($after.serverVersion), protocole $($after.protocolVersion), $($after.environment)." 'Green'
$version = Get-ImageVersion $docker 'boucan:latest'
if ($version) { Say "  Version : $version" 'Green' }
Say "  Local  : http://localhost:$port" 'Green'
# Un autre programme sur le même port (ex. « npm run dev ») intercepte les visites locales.
$others = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } |
  Where-Object { $_ -and $_.ProcessName -notmatch '^(com\.docker|docker|wslrelay|vpnkit)' } | Select-Object -Unique
foreach ($p in $others) {
  Say "  Attention : le programme « $($p.ProcessName) » (PID $($p.Id)) occupe aussi le port $port sur cet ordinateur." 'Yellow'
  Say "  En local, http://localhost:$port peut afficher ce programme au lieu de la version Docker (le lien public n'est pas concerné)." 'Yellow'
}
if ($publicUrl) { Say "  Public : $publicUrl" 'Green' }
if ($originWarning) {
  Say "  Attention : ALLOWED_ORIGINS (.env) n'accepte pas ce lien : la page s'affiche mais on ne peut pas jouer." 'Yellow'
  Say "  Ajouter ce lien à ALLOWED_ORIGINS dans .env, puis relancer « Mettre en ligne.bat »." 'Yellow'
}
Say "  Revenir à la version d'avant : « Revenir a la version precedente.bat »" 'DarkGray'
exit 0
