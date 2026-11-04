import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { HouseholdProvider } from "@/contexts/HouseholdContext";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f97316",
};

export const metadata: Metadata = {
  title: "CheckTuYen - เช็คตู้เย็น จัดการวัตถุดิบและลดขยะอาหาร",
  description: "ระบบจัดการตู้เย็นและวัตถุดิบสำหรับครอบครัว ลดขยะอาหาร สแกนใบเสร็จด้วย AI และสุ่มเมนูอาหาร",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai+Looped:wght@300;400;500;600;700&family=Mitr:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased selection:bg-orange-500/20 selection:text-orange-900">
        <QueryProvider>
          <ThemeProvider>
            <HouseholdProvider>
              {children}
              <Toaster position="top-right" />
            </HouseholdProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
