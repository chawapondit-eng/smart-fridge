'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';

export default function InsightsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/household');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 p-4">
      <div className="flex flex-col items-center gap-3 text-center p-6 rounded-3xl bg-white dark:bg-card border border-border shadow-md max-w-sm">
        <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center animate-bounce">
          <Users className="w-6 h-6" />
        </div>
        <h2 className="font-heading font-bold text-base text-foreground">
          กำลังนำคุณไปยังหน้า จัดการคนภายในบ้าน
        </h2>
        <p className="text-xs text-muted">
          ระบบจัดการคนในบ้านและแชร์รหัสครัวเรือน...
        </p>
      </div>
    </div>
  );
}
