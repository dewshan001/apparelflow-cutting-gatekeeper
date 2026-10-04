import "./globals.css";

export const metadata = {
  title: "ApparelFlow Cutting Gatekeeper",
  description:
    "Cutting Operations & Gatekeeper Verification Terminal for ApparelFlow ERP",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
