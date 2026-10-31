# Depose les cles PayDunya sur le serveur, sans les afficher ni les laisser trainer.
#
# Toutes les cles :     powershell -ExecutionPolicy Bypass -File scripts\paydunya-cles.ps1
# Une seule cle :       powershell -ExecutionPolicy Bypass -File scripts\paydunya-cles.ps1 PRIVATE_KEY
#
# Les cles sont ecrites dans un fichier temporaire, envoye par scp, range sur le serveur
# par /root/paydunya-merge.sh (qui l'efface), puis le fichier local est efface.
# Pas de texte passe en ligne de commande : PowerShell y abime guillemets et retours a la ligne.

param([string]$Seulement = '')

$cles = @(
  @{ nom = 'MASTER_KEY';  texte = 'Cle Principale';                  prefixe = '' },
  @{ nom = 'PRIVATE_KEY'; texte = 'Cle Privee (Cles API de Test)';   prefixe = 'test_private_' },
  @{ nom = 'PUBLIC_KEY';  texte = 'Cle Publique (Cles API de Test)'; prefixe = 'test_public_' },
  @{ nom = 'TOKEN';       texte = 'Token (Cles API de Test)';        prefixe = '' }
)

$lignes = New-Object System.Collections.Generic.List[string]
foreach ($c in $cles) {
  if ($Seulement -and $Seulement -ne $c.nom) { continue }
  while ($true) {
    $s = Read-Host ("Collez la " + $c.texte + " puis Entree") -AsSecureString
    $v = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim()
    if ($v.Length -lt 10) { Write-Host "  Cette cle parait vide ou trop courte. Recommencez." -ForegroundColor Red; continue }
    if ($c.prefixe -and -not $v.StartsWith($c.prefixe)) {
      Write-Host ("  Ce n'est pas la bonne cle : la " + $c.texte + " commence par " + $c.prefixe + ". Recommencez.") -ForegroundColor Red
      continue
    }
    if ((-not $c.prefixe) -and ($v.StartsWith('test_') -or $v.StartsWith('live_'))) {
      Write-Host ("  Ce n'est pas la bonne cle : la " + $c.texte + " ne commence pas par test_ ou live_. Recommencez.") -ForegroundColor Red
      continue
    }
    break
  }
  $lignes.Add('PAYDUNYA_' + $c.nom + '=' + $v)
}

$tmp = Join-Path $env:TEMP ('paydunya-' + [guid]::NewGuid().ToString() + '.tmp')
try {
  [IO.File]::WriteAllText($tmp, ($lignes -join [char]10) + [char]10, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Envoi au serveur..."
  scp -q $tmp root@72.62.148.170:/root/paydunya.tmp
  ssh root@72.62.148.170 bash /root/paydunya-merge.sh
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
