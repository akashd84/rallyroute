# Frontend design-system implementation policy

This is RallyRoute's implementation contract for new and changed frontend work. Preserve working architecture and dependencies; adoption is incremental, not a screen redesign. Use pnpm. Read this policy alongside `AGENTS.md` and the installed Next.js guides before implementation.

## Design authority and scope

FigJam defines journeys, flows, decisions, screens, states, and overlays. Figma defines visual layout, hierarchy, spacing, typography, component appearance, and specified responsive behavior. This document defines technical conventions, component selection, and icon semantics. Surface ambiguities that materially affect user behavior rather than inventing major workflows.

Stable UX IDs such as `HOME-01`, `GRP-01`, `GRP-02`, `GRP-02-O1`, `GRP-03`, and `EVT-01` belong in comments, implementation documentation, PR descriptions, or tests where useful. They should not normally appear in user-facing UI or serve as database keys or domain identifiers.

Frontend policy work must not change Supabase schema, migrations, RLS, authentication architecture, event modeling, matching, Valhalla, or routing-provider architecture. If such a change becomes necessary, stop and explain the conflict first.

## Repository baseline

Inspected on 2026-10-06: `package.json`, both documents in `pnpm-lock.yaml` (package-manager bootstrap and application dependencies), `pnpm-workspace.yaml`, component and route directories, global CSS, PostCSS, TypeScript and ESLint configuration, shared workflow forms, and event time/recurrence utilities. Update this inventory when the stack intentionally changes.

| Concern | Current implementation and adoption rule |
| --- | --- |
| Framework | Next.js 16.3.8 App Router, React 19.2.8, TypeScript; Server Components and Server Actions. |
| UI primitives | Native HTML controls and existing RallyRoute components. Despite the intended shadcn/ui stack in `AGENTS.md`, neither `src/components/ui`, `components/ui`, nor `components.json` exists. No shadcn/Radix primitive setup is installed. shadcn/ui is the preferred future primitive foundation; configure it when an approved feature first needs it. |
| Icons | `lucide-react` 1.52.0 added by this policy task; shell icons use named imports. No competing icon dependency found. |
| Forms | Native forms/FormData, React state/transitions, Server Actions, and `src/components/workflow-form.tsx`, composed by existing feature forms. No React Hook Form or other form library installed. |
| Validation | Zod 4, including server/domain validation. Continue this approach. |
| Feedback/toasts | Inline `role="status"`/`role="alert"` feedback and pending controls. No toast library or global toaster installed. |
| Dialogs/drawers | Native `window.confirm` for existing confirmations; no custom dialog, drawer, sheet, or popover framework installed. Preserve these until approved UX calls for an appropriate primitive. |
| Dates | `@js-temporal/polyfill` for timezone-aware conversion and arithmetic; `rrule` for RFC 5545 recurrence; native Date/Intl for parsing and formatting. Reuse `src/lib/events/time.ts` and recurrence utilities. These responsibilities are complementary, not duplicate date systems. |
| Styling | Tailwind CSS 4 through `@tailwindcss/postcss`; CSS-first `src/app/globals.css`, no separate Tailwind config. Existing semantic tokens are `background` and `foreground`, with system dark-mode values. Font tokens reference Geist/Geist Mono from the root layout; body CSS currently uses Arial/Helvetica. |
| Utilities | `@/*` resolves to `src/*`. No `cn`, clsx, tailwind-merge, or class-variance-authority setup. Do not add utilities without a concrete need. |
| Shell | Reusable components in `src/components/shell`, viewport-fit cover, dynamic viewport minimum height, safe-area spacing, and persistent navigation. |

No duplicate UI, icon, form, toast, validation, or modal libraries were found. Existing implementation gaps are the absent shadcn setup, raw color utilities in feature screens, and the font-token/body-font mismatch. Preserve these screens; resolve gaps deliberately during approved frontend work. Do not automatically initialize shadcn, change fonts, or recolor the application as part of policy adoption.

