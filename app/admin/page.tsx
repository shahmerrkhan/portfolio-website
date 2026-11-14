import type { Metadata } from "next";
import Admin from "@/components/admin/Admin";

// Private page: read the notes people left and decide which ones show in the book.
export const metadata: Metadata = {
  title: "Guestbook notes",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <Admin />;
}
