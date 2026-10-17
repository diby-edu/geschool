import type { PrintSheet } from '../print-layout';

const DAY_NAME: Record<number, string> = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche' };

/**
 * Une feuille A4 paysage : l'emploi du temps d'une classe ou d'un enseignant,
 * fidèle aux maquettes validées (créneaux en lignes, jours en colonnes, pauses
 * hachurées, volume hebdomadaire en pied de page). Les couleurs restent à
 * l'impression (print-color-adjust).
 */
export function TimetableSheet({ sheet }: { sheet: PrintSheet }) {
  const { layout } = sheet;
  const colors = sheet.colors;
  return (
    <section className="tt-sheet">
      <header className="tt-head">
        <div>
          <h2 className="tt-title">{sheet.title}</h2>
          <p className="tt-sub">{sheet.subtitle}</p>
        </div>
        <div className="tt-right">
          {sheet.right.map((l, i) => (
            <p key={i} className={i === sheet.right.length - 1 ? 'tt-strong' : undefined}>
              {l}
            </p>
          ))}
        </div>
      </header>

      {layout.rows.length === 0 ? (
        <p className="tt-empty">Aucun cours dans l’emploi du temps en service.</p>
      ) : (
        <table className="tt-grid">
          <thead>
            <tr>
              <th className="tt-hour" />
              {layout.days.map((d) => (
                <th key={d}>{DAY_NAME[d] ?? d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {layout.rows.map((r, ri) => (
              <tr key={`${r.start}-${r.end}`} className={r.kind === 'PAUSE' ? 'tt-pause-row' : undefined}>
                <td className="tt-hour">
                  {r.start}
                  <br />
                  {r.end}
                </td>
                {layout.cells[ri]!.map((c, ci) => {
                  if (c.type === 'covered') return null;
                  if (c.type === 'pause') return <td key={ci} className="tt-pause">{c.label}</td>;
                  if (c.type === 'none') return <td key={ci} className="tt-none" />;
                  if (c.type === 'empty') return <td key={ci} />;
                  const col = colors[c.items[0]!.colorKey] ?? { bg: '#f3f4f6', ink: '#1f2937' };
                  return (
                    <td key={ci} rowSpan={c.rowSpan} className="tt-course" style={{ background: col.bg, color: col.ink }}>
                      {c.items.map((it, k) => (
                        <div key={k} className={k > 0 ? 'tt-more' : undefined}>
                          <p className="tt-c-title">{it.title}</p>
                          {it.lines.map((l, j) => (
                            <p key={j} className="tt-c-line">
                              {l}
                            </p>
                          ))}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="tt-foot">
        <p>
          <strong>Volume hebdomadaire :</strong>{' '}
          {layout.volume.map((v) => (
            <span key={v.key} className="tt-vol">
              {v.key} {v.hours} h
            </span>
          ))}
        </p>
        <p className="tt-note">{sheet.colorMeaning} Volume compté en heures de cours : un créneau = 1 h.</p>
      </footer>
    </section>
  );
}

/** Styles des feuilles, à poser une fois sur la page. */
export function TimetableSheetStyles() {
  return (
    <style>{`
      .tt-sheet { background: #fff; color: #111; padding: 14px 16px; border: 1px solid #ddd; border-radius: 8px; font-family: Arial, Helvetica, sans-serif; }
      .tt-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 2.5px solid #0f6b4a; padding-bottom: 6px; margin-bottom: 8px; }
      .tt-title { font-size: 20px; font-weight: 800; color: #0f6b4a; margin: 0; }
      .tt-sub { font-size: 11px; margin: 2px 0 0; }
      .tt-right { text-align: right; font-size: 11px; line-height: 1.35; }
      .tt-right p { margin: 0; }
      .tt-strong { font-weight: 700; }
      .tt-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .tt-grid th { background: #e6efea; font-size: 12px; padding: 4px; border: 1px solid #9ca3af; }
      .tt-grid td { border: 1px solid #9ca3af; text-align: center; vertical-align: middle; padding: 3px; height: 54px; }
      .tt-grid .tt-hour { width: 50px; background: #f3f4f6; font-size: 10px; color: #444; }
      .tt-pause-row td { height: 20px; }
      .tt-pause { font-size: 10px; font-style: italic; color: #555; background: repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 6px, #e5e7eb 6px, #e5e7eb 12px); }
      .tt-none { background: #f9fafb; }
      .tt-c-title { font-weight: 700; font-size: 13px; margin: 0; }
      .tt-c-line { font-size: 10.5px; margin: 0; opacity: .9; }
      .tt-more { border-top: 1px dashed currentColor; margin-top: 2px; padding-top: 2px; }
      .tt-foot { font-size: 10.5px; margin-top: 6px; }
      .tt-foot p { margin: 0; }
      .tt-vol { margin-right: 10px; white-space: nowrap; }
      .tt-note { color: #666; font-size: 9px; margin-top: 2px !important; }
      .tt-empty { padding: 24px; text-align: center; color: #666; }
      @media print {
        body { background: #fff; }
        .app-nav, .app-shell-nav, nav, header.app-header { display: none !important; }
        .no-print { display: none !important; }
        .tt-sheet { border: none; border-radius: 0; padding: 0; break-after: page; page-break-after: always; }
        .tt-sheet:last-child { break-after: auto; page-break-after: auto; }
        .tt-grid td, .tt-grid th, .tt-pause, .tt-course { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @page { size: A4 landscape; margin: 9mm 10mm; }
      }
    `}</style>
  );
}
