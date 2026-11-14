import type { Metadata, Viewport } from "next";
import { Caveat, Homemade_Apple, Reenie_Beanie } from "next/font/google";
import ContactButton from "@/components/ui/ContactButton";
import ChatBubble from "@/components/ui/ChatBubble";
import "./globals.css";
import "./garden.css";
import "./notebook.css";

// The only three fonts on the site.
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat" });
const reenie = Reenie_Beanie({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-reenie",
});
const apple = Homemade_Apple({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-apple",
});

export const metadata: Metadata = {
  title: "Shahmeer Khan",
  description: "Shahmeer Khan's notebook.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1f2a19",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${caveat.variable} ${reenie.variable} ${apple.variable}`}
    >
      <body>
        {children}
        {/* Always on, every page */}
        <ContactButton />
        <ChatBubble />
      </body>
    </html>
  );
}
