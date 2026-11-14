import type { Metadata } from "next";
import Lab from "@/components/lab/Lab";

// Approval page. Only the garden sound is left on it; removed once that is picked.
export const metadata: Metadata = {
  title: "Lab",
  robots: { index: false, follow: false },
};

export default function LabPage() {
  return <Lab />;
}
