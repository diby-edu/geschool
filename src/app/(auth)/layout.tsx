import { publicEnv } from '@/lib/env';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-lg font-semibold tracking-tight">
            {publicEnv.NEXT_PUBLIC_PLATFORM_NAME}
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
