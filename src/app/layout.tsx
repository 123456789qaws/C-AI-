import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
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
    <html lang="zh-CN">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
