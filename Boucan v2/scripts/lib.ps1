# BOUCAN — fonctions communes aux scripts Docker (chargées par deploy.ps1 et test-dev.ps1).
#
# Les images sont construites depuis une BRANCHE git (main = en ligne, dev = à tester),
# jamais depuis les fichiers du dossier : des modifications en cours, non commitées,
# ne partent donc jamais en ligne par accident.

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) {
  Say ''
  Say "ÉCHEC : $text" 'Red'
  exit 1
}

function Find-Tool($name, [string[]]$candidates) {
  $found = (Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  if ($found) { return $found }
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

function Find-Docker {
  $docker = Find-Tool 'docker' @(
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe",
    "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe"
  )
  if (-not $docker) { Fail "Docker est introuvable. Installe / ouvre Docker Desktop." }
  & $docker info *> $null
  if ($LASTEXITCODE -ne 0) { Fail "Docker Desktop n'est pas démarré. Lance-le, attends qu'il soit prêt, puis recommence." }
  return $docker
}

function Find-Git {
  $git = Find-Tool 'git' @("$env:ProgramFiles\Git\cmd\git.exe")
  if (-not $git) { Fail "Git est introuvable (https://git-scm.com/download/win)." }
  return $git
}

# Valeur d'une variable du .env du dossier (ou $default).
function Get-EnvValue($root, $name, $default) {
  if (Test-Path "$root\.env") {
    $line = Get-Content "$root\.env" | Where-Object { $_ -match "^\s*$name\s*=\s*(\S+)" } | Select-Object -First 1
    if ($line -and $line -match '=\s*(\S+)\s*$') { return $Matches[1] }
  }
  return $default
}

# Dernier commit d'une branche : la branche locale, ou celle de GitHub si elle est
# en avance (fusion faite sur le site). Renvoie @{ Ref; Sha; Subject }.
function Resolve-Branch($git, $branch) {
  & $git fetch --quiet origin $branch 2>$null
  $hasLocal = $false
  & $git rev-parse --verify --quiet "refs/heads/$branch" *> $null
  if ($LASTEXITCODE -eq 0) { $hasLocal = $true }
  $hasRemote = $false
  & $git rev-parse --verify --quiet "refs/remotes/origin/$branch" *> $null
  if ($LASTEXITCODE -eq 0) { $hasRemote = $true }

  if (-not $hasLocal -and -not $hasRemote) { Fail "la branche « $branch » n'existe pas." }
  $ref = $branch
  if (-not $hasLocal) {
    $ref = "origin/$branch"
  } elseif ($hasRemote) {
    & $git merge-base --is-ancestor $branch "origin/$branch" *> $null
    if ($LASTEXITCODE -eq 0) { $ref = "origin/$branch" }
  }
  $sha = (& $git rev-parse --short $ref | Out-String).Trim()
  $subject = (& $git log -1 --format=%s $ref | Out-String).Trim()
  return @{ Ref = $ref; Sha = $sha; Subject = $subject }
}

# Construit l'image $tag à partir des fichiers de la branche (git archive), pas du dossier.
function Build-FromBranch($docker, $git, $source, $branch, $tag) {
  # Chemin du projet dans le dépôt (« Boucan v2 »), sans la barre finale. git archive est
  # lancé depuis la racine du dépôt : depuis un sous-dossier, il filtrerait les chemins.
  $prefix = (& $git rev-parse --show-prefix | Out-String).Trim().TrimEnd('/')
  $top = (& $git rev-parse --show-toplevel | Out-String).Trim()
  $treeish = if ($prefix) { "$($source.Ref):$prefix" } else { $source.Ref }
  $work = Join-Path $env:TEMP ("boucan-build-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $work | Out-Null
  try {
    $tar = Join-Path $work 'source.tar'
    $context = Join-Path $work 'source'
    New-Item -ItemType Directory -Path $context | Out-Null
    & $git -C $top archive --format=tar -o $tar $treeish
    if ($LASTEXITCODE -ne 0) { Fail "impossible d'extraire la branche $branch." }
    & "$env:SystemRoot\System32\tar.exe" -xf $tar -C $context
    if ($LASTEXITCODE -ne 0) { Fail "impossible de décompresser la branche $branch." }
    & $docker build -t $tag `
      --label "org.opencontainers.image.revision=$($source.Sha)" `
      --label "boucan.branch=$branch" `
      $context
    if ($LASTEXITCODE -ne 0) { Fail 'la construction a échoué (voir les messages ci-dessus). Rien n''a changé.' }
  } finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  }
}

# « branche @ commit » d'une image construite par Build-FromBranch.
# (Labels read as JSON: Windows PowerShell drops the inner quotes of a Go template argument.)
function Get-ImageVersion($docker, $tag) {
  $json = & $docker image inspect $tag --format '{{json .Config.Labels}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $json) { return $null }
  try { $labels = ($json -join '') | ConvertFrom-Json } catch { return $null }
  if (-not $labels) { return $null }
  $branch = $labels.'boucan.branch'
  $sha = $labels.'org.opencontainers.image.revision'
  if (-not $branch -or -not $sha) { return $null }
  return "$branch @ $sha"
}

# État du jeu lu DANS le conteneur : fiable même si un autre programme de
# l'ordinateur (serveur de dev…) occupe aussi le port.
function Get-Health($docker, $container) {
  $json = & $docker exec $container wget -qO- http://127.0.0.1:3001/health 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $json) { return $null }
  try { return ($json -join '') | ConvertFrom-Json } catch { return $null }
}

function Wait-Health($docker, $container, $seconds = 40) {
  for ($i = 0; $i -lt $seconds; $i++) {
    Start-Sleep -Seconds 1
    $h = Get-Health $docker $container
    if ($h -and $h.status -eq 'ok') { return $h }
  }
  return $null
}

# Adresse publique https://….trycloudflare.com affichée par un conteneur tunnel.
function Get-TunnelUrl($docker, $container, $seconds = 0) {
  for ($i = 0; $i -le $seconds; $i++) {
    $url = & $docker logs $container 2>&1 | Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches |
      ForEach-Object { $_.Matches } | Select-Object -Last 1
    if ($url) { return $url.Value }
    if ($i -lt $seconds) { Start-Sleep -Seconds 1 }
  }
  return $null
}
