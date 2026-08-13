type InlineSpinnerProps = {
  className?: string;
};

export function InlineSpinner({ className = "" }: InlineSpinnerProps) {
  return (
    <span
      className={`transfer-button-loader ${className}`.trim()}
      aria-hidden="true"
    >
      <i />
      <i />
    </span>
  );
}
