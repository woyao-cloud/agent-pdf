import type { Theme } from "./types";

const defaultTheme: Theme = {
  primaryColor: "#3b82f6",
  secondaryColor: "#8b5cf6",
  backgroundColor: "#ffffff",
  textColor: "#1f2937",
  borderRadius: 8,
  spacing: 4,
};

export function ThemeProvider(theme: Partial<Theme> = {}): Theme {
  return { ...defaultTheme, ...theme };
}
