export default function StudioRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
