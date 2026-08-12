export function normalizeAmountInput(displayValue: string) {
  const cleaned = displayValue.replaceAll(",", "").replace(/[^\d.]/g, "");
  const dotIndex = cleaned.indexOf(".");

  if (dotIndex === -1) return cleaned.replace(/^0+(?=\d)/, "");

  const whole = cleaned.slice(0, dotIndex).replace(/^0+(?=\d)/, "") || "0";
  const fraction = cleaned
    .slice(dotIndex + 1)
    .replaceAll(".", "")
    .slice(0, 2);
  return `${whole}.${fraction}`;
}

export function formatAmountInput(rawValue: string) {
  if (!rawValue) return "";
  const [whole, fraction] = rawValue.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? groupedWhole : `${groupedWhole}.${fraction}`;
}

export function completeAmountPrecision(rawValue: string) {
  if (!rawValue) return "";
  const [whole, fraction = ""] = rawValue.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function formatMoneyAmount(rawValue: string) {
  return formatAmountInput(completeAmountPrecision(rawValue));
}
import type { TransferCurrency } from "@/types/create-transfer";

export const CURRENCY_SYMBOLS: Record<TransferCurrency, string> = {
  NGN: "₦",
  GBP: "£",
  USD: "$",
};
