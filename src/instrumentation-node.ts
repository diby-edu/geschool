/**
 * Reglage du reseau sortant (vers Supabase surtout), cote Node.js uniquement.
 * Charge par instrumentation.ts ; jamais par la compilation Edge (node:dns, undici).
 *
 * Cause des lenteurs et des « fetch failed » en local (mesuree le 2026-09-21) : la
 * negociation TLS vers Supabase echouait de 10 a 20 % des fois depuis le poste de
 * developpement, alors que TCP s'etablit en 10 ms. Le premier message TLS de Node 24
 * (OpenSSL 3.5) embarque un echange de cles post-quantique (X25519MLKEM768) qui le
 * rend beaucoup plus gros ; certains equipements du chemin reseau (antivirus qui
 * inspecte le HTTPS, box, passerelle NAT64) le laissent sans reponse. En restreignant
 * les courbes aux classiques (X25519, P-256, P-384, toutes admises par Cloudflare/
 * Supabase) : 0 echec sur 240 essais, contre 9 a 16 sur 80 sans ce reglage.
 *
 * Abandon d'une connexion apres 2,5 s au lieu de 10 s, au cas ou une ouverture echouerait
 * quand meme (la reprise de limited-fetch.ts prend le relais).
 *
 * Ordre IPv4 / IPv6 : reglable par NETWORK_IP_ORDER (ipv4first par defaut, ipv6first,
 * verbatim = ordre du systeme). L'autre famille reste toujours en repli : on n'impose
 * jamais une seule famille (un reseau IPv6 seul doit continuer a marcher).
 * Historique du poste de dev (reseau KONO FIBRE) : le 2026-09-21, ~20 % d'echecs en IPv6
 * (NAT64 64:ff9b::/96) contre ~3 % en IPv4 -> ipv4first. Puis, MTU IPv6 du Wi-Fi reduite
 * a 1280 : 0 echec en IPv6 sur ~300 essais, y compris pendant les episodes, tandis que
 * l'IPv4 echoue a chaque episode (25-35 % des connexions neuves), MTU reduite ou non
 * (2026-09-22). Ce poste met donc NETWORK_IP_ORDER=ipv6first dans .env.local. Sans effet
 * sur un serveur sans IPv6 : l'hote Supabase n'a pas d'adresse IPv6 native.
 *
 * NE PAS allonger la duree de conservation des connexions (keepAliveTimeout, 4 s par
 * defaut) : a 30 s, des connexions deja fermees par l'autre extremite etaient reutilisees
 * (`UND_ERR_SOCKET other side closed`, echec immediat). Ouvrir une connexion coute ~50 ms
 * une fois la negociation fiable ; la garder n'apporte rien.
 *
 * A reevaluer si la negociation redevient fiable sans ce reglage (Node/OpenSSL plus
 * recents, autre reseau) : la securite du chiffrement classique reste celle de TLS 1.3.
 */
const IP_ORDERS = ['ipv4first', 'ipv6first', 'verbatim'] as const;
type IpOrder = (typeof IP_ORDERS)[number];

export async function registerNode(): Promise<void> {
  const { setDefaultResultOrder } = await import('node:dns');
  const wanted = process.env.NETWORK_IP_ORDER;
  const order: IpOrder = (IP_ORDERS as readonly string[]).includes(wanted ?? '') ? (wanted as IpOrder) : 'ipv4first';
  setDefaultResultOrder(order);

  const { Agent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new Agent({ connect: { timeout: 2_500, ecdhCurve: 'X25519:prime256v1:secp384r1' } }));
}
