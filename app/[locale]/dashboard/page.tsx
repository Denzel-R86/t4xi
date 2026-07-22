import type { Metadata } from "next";
import AdminDashboard from "@/components/dashboard/AdminDashboard";

export const metadata: Metadata = {
  title: "Beheer Dashboard",
  description: "T4XI beheeromgeving voor boekingen, tarieven, vloot en partners.",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return <AdminDashboard />;
}
