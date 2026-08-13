"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { createTransfer, TransferApiError } from "@/lib/api/transfers";
import { createIdempotencyKey, requestFingerprint } from "@/lib/idempotency";
import type {
  CreateTransferRequest,
  DrfErrorBody,
} from "@/types/create-transfer";
import { ConsoleShell } from "@/components/transfers/console-shell";

import {
  CreateTransferForm,
  type TransferFormErrors,
  type TransferFormValues,
  validateAmount,
  validateRecipientRef,
} from "./create-transfer-form";
import { CreateTransferSuccess } from "./create-transfer-success";
import { TransferReview } from "./transfer-review";

type Step = "details" | "review" | "success";

const INITIAL_VALUES: TransferFormValues = {
  amount: "",
  currency: "NGN",
  recipientRef: "",
};

function toRequest(values: TransferFormValues): CreateTransferRequest | null {
  if (!values.currency) return null;
  return {
    amount: values.amount.trim(),
    currency: values.currency,
    recipient_ref: values.recipientRef,
  };
}

function mapFieldErrors(body: DrfErrorBody): TransferFormErrors {
  return {
    amount: body.amount?.[0],
    currency: body.currency?.[0],
    recipientRef: body.recipient_ref?.[0],
  };
}

export function CreateTransferScreen() {
  const router = useRouter();
  const amountRef = useRef<HTMLInputElement>(null);
  const recipientRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const attemptedFingerprintRef = useRef<string | null>(null);
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState<TransferFormErrors>({});
  const [step, setStep] = useState<Step>("details");
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<{
    message: string;
    conflict?: boolean;
  }>();
  const [createdReference, setCreatedReference] = useState("");
  const progressStep =
    step === "details" ? 0 : step === "success" || submitting ? 2 : 1;

  const changeValues = (nextValues: TransferFormValues) => {
    const request = toRequest(nextValues);
    if (
      request &&
      attemptedFingerprintRef.current &&
      requestFingerprint(request) !== attemptedFingerprintRef.current
    ) {
      setIdempotencyKey(createIdempotencyKey());
      attemptedFingerprintRef.current = null;
      setApiError(undefined);
    }
    setValues(nextValues);
    setErrors({});
  };

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: TransferFormErrors = {
      amount: validateAmount(values.amount),
      currency: values.currency ? undefined : "Select a currency.",
      recipientRef: validateRecipientRef(values.recipientRef),
    };
    setErrors(nextErrors);

    if (nextErrors.amount) amountRef.current?.focus();
    else if (nextErrors.currency) {
      document
        .querySelector<HTMLInputElement>('input[name="currency"]')
        ?.focus();
    } else if (nextErrors.recipientRef) recipientRef.current?.focus();
    else setStep("review");
  };

  const startNewAttempt = () => {
    setIdempotencyKey(createIdempotencyKey());
    attemptedFingerprintRef.current = null;
    setApiError(undefined);
    toast.dismiss();
  };

  const submit = async () => {
    if (submittingRef.current) return;
    const request = toRequest(values);
    if (!request) return;

    submittingRef.current = true;
    attemptedFingerprintRef.current = requestFingerprint(request);
    setSubmitting(true);
    setApiError(undefined);
    toast.dismiss();

    try {
      const transfer = await createTransfer(request, idempotencyKey);
      setCreatedReference(transfer.reference);
      setStep("success");
      toast.success("Transfer created", {
        description: `${transfer.reference} is pending and has not been submitted to the provider.`,
      });
      router.push(
        `/transfers/${encodeURIComponent(transfer.id)}?reference=${encodeURIComponent(transfer.reference)}`,
      );
    } catch (error) {
      if (error instanceof TransferApiError) {
        const fieldErrors = mapFieldErrors(error.body);
        if (Object.values(fieldErrors).some(Boolean)) {
          setErrors(fieldErrors);
          setStep("details");
          queueMicrotask(() => {
            if (fieldErrors.amount) amountRef.current?.focus();
            else if (fieldErrors.currency) {
              document
                .querySelector<HTMLInputElement>('input[name="currency"]')
                ?.focus();
            } else recipientRef.current?.focus();
          });
          toast.error("Check the transfer details", {
            description: "Correct the highlighted fields, then review again.",
          });
        } else {
          const conflict = error.status === 409;
          const message = conflict
            ? "The request changed while using an existing idempotency key."
            : error.message;
          setApiError({
            conflict,
            message,
          });
          toast.error(
            conflict ? "A new attempt is required" : "Creation failed",
            {
              description: message,
              duration: conflict ? Infinity : 8000,
              action: conflict
                ? { label: "Start new attempt", onClick: startNewAttempt }
                : undefined,
            },
          );
        }
      } else {
        const message =
          "The response may be uncertain. Retry safely with the same idempotency key.";
        setApiError({ message });
        toast.error("Connection interrupted", {
          description: message,
          duration: 8000,
        });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ConsoleShell>
      <section className="console-content create-transfer-content">
        <Link href="/transfers" className="back-link">
          <ArrowLeft aria-hidden="true" size={16} weight="bold" />
          Back to transfers
        </Link>
        <div className="create-heading">
          <p className="eyebrow">New payout</p>
          <h1>Create a transfer</h1>
          <p className="supporting-copy">
            Enter the payout details. You can review everything before creating
            it.
          </p>
        </div>

        <div
          className="step-indicator"
          aria-label={`Step ${progressStep + 1} of 3`}
        >
          {(["Details", "Review", "Create"] as const).map((label, index) => (
            <span
              key={label}
              data-active={index === progressStep}
              data-complete={index < progressStep}
              aria-current={index === progressStep ? "step" : undefined}
            >
              <i aria-hidden="true" />
              <b>{label}</b>
            </span>
          ))}
        </div>

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {step === "success"
            ? `Transfer ${createdReference} created successfully.`
            : ""}
        </div>

        {step === "details" ? (
          <CreateTransferForm
            values={values}
            errors={errors}
            amountRef={amountRef}
            recipientRef={recipientRef}
            onChange={changeValues}
            onReview={review}
          />
        ) : null}
        {step === "review" ? (
          <TransferReview
            request={toRequest(values)!}
            submitting={submitting}
            error={apiError}
            onEdit={() => setStep("details")}
            onSubmit={submit}
            onStartNewAttempt={startNewAttempt}
          />
        ) : null}
        {step === "success" ? (
          <CreateTransferSuccess reference={createdReference} />
        ) : null}
      </section>
    </ConsoleShell>
  );
}
