import { SimpleSubmit } from '@/components/ui/simple-submit';
import { acknowledgeAction } from '../actions';
import type { PlatformBanner as Banner } from '../inbox';

/** Bandeau orange d'un message « important » de la plateforme (lot 5), jusqu'à « J'ai compris ». */
export function PlatformBanner({ slug, banner }: { slug: string; banner: Banner }) {
  return (
    <div
      className="mb-4 flex flex-wrap items-start gap-3 rounded-2xl border p-4 text-sm"
      style={{
        background: 'color-mix(in oklch, var(--color-warning) 16%, var(--surface))',
        borderColor: 'color-mix(in oklch, var(--color-warning) 45%, var(--surface))',
      }}
    >
      <span aria-hidden>⚠️</span>
      <div className="min-w-0 flex-1">
        <b>De la plateforme · {banner.title}</b>
        {banner.body ? <p className="mt-1 whitespace-pre-line">{banner.body}</p> : null}
      </div>
      <SimpleSubmit action={acknowledgeAction.bind(null, slug, banner.id)} label="J’ai compris" small />
    </div>
  );
}
