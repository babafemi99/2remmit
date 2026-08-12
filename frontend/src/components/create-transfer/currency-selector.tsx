import { Check } from "@phosphor-icons/react";
import { GB, NG, US } from "country-flag-icons/react/3x2";

import {
  SUPPORTED_CURRENCIES,
  type TransferCurrency,
} from "@/types/create-transfer";

const CURRENCY_NAMES: Record<TransferCurrency, string> = {
  NGN: "Nigerian naira",
  GBP: "British pound",
  USD: "US dollar",
};

const CURRENCY_FLAGS = {
  NGN: NG,
  GBP: GB,
  USD: US,
};

type CurrencySelectorProps = {
  value: TransferCurrency | "";
  error?: string;
  disabled?: boolean;
  onChange: (currency: TransferCurrency) => void;
};

export function CurrencySelector({
  value,
  error,
  disabled,
  onChange,
}: CurrencySelectorProps) {
  return (
    <fieldset
      className={`currency-field${error ? " has-error" : ""}`}
      aria-describedby={error ? "currency-error" : undefined}
      aria-invalid={Boolean(error)}
    >
      <legend>Currency</legend>
      <div className="currency-options">
        {SUPPORTED_CURRENCIES.map((currency) => {
          const Flag = CURRENCY_FLAGS[currency];
          return (
            <label
              className="currency-option"
              data-selected={value === currency}
              key={currency}
            >
              <input
                type="radio"
                name="currency"
                value={currency}
                checked={value === currency}
                disabled={disabled}
                onChange={() => onChange(currency)}
              />
              <span className="currency-identity">
                <span className="currency-flag" aria-hidden="true">
                  <Flag title="" />
                </span>
                <span>
                  <span className="currency-code numeric">{currency}</span>
                  <span className="currency-name">
                    {CURRENCY_NAMES[currency]}
                  </span>
                </span>
              </span>
              <span className="currency-check" aria-hidden="true">
                <Check size={13} weight="bold" />
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p className="field-error" id="currency-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
