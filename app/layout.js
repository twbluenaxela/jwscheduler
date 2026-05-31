import "./globals.css";

export const metadata = {
  title: "聚會安排 · 新屋",
  description: "新屋會眾聚會編排系統",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
