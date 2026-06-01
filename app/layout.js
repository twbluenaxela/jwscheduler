import "./globals.css";
import { AuthProvider } from "./lib/auth-context";
import PWARegister from "./components/PWARegister";

export const metadata = {
  title: "聚會安排",
  description: "JW 會眾聚會編排系統",
  applicationName: "聚會安排",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "聚會安排",
  },
  icons: {
    icon: "/jwschedulerlogo.png",
    apple: "/jwschedulerlogo.png",
  },
};

export const viewport = {
  themeColor: "#2f6f8f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <PWARegister />
      </body>
    </html>
  );
}
