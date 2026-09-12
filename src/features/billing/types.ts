/** Types d'affichage facturation (sans accès base : utilisables en composant). */

export type PlanLimits = { students?: number; users?: number; storageMb?: number; sms?: number };

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  price_amount: number;
  currency: string;
  billing_period: string;
  is_public: boolean;
  is_active: boolean;
  limits: PlanLimits;
};
