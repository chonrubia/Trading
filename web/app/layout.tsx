import "./globals.css";

export const metadata = { title: "Trading Floor · Money Beast", description: "Fondo paper con agentes IA" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
