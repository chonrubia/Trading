export const metadata = { title: "Trading Floor · Money Beast", description: "Fondo paper con agentes IA" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#070906", color: "#e9f2e4", fontFamily: "Inter,system-ui,Arial" }}>{children}</body>
    </html>
  );
}
