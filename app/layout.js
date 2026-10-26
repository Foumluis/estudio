import "./globals.css";

export const metadata = {
  title: "Horas de estudio",
  description: "Registra y sigue las horas de estudio por ramo y por persona.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