Dependency inspection also reported a pre-existing Vitest 5 peer mismatch: installed `@types/node` 20.19.43 versus Vitest's `^22.0.0 || >=24.0.0` requirement. Treat runtime/type-version alignment as separate maintenance; do not change it silently for UI work.

FullCalendar React 7.1.1 provides the standard MIT Month, Week, Day, and Agenda calendar views, navigation, overflow, and range loading. Its required `temporal-polyfill` 1.0.1 dependency is pinned alongside it. Existing RallyRoute date utilities remain authoritative for domain validation and recurrence; this addition does not replace them. Calendar styling uses bundled classic styling with scoped RallyRoute adjustments.

## Component and dependency selection

Use this order of preference:

1. Existing RallyRoute component.
2. Existing shadcn/ui component.
3. Existing project dependency.
4. Native HTML/browser capability.
5. Focused, well-supported specialized dependency.
6. Custom implementation.

Before any installation, check repository components, shadcn primitives, current dependencies, and native browser capabilities. Add a standard shadcn component only when needed and absent; reuse it thereafter. Do not create custom buttons, inputs, dialogs, drawers, sheets, menus, selects, tabs, avatars, tooltips, toasts, checkboxes, radio groups, or switches when a suitable existing primitive is available. Prefer composition over large component frameworks.

For a necessary dependency, explain the concrete need, prefer an actively maintained focused package compatible with the installed Next.js/React stack, and use pnpm. Avoid large packages for trivial problems and competing icon, date, toast, form, validation, or modal systems. Do not remove working dependencies merely to conform to this policy.

