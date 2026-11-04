'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // ไม่ refetch เมื่อ focus window — ลดการเรียก API ที่ไม่จำเป็น
            refetchOnWindowFocus: false,
            // retry 1 ครั้งก่อน show error
            retry: 1,
            // cache 5 นาที
            staleTime: 5 * 60 * 1000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
