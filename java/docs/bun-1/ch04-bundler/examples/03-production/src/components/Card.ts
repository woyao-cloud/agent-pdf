import type { CardElevation } from "../types";

export interface CardProps {
  title: string;
  content: string;
  elevation?: CardElevation;
  footer?: string;
}

export function Card(props: CardProps): string {
  const { title, content, elevation = "low", footer } = props;
  const elevationClass = `card--elevation-${elevation}`;

  const footerHtml = footer
    ? `<div class="card__footer">${footer}</div>`
    : "";

  return `
<div class="card ${elevationClass}">
  <div class="card__header">
    <h3 class="card__title">${title}</h3>
  </div>
  <div class="card__body">
    <p class="card__content">${content}</p>
  </div>
  ${footerHtml}
</div>`.trim();
}
