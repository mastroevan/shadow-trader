import './globals.css';

export const metadata = {
  title: 'Shadow Trader',
  description: 'AI-powered market thesis generator',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
