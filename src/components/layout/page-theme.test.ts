import { describe, expect, it } from 'vitest';
import { MODULE_STYLE } from '@/lib/modules';
import { pageTheme } from './page-theme';

const base = '/e/mon-ecole';

describe('pageTheme : la couleur d’une page vient de son adresse', () => {
  it('une page de module prend la couleur de son entrée du menu, sous-pages comprises', () => {
    expect(pageTheme(`${base}/students`).style).toBe(MODULE_STYLE.eleves);
    expect(pageTheme(`${base}/students/123`).key).toBe('eleves');
    expect(pageTheme(`${base}/attendance/justificatifs`).key).toBe('presences');
    expect(pageTheme(`${base}/access`).eyebrow).toBe('Gestion des accès');
  });

  it('une page de configuration prend la teinte de sa rubrique de Paramètres', () => {
    const rooms = pageTheme(`${base}/rooms/new`);
    expect(rooms.key).toBe('parametres-pedagogie');
    expect(rooms.eyebrow).toBe('Paramètres · Pédagogie');
    expect(pageTheme(`${base}/academic-years/abc`).key).toBe('parametres-etablissement');
    expect(pageTheme(`${base}/facturation`).key).toBe('parametres-compte');
  });

  it('le tableau de bord et les modules gris gardent le bouton indigo', () => {
    expect(pageTheme(`${base}/dashboard`).brand).toBe(false);
    expect(pageTheme(base).key).toBe('dashboard');
    expect(pageTheme(`${base}/parametres`).brand).toBe(false);
    expect(pageTheme(`${base}/students`).brand).toBe(true);
  });

  it('hors d’un établissement (Super Admin) : indigo, intitulé « Plateforme »', () => {
    expect(pageTheme('/admin/etablissements').eyebrow).toBe('Plateforme');
  });
});
