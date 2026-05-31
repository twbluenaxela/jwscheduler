import "./globals.css";
import { AuthProvider } from "./lib/auth-context";

export const metadata = {
  title: "聚會安排",
  description: "JW 會眾聚會編排系統",
  icons: {
    icon: "/jwschedulerlogo.png",
    apple: "/jwschedulerlogo.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
