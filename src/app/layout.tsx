import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { AuthProvider } from '@/components/auth/AuthProvider';
import AppNav from '@/components/layout/AppNav';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Luna for C - AI辅助教学平台',
  description: 'Luna for C MVP - AI辅助C语言教学IDE',
  metadataBase: new URL('http://localhost:3000'),
  openGraph: {
    title: 'Luna for C',
    description: 'AI辅助C语言教学IDE',
    locale: 'zh_CN',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-white text-black min-h-[100vh]`}>
        <ThemeProvider>
          <AuthProvider>
            <div className="relative min-h-[100vh]">
              {/* Swiss grid overlay */}
              <div
                className="swiss-grid pointer-events-none absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(0,0,0,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.15) 1px, transparent 1px)',
                  backgroundSize: '48px 48px',
                }}
              />
              <div className="relative z-10">
                <AppNav />
                <main className="min-h-[calc(100vh-3rem)]">{children}</main>
              </div>
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
