import './global.css';


export const metadata = {
  title: 'Staff House App',
  description: 'App description',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}