export type PaymentLabScenario = "DUPLICATE" | "RESTART" | "LATE";
export type PaymentLabRun = {
  source: "postgresql" | "simulation";
  runId: string;
  scenario: PaymentLabScenario;
  event: {
    id: string;
    providerEventId: string;
    status: string;
    deliveryCount: number;
    attempts: number;
    receivedAt: string;
    processedAt: string | null;
    lastError: string | null;
  };
  booking: { id: string; status: string; expiresAt: string | null };
  seat: { label: string; status: string; ownerBookingId: string | null };
  payments: Array<{
    id: string;
    providerRef: string | null;
    status: string;
    amountCents: number;
  }>;
  competitor: { id: string; status: string } | null;
  checks: Array<{ label: string; passed: boolean; detail: string }>;
};
