import type { ReactNode } from "react";

type FormFieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function FormField({
  id,
  label,
  hint,
  error,
  children,
}: FormFieldProps) {
  return (
    <div className={`form-field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
