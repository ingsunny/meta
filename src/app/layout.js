import "./globals.css";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
});

export const metadata = {
  title: {
    default: "Toosio",
    template: "%s · Toosio",
  },
  description: "Ads, analytics and reporting for every account you run.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-ink-100 text-ink-800">
        {children}
      </body>
    </html>
  );
}
