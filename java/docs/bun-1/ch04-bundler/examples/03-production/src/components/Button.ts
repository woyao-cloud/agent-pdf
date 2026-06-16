import type { ButtonVariant, ButtonSize } from "../types";

export interface ButtonProps {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: () => void;
}

export function Button(props: ButtonProps): string {
  const { label, variant = "primary", size = "medium", disabled = false } = props;
  const classes = [
    "btn",
    `btn--${variant}`,
    `btn--${size}`,
    disabled ? "btn--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<button class="${classes}" ${disabled ? "disabled" : ""}>${label}</button>`;
}
