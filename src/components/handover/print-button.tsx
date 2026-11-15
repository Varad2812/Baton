"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser print dialog; print CSS turns the page into a clean document (Save as PDF). */
export function PrintButton() {
  return (
    <Button variant="outline" size="sm" data-print-hide onClick={() => window.print()}>
      <Download className="size-3.5" />
      Download PDF
    </Button>
  );
}
