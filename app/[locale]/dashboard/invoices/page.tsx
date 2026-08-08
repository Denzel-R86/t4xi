import type { Metadata } from "next";
import InvoiceOperations from "@/components/dashboard/InvoiceOperations";

export const metadata: Metadata = {
  title: "Facturatiebeheer",
  robots: { index: false, follow: false },
};

export default function InvoiceOperationsPage() {
  return <InvoiceOperations />;
}
