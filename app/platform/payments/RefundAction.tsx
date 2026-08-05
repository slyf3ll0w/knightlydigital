"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import RefundDialog from "@/components/RefundDialog";

/**
 * Refund button for a row on the Payments dashboard. The rows are <Link>s to
 * the invoice, so the trigger swallows the click before it becomes navigation
 * (the dialog itself portals out and does the same).
 */
export default function RefundAction({
  paymentId,
  amount,
}: {
  paymentId: string;
  amount: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="Refund payment"
        className="rounded-full p-1.5 text-gray-400 hover:text-amber-600"
      >
        <Undo2 size={14} />
      </button>
      <RefundDialog
        paymentId={paymentId}
        maxAmount={amount}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
