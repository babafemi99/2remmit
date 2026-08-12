import { ArrowRight } from "@phosphor-icons/react";
import type { FormEvent, RefObject } from "react";

import type { TransferCurrency } from "@/types/create-transfer";
import {
  completeAmountPrecision,
  CURRENCY_SYMBOLS,
  formatAmountInput,
  normalizeAmountInput,
} from "@/lib/money";

import { CurrencySelector } from "./currency-selector";
import { FormField } from "./form-field";

export type TransferFormValues = {
  amount: string;
  currency: TransferCurrency | "";
  recipientRef: string;
};

export type TransferFormErrors = Partial<
  Record<keyof TransferFormValues, string>
>;

type CreateTransferFormProps = {
  values: TransferFormValues;
  errors: TransferFormErrors;
  amountRef: RefObject<HTMLInputElement | null>;
  recipientRef: RefObject<HTMLInputElement | null>;
  onChange: (values: TransferFormValues) => void;
  onReview: (event: FormEvent<HTMLFormElement>) => void;
};

export function CreateTransferForm({
  values,
  errors,
  amountRef,
  recipientRef,
  onChange,
  onReview,
}: CreateTransferFormProps) {
  const valid =
    !validateAmount(values.amount) &&
    Boolean(values.currency) &&
    !validateRecipientRef(values.recipientRef);

  return (
    <form className="create-form step-enter" noValidate onSubmit={onReview}>
      <FormField id="amount" label="Amount" error={errors.amount}>
        <div className="amount-input-shell">
          <span className="amount-currency-symbol" aria-hidden="true">
            {values.currency ? CURRENCY_SYMBOLS[values.currency] : "—"}
          </span>
          <input
            ref={amountRef}
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={formatAmountInput(values.amount)}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? "amount-error" : undefined}
            onChange={(event) =>
              onChange({
                ...values,
                amount: normalizeAmountInput(event.target.value),
              })
            }
            onBlur={() => {
              if (!validateAmount(values.amount)) {
                onChange({
                  ...values,
                  amount: completeAmountPrecision(values.amount),
                });
              }
            }}
          />
        </div>
      </FormField>

      <CurrencySelector
        value={values.currency}
        error={errors.currency}
        onChange={(currency) => onChange({ ...values, currency })}
      />

      <FormField
        id="recipient-ref"
        label="Recipient reference"
        hint="The recipient or payout reference, up to 255 characters."
        error={errors.recipientRef}
      >
        <input
          ref={recipientRef}
          id="recipient-ref"
          name="recipient_ref"
          type="text"
          maxLength={255}
          autoComplete="off"
          placeholder="e.g. ACME-SUPPLIER-01"
          value={values.recipientRef}
          aria-invalid={Boolean(errors.recipientRef)}
          aria-describedby={
            errors.recipientRef
              ? "recipient-ref-hint recipient-ref-error"
              : "recipient-ref-hint"
          }
          onChange={(event) =>
            onChange({ ...values, recipientRef: event.target.value })
          }
        />
      </FormField>

      <button
        type="submit"
        className="primary-button review-button"
        disabled={!valid}
      >
        Review transfer
        <ArrowRight aria-hidden="true" size={17} weight="bold" />
      </button>
    </form>
  );
}

export function validateAmount(value: string) {
  const amount = value.trim();
  if (!amount) return "Enter an amount.";
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    return "Enter a valid amount with no more than 2 decimal places.";
  }
  const [whole, fraction = ""] = amount.split(".");
  if (
    whole.replace(/^0+/, "").length > 16 ||
    whole.length + fraction.length > 18
  ) {
    return "Amount is too large.";
  }
  if (!/[1-9]/.test(`${whole}${fraction}`)) {
    return "Amount must be greater than zero.";
  }
  return undefined;
}

export function validateRecipientRef(value: string) {
  if (!value.trim()) return "Enter a recipient reference.";
  if (value.length > 255)
    return "Recipient reference must be 255 characters or fewer.";
  return undefined;
}
