/** Theme configuration type */
export interface Theme {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  spacing: number;
}

/** Button variant type */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";

/** Button size type */
export type ButtonSize = "small" | "medium" | "large";

/** Card elevation type */
export type CardElevation = "low" | "medium" | "high";