shadcn initialization is a deliberate follow-up: inspect the then-current [official installation instructions](https://ui.shadcn.com/docs/installation/manual) and [Tailwind 4 guidance](https://ui.shadcn.com/docs/tailwind-v4), preserve existing CSS/theme behavior, and add only primitives needed by the approved feature. Do not install a second primitive family or a toast/form stack speculatively.

## Canonical icons

Use Lucide for application UI icons. Prefer named imports, Tailwind sizing, and inherited currentColor. Do not import the whole library, use emoji/Unicode symbols, introduce Font Awesome/Material Icons/Heroicons, or manually draw SVG icons when a suitable Lucide icon exists. This does not prohibit approved brand artwork.

```tsx
import { Car, Settings } from "lucide-react";

<span className="inline-flex items-center gap-2">
  <Car className="size-5" aria-hidden="true" />
  Can drive
</span>

<button type="button" aria-label="Group settings"
  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded focus-visible:outline-2">
  <Settings className="size-5" aria-hidden="true" />
</button>
```

When a project Button primitive exists, use it instead of recreating the native button above. See the [official Lucide React guide](https://lucide.dev/guide/react/) for library usage.

| Concept | Lucide icon |
| --- | --- |
| Home | House |
| Groups | Users |
| Events / Calendar | CalendarDays |
| Location | MapPin |
| Driving / Driver | Car |
| Riders / People | UsersRound |
| Time | Clock |
| Messages | MessageSquare |
| Notifications | Bell |
| Settings | Settings |
| Recurring event settings | Repeat2 |
| Profile / Person | User |
| Add | Plus |
| Edit | Pencil |
| Delete | Trash2 |
| Back | ChevronLeft |
| Forward | ChevronRight |
| More actions | Ellipsis |
| Confirmed / Complete | CircleCheck |
| Warning | TriangleAlert |
| Needs attention / Unmatched | CircleAlert |
| Search | Search |
| Close | X |

Keep semantics consistent across screens. Approved UX may choose a substantially clearer Lucide icon; update this table when the mapping intentionally changes.

Pair meaningful icons with text where appropriate (for example, “Can drive” or “Needs ride”). Never rely on icons or color alone for important status. Put accessible names on icon-only controls. Decorative icons generally use `aria-hidden="true"` without redundant accessible text. Mobile controls should generally provide at least a 44×44 CSS-pixel interactive target.

## Styling, mobile web, and PWA readiness

Use Tailwind and existing semantic tokens. Prefer a token or standard utility to arbitrary values; avoid repeated hard-coded hex colors. Extend semantic tokens intentionally when approved designs require them, rather than scattering feature colors. Do not introduce CSS-in-JS or a second styling framework. Limited custom CSS is acceptable where Tailwind is unsuitable; safe-area calculations are intentional exceptions to avoiding arbitrary values.

Do not add gradients, shadows, animations, decorative cards, glass effects, or visual flourishes without approved design support.

Start with mobile layouts around 375–430px; features must also remain usable around 320px unless product requirements explicitly say otherwise. Adapt to tablet, desktop, and installed PWA use with sensible content widths and responsive composition rather than stretching mobile screens.

Respect relevant top, bottom, and horizontal `env(safe-area-inset-*)` values. Do not assume browser chrome is visible, use brittle fixed `100vh` layouts, or hide controls behind fixed/sticky navigation. Prefer normal document scrolling and modern dynamic viewport behavior; avoid unnecessary nested scroll containers.

## Component boundaries and forms

Use these responsibilities under `src/components` as needed; do not create empty folders or move working code just to match the diagram:

```text
ui/             generic shadcn/UI primitives
shell/          application framing and navigation
groups/        group components
events/        event components
participation/ participation components
carpools/      carpool components
shared/         reusable components with the same meaning across domains
```

Keep `ui` and shell components domain-neutral. Compose stable primitives into feature components, such as `events/event-action-button.tsx`; never add event logic to `ui/button.tsx`. Two usages alone do not justify a shared component when the domain concepts differ. Existing colocated forms remain valid.

Use Server Components by default. Add `"use client"` only for state, effects, browser APIs, event handling, or client-only libraries. Keep the client boundary as small as practical; one interactive child does not require a client-side page/tree.

Preserve the current native-form/Server Action architecture. Do not introduce another form library. If React Hook Form is intentionally adopted later, reuse it consistently where appropriate alongside Zod. Separate UI state, validation, server/domain validation, and persistence. Client validation never replaces server validation for integrity or authorization.

Presentation displays domain results; application/domain services determine them. A participation component may display a match but must not implement matching; an event component may display status but must not decide whether trip legs should be generated. Preserve the presentation → application/domain logic → data/services boundary.

## Overlays, states, and feedback

Approved UX determines screens versus Dialog, Drawer, Sheet, or Popover overlays. Use appropriate existing primitives; do not create a custom overlay framework. An overlay ID such as `GRP-02-O1` does not automatically require a route. Conversely, do not force a complex workflow into an overlay when the UX specifies a dedicated screen.

State IDs such as `EVT-03-S1` do not automatically require separate routes/components. Prefer a screen rendering its appropriate state where practical, separating persistent domain state from temporary presentation state.

Every data-driven feature should consider loading, empty, success, recoverable error, and unrecoverable error. Implement only needed states, with useful recovery and pending behavior. Use skeletons only where they improve loading behavior; never substitute fake production data for an empty state. Reuse inline feedback until an approved need warrants one canonical toast system.

## Accessibility and completion checks

Use semantic HTML, native controls where appropriate, associated input labels, accessible names, keyboard navigation, visible focus, sufficient contrast, mobile touch targets, and reduced-motion support when relevant. Essential information must not depend solely on color, hover, icons, or animation.

Before finishing frontend work:

- Check component reuse, dependency necessity, domain boundaries, and canonical Lucide semantics/accessibility.
- Verify mobile usability (including 320px), the 375–430px design range, desktop composition, safe areas, and unobscured navigation/content.
- Verify keyboard operation, focus visibility, contrast, and relevant loading/empty/error/pending states.
- Generate route types when needed with `pnpm exec next typegen`; run `pnpm exec tsc --noEmit` and `pnpm lint`.
- Run relevant existing tests and `pnpm build` when practical; follow `AGENTS.md` for linked database checks. Use existing browser tests for changed interactive behavior rather than tests that merely mirror implementation.
- Report validation limits and pre-existing failures separately. Do not silently fix unrelated issues or claim mock-provider tests establish live Supabase authorization.
