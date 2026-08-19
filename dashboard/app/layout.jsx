import './globals.css';

export const metadata = {
  title: 'Al-Khidmat | Donor Console',
  description: 'Blood donor outreach simulation dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        <header className="border-b border-border bg-surface px-6 py-3 flex items-center gap-3 sticky top-0 z-50">
          <span className="w-2.5 h-2.5 rounded-full bg-blood animate-pulse-slow" />
          <span className="font-semibold tracking-tight text-sm">Al-Khidmat</span>
          <span className="text-slate-500 text-sm">Donor Outreach Console</span>
          <span className="ml-auto text-xs text-slate-600 font-mono">TEST MODE</span>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
