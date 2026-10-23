import "./globals.css";
import { Plus_Jakarta_Sans, Space_Mono } from "next/font/google";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

export const metadata = {
  title: "Facebook Ad Manager",
  description:
    "Internal operations and database management for Toosio and Team",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      // Inject both font variables into the HTML class
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
