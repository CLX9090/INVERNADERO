import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Greenhouse Monitor",
  description: "Monitor de Sensores del Invernadero",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Consolas:wght@400;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  )
}