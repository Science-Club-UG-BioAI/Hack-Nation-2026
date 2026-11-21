import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KitCheck — sprawdź, na czym stoi teza",
  description:
    "Weryfikacja twierdzeń z dowodami, cytatami i jawnymi ograniczeniami. Prototyp HackNation 2026.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
