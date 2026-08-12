# 2Remit Brand Foundation

This file is the visual source of truth for the 2Remit assessment frontend. The identity should feel secure, international, modern, and operationally clear.

## Logo

| Asset | Use |
| --- | --- |
| `logo.svg` | Primary horizontal logo on light backgrounds |
| `logo-mark.svg` | Compact navigation and mobile headers |
| `logo-white.svg` | Horizontal logo on dark blue or purple backgrounds |
| `favicon.svg` | Browser tab icon only |

- Keep clear space around the logo equal to the height of the arrow head.
- Do not recolour, rotate, stretch, outline, or add effects to the logo.
- Use the horizontal logo at a minimum displayed width of `120px`.
- Use the logo mark at a minimum displayed size of `24px`.

## Colour

### Brand colours

| Token | HEX | Purpose |
| --- | --- | --- |
| Global Blue | `#2563EB` | Primary actions, links, focus and trusted movement |
| Transfer Purple | `#6D4AFF` | Cross-border accents and selected navigation |
| Deep Navy | `#102A43` | Headings, high-emphasis text and dark surfaces |
| Cloud White | `#FAFBFF` | Application background |
| Surface | `#FFFFFF` | Cards, forms and navigation surfaces |
| Border | `#E5EAF2` | Borders and dividers |
| Muted | `#627D98` | Supporting text and metadata |

Use purple as an accent, not as a competing primary action colour. Green is a transaction status colour, not a core brand colour.

### Transfer statuses

| Status | Foreground | Background |
| --- | --- | --- |
| Pending | `#92400E` | `#FEF3C7` |
| Processing | `#1D4ED8` | `#DBEAFE` |
| Completed | `#047857` | `#D1FAE5` |
| Failed | `#B91C1C` | `#FEE2E2` |
| Cancelled | `#475569` | `#E2E8F0` |

Never communicate a transfer state with colour alone. Always include a text label.

## Typography

Use **Manrope** throughout the product. Load it with `next/font/google` and expose it as `--font-manrope`. Use tabular numerals for amounts, references, timestamps and provider identifiers.

| Style | Size / line height | Weight |
| --- | --- | --- |
| Display | `36px / 44px` | 700 |
| Page heading | `30px / 38px` | 700 |
| Section heading | `20px / 28px` | 700 |
| Card heading | `16px / 24px` | 650 |
| Body | `16px / 24px` | 400 |
| Small body | `14px / 20px` | 400 |
| Label | `14px / 20px` | 600 |
| Caption | `12px / 16px` | 500 |

- Use sentence case for headings, navigation and buttons.
- Format amounts with their currency, for example `NGN 250,000.00`.
- Do not use weights below 400 or above 700 in the interface.

## Spacing and layout

Use a `4px` base scale: `4, 8, 12, 16, 24, 32, 40, 48, 64`.

- Page content maximum width: `1280px`.
- Standard page padding: `24px` desktop, `16px` mobile.
- Card padding: `24px` desktop, `16px` mobile.
- Form control height: `44px`.
- Primary button height: `44px`.

## Shape and elevation

| Token | Value | Use |
| --- | --- | --- |
| Small radius | `8px` | Badges and compact controls |
| Medium radius | `12px` | Inputs and buttons |
| Large radius | `16px` | Cards and panels |
| Card shadow | `0 8px 24px rgba(16, 42, 67, 0.08)` | Elevated cards only |

Prefer borders over shadows. Do not use gradients on controls or status badges.

## Components

- Primary button: Global Blue background, white text, medium radius.
- Secondary button: white background, Border outline, Deep Navy text.
- Destructive action: white or pale-red background with red text; never style it as the primary action.
- Inputs: Surface background, Border outline, Deep Navy text and a visible blue focus ring.
- Cards: Surface background, Border outline and large radius.
- Active navigation: pale blue-purple tint with Deep Navy text and a purple indicator.
- Pending transfers expose `Submit` and `Cancel` explicitly.
- Provider `Complete` and `Fail` controls appear only for processing transfers and remain clearly labelled as demo controls.

## Accessibility

- Maintain at least `4.5:1` contrast for normal text and `3:1` for large text and interface boundaries.
- Preserve visible keyboard focus on every interactive element.
- Do not rely on colour, icons, or animation alone to communicate state.
- Respect reduced-motion preferences.
