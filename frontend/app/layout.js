import "./globals.css";

export const metadata = {
  title: "Sprint Planner",
  description: "2-week sprint planner with Jira ticket import and 4-hour slot planning"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

