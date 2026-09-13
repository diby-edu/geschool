function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

/** Photo si renseignée (URL déjà signée), sinon initiales — même partout où un élève apparaît. */
export function StudentAvatar({ name, photoUrl, size = 9 }: { name: string; photoUrl?: string | null; size?: number }) {
  const px = `${size * 0.25}rem`;
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: px, height: px }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-xs font-semibold"
      style={{ width: px, height: px, backgroundColor: 'var(--color-brand-muted)', color: 'var(--color-brand)' }}
    >
      {initials(name)}
    </span>
  );
}
