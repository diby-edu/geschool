# Crée les clés des notifications sur téléphone (Web Push, « VAPID ») DIRECTEMENT
# sur le serveur, les range dans sa configuration et redémarre l'application.
# Les clés ne passent jamais par ce poste ni par une conversation.
#
#   powershell -ExecutionPolicy Bypass -File scripts\notifications-cles.ps1
#
# Sans effet si les clés existent déjà (les changer couperait les téléphones
# déjà abonnés : chacun devrait réactiver ses notifications).

$bash = @'
#!/bin/bash
set -e
E=/var/www/geschool/shared/.env.local
if grep -q '^VAPID_PRIVATE_KEY=.' "$E"; then
  echo "Les cles des notifications existent deja : rien a faire."
  exit 0
fi
cd /var/www/geschool/current
GEN="const w=require('web-push');const k=w.generateVAPIDKeys();console.log('VAPID_PUBLIC_KEY='+k.publicKey);console.log('VAPID_PRIVATE_KEY='+k.privateKey)"
KEYS=$(node -e "$GEN" 2>/dev/null || (cd /tmp && npm install --silent --no-save web-push@3.6.7 >/dev/null 2>&1 && node -e "$GEN"))
case "$KEYS" in
  *VAPID_PRIVATE_KEY=*) ;;
  *) echo "Creation des cles impossible."; exit 1 ;;
esac
cp -p "$E" "$E.sauvegarde-vapid"
sed -i '/^VAPID_PUBLIC_KEY=/d;/^VAPID_PRIVATE_KEY=/d' "$E"
[ -n "$(tail -c1 "$E")" ] && echo >> "$E"
printf '%s\n' "$KEYS" >> "$E"
pm2 restart geschool geschool-worker --update-env >/dev/null
echo "Cles des notifications creees et enregistrees ; application redemarree."
grep -o '^VAPID_[A-Z_]*=' "$E"
'@

$tmp = Join-Path $env:TEMP ('vapid-' + [guid]::NewGuid().ToString() + '.sh')
try {
  [IO.File]::WriteAllText($tmp, ($bash -replace "`r", ''), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Envoi au serveur..."
  scp -q $tmp root@72.62.148.170:/root/vapid-setup.sh
  ssh root@72.62.148.170 "bash /root/vapid-setup.sh; rm -f /root/vapid-setup.sh"
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
