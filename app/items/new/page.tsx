import { redirect } from "next/navigation";
import { AddItemForm } from "@/components/add-item-form";
import { getCurrentUser } from "@/lib/auth";

export default async function AddItemPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/items/new")}`);
  }

  return (
    <div className="grid">
      <section className="page-head grid">
        <p className="eyebrow">New Listing</p>
        <h1>Add an Item</h1>
        <p className="subtitle">After creating it, you’ll get a unique item URL and QR code for handoffs.</p>
      </section>
      <AddItemForm />
    </div>
  );
}
