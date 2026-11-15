import type { Metadata } from "next";
import { CinemaApp } from "../CinemaApp";

export const metadata: Metadata = { title: "Payment reliability lab" };

export default function PaymentLabPage() {
  return <CinemaApp initialView="payment-lab" />;
}
