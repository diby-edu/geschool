import { Card, CardContent } from '@/components/ui/card';
import type { PermissionGroup } from '@/lib/permissions/catalog';

export type MatrixRole = { id: string; code: string; name: string; short: string; locked: boolean };

/**
 * La vue d'ensemble des droits : tout le monde, tout a la fois.
 *
 * La fiche par fonction repond a « que peut faire le censeur ? ». Celle-ci
 * repond a l'autre question, celle qu'on se pose quand quelque chose cloche :
 * « QUI peut publier les bulletins ? » — et la reponse tient dans une ligne.
 *
 * Chaque case est un bouton : on corrige la ou on a vu l'anomalie, sans
 * rouvrir la fiche. Composant SERVEUR : chaque case est un petit formulaire,
 * rien a hydrater.
 */
export function PermissionMatrix({
  groups,
  roles,
  granted,
  toggle,
  readOnly,
  highlight,
}: {
  groups: PermissionGroup[];
  roles: MatrixRole[];
  /** Code de fonction -> droits qu'elle detient. */
  granted: Map<string, Set<string>>;
  /** Rend le formulaire d'une case ; absent = lecture seule. */
  toggle?: (roleId: string, code: string, grant: boolean, label: string) => React.ReactNode;
  readOnly: boolean;
  /** Droit qui vient d'etre modifie, pour le retrouver des l'ouverture. */
  highlight?: string | undefined;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="text-sm text-[color:var(--muted-foreground)]">
          {readOnly
            ? 'Qui peut faire quoi, d’un seul coup d’œil.'
            : 'Qui peut faire quoi, d’un seul coup d’œil. Cliquez une case pour accorder ou retirer le droit.'}{' '}
          Le <strong>Fondateur</strong> garde tout, en permanence.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-10 border-b px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]"
                  style={{ backgroundColor: 'var(--background)' }}
                >
                  Droit
                </th>
                {roles.map((r) => (
                  <th
                    key={r.id}
                    title={r.name}
                    scope="col"
                    className="border-b px-1 py-2 text-center text-[11px] font-semibold"
                  >
                    {r.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows
                  key={g.id}
                  group={g}
                  roles={roles}
                  granted={granted}
                  toggle={toggle}
                  highlight={highlight}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupRows({
  group,
  roles,
  granted,
  toggle,
  highlight,
}: {
  group: PermissionGroup;
  roles: MatrixRole[];
  granted: Map<string, Set<string>>;
  toggle?: ((roleId: string, code: string, grant: boolean, label: string) => React.ReactNode) | undefined;
  highlight?: string | undefined;
}) {
  return (
    <>
      <tr>
        <th
          colSpan={roles.length + 1}
          scope="colgroup"
          className="sticky left-0 px-2 pb-1 pt-4 text-left text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]"
        >
          {group.label}
        </th>
      </tr>
      {group.items.map((item) => (
        <tr key={item.code} id={`droit-${item.code}`}>
          <th
            scope="row"
            className="sticky left-0 z-10 border-b px-2 py-1.5 text-left font-normal"
            style={{
              backgroundColor: highlight === item.code ? 'var(--color-brand-muted)' : 'var(--background)',
            }}
          >
            <span className="block text-[13px] font-medium leading-tight">{item.label}</span>
            {item.hint ? (
              <span className="block text-[11px] leading-tight text-[color:var(--muted-foreground)]">{item.hint}</span>
            ) : null}
          </th>
          {roles.map((r) => {
            const a = r.locked || (granted.get(r.code)?.has(item.code) ?? false);
            return (
              <td
                key={r.id}
                className="border-b px-1 py-1.5 text-center"
                style={{ backgroundColor: highlight === item.code ? 'var(--color-brand-muted)' : undefined }}
              >
                {r.locked || !toggle ? (
                  <Marque on={a} muet={r.locked} />
                ) : (
                  toggle(r.id, item.code, !a, `${a ? 'Retirer' : 'Accorder'} « ${item.label} » à ${r.name}`)
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

/** Coche ou case vide — jamais un symbole ambigu. */
function Marque({ on, muet }: { on: boolean; muet?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-grid h-5 w-5 place-items-center rounded-md border text-[12px] font-bold"
      style={
        on
          ? {
              backgroundColor: muet ? 'var(--color-warning)' : 'var(--color-success)',
              borderColor: 'transparent',
              color: '#fff',
            }
          : { borderColor: 'var(--border)' }
      }
    >
      {on ? '✓' : ''}
    </span>
  );
}
