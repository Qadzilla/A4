# Paige AI Persona + Chat Panel Redesign

## Context

Phase 1 chat is complete and functional. The current chat UI is generic — no AI branding, rounded bubbles, dropdown conversation selector, "Ask A4..." placeholder. The user has designed a new chat panel UI with a branded AI persona named **Paige** and provided:

1. **Paige SVG logo** — a page/document shape with two eyes and a smile (dark mode: `#10B981`, light mode: `#0D9B6A`)
2. **Full HTML/CSS mockup** — detailed chat panel redesign with new layout, typography, message styling, conversation tab bar, and input area

This plan implements the mockup into the existing React codebase, introducing Paige as the AI assistant and completely restyling the chat panel.

---

## Key Design Decisions

### What changes are chat-panel-scoped (NOT global)
- **Fonts**: The mockup uses DM Sans + IBM Plex Mono, but the app uses Plus Jakarta Sans + Droid Sans Mono. **Add the new fonts globally** (they may be useful elsewhere), but only apply them explicitly within the chat panel components.
- **Colors**: The mockup uses `#10B981`/`#0D9B6A` for Paige's emerald. The app's primary is `#4ade80`. **Do NOT change the global primary color.** Instead, use dedicated CSS variables for Paige's color (`--color-paige` / `--color-paige-foreground`) within the chat panel only.
- **Border radius**: The mockup has zero border-radius everywhere (square corners). **Apply only within chat panel** — the rest of the app keeps its existing radius tokens.
- **Scrollbar styling**: The mockup has emerald-on-dark scrollbars. **Apply only within the chat panel's scroll containers.**

### What's new
- `PaigeAvatar` component — renders the SVG at any size, theme-aware
- `UserAvatar` component — square box with "You" text
- Conversation management moves from dropdown to horizontal scrollable tab bar
- Message layout adds avatars (Paige SVG + user initials square)
- Welcome/empty state redesigned with Paige branding and actionable suggestions
- Input placeholder changes from "Ask A4..." to "Ask Paige anything..."
- Disclaimer text below input: "Paige can make mistakes. Verify important financial data."

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/components/canvas/paige-avatar.tsx` | **Create** | Paige SVG avatar component (theme-aware, configurable size) |
| `apps/web/src/components/canvas/chat-panel.tsx` | **Rewrite** | Complete redesign matching the mockup |
| `apps/web/src/components/canvas/chat-message.tsx` | **Modify** | Update styling for new bubble design, keep markdown rendering |
| `apps/web/index.html` | **Modify** | Add DM Sans + IBM Plex Mono Google Font imports |
| `packages/tailwind-config/base.css` | **Modify** | Add Paige color tokens + font family tokens + scrollbar utility |
| `apps/web/src/routes/_dashboard/workspaces/[id]/page.tsx` | **Minor modify** | Update example prompts / pass workspace name for welcome state |
| `apps/server/src/services/ai-context.ts` | **Minor modify** | Rename AI identity from "A4" to "Paige" in system preamble |
| `apps/server/src/__tests__/chat-stream.test.ts` | **Minor modify** | Update mock system prompt to match new "Paige" identity |

---

## Implementation Steps

### Step 1: Add Fonts + Design Tokens

**`apps/web/index.html`** — Add two new Google Font `<link>` tags alongside the existing Plus Jakarta Sans:
```
DM Sans: weights 300,400,500,600,700 (opsz 9..40)
IBM Plex Mono: weights 300,400,500
```

**`packages/tailwind-config/base.css`** — Add tokens:

Light mode (`:root`):
```css
--color-paige: #0D9B6A;
--color-paige-foreground: #ffffff;
--font-display: "DM Sans", "Plus Jakarta Sans", sans-serif;
--font-mono-alt: "IBM Plex Mono", "Droid Sans Mono", monospace;
```

Dark mode (`.dark`):
```css
--color-paige: #10B981;
--color-paige-foreground: #ffffff;
```

Add scoped scrollbar utility:
```css
.chat-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
.chat-scrollbar::-webkit-scrollbar-track { background: var(--color-muted); }
.chat-scrollbar::-webkit-scrollbar-thumb { background: var(--color-paige); }
```

These tokens are used exclusively by the chat panel — they don't affect any existing component.

### Step 2: Create `paige-avatar.tsx`

New file: `apps/web/src/components/canvas/paige-avatar.tsx`

A small, memoized React component that renders Paige's SVG inline.

**Props:**
- `size?: 'sm' | 'md' | 'lg'` — controls dimensions:
  - `sm`: 20×26 (inline in message name area)
  - `md`: 28×36 (message avatar, header avatar)
  - `lg`: 56×72 (welcome state hero)
- `className?: string`

**Behavior:**
- Renders the SVG directly (not an `<img>` — allows CSS color inheritance)
- Uses `currentColor` mapped to `var(--color-paige)` for stroke/fill so it automatically adapts to light/dark mode
- The SVG viewBox is always `0 0 56 72` — scales via width/height attributes
- Structure: ghost L-shaped border (opacity 0.2) + bold reversed-L border + two circle eyes + smile curve

Also export a `UserAvatar` component:
- Square box with `bg-[var(--color-foreground)]/10` background
- Shows "You" text in IBM Plex Mono, 9px, muted
- Size matches Paige avatar (28×28 for `md`)

### Step 3: Rewrite `chat-panel.tsx`

Complete rewrite of the component. Same `ChatPanelProps` interface (no prop changes needed — all data is already available). The internal layout changes completely.

**Layout structure (top to bottom):**

#### 3a. Header
```
┌─────────────────────────────────────┐
│ [PaigeAvatar md] Paige    [⤢] [✕] │
│                  ● Online           │
└─────────────────────────────────────┘
```
- Left: Paige avatar (28×36) + info column (name "Paige" in 14px/600 DM Sans + status "● Online" in 10px IBM Plex Mono, emerald color with pulsing dot)
- Right: Expand button + Close/minimize button (both 32×32, border `border-[color:var(--color-foreground)]/6`, no border-radius)
- Border-bottom: `border-b border-[color:var(--color-foreground)]/6`
- Padding: `px-5 py-4`

#### 3b. Conversation Tab Bar (replaces dropdown)
```
┌─[+]─│─Q4 Invoice Review─│─Subscription Audit─│─Tax Prep─┐
└──────────────────────────────────────────────────────────-─┘
```
- Horizontal scrollable container with `overflow-x-auto`
- First element: `+` button (new conversation) — fixed width, doesn't scroll away
- Divider: 1px vertical line, 20px tall
- Tabs: IBM Plex Mono, 11px, `text-[color:var(--color-foreground)]/40`
- Active tab: emerald text + 2px emerald bottom border + `bg-[color:var(--color-paige)]/6`
- Hover: `text-[color:var(--color-foreground)]/60` + subtle bg
- Each tab shows conversation title (truncated)
- Delete: small `✕` button on hover at the right edge of the active/hovered tab (Option 4 — see decision below)
- Scrollbar: thin, emerald thumb (`.chat-scrollbar` class)
- Border-bottom: same as header

#### 3c. Messages Area
- `flex-1 overflow-y-auto`, padding `24px 20px`, gap `20px` between messages
- Scrollbar: `.chat-scrollbar` class (4px wide, emerald thumb, dark track)
- Each message is a flex row with avatar + content column

**Paige messages:**
```
┌─────────────────────────────────────┐
│ [PaigeAvatar] │ Paige (emerald)    │
│               │ ┌─────────────────┐│
│               │ │ Message bubble  ││
│               │ │ with asymmetric ││
│               │ │ borders         ││
│               │ └─────────────────┘│
│               │ Just now           │
└─────────────────────────────────────┘
```
- Avatar: PaigeAvatar `md` (28×36), `mt-0.5` for alignment
- Name: "Paige" in IBM Plex Mono 10px, emerald, tracking `0.04em`
- Bubble: `bg-[var(--color-foreground)]/[0.04]` (very subtle), asymmetric borders:
  - Top + left: `1px solid rgba(foreground, 0.06)`
  - Bottom + right: `2px solid rgba(paige, 0.10)` — the signature Paige accent
- Text: 13px DM Sans, line-height 1.55, `text-[color:var(--color-foreground)]/80`
- `<strong>`: full foreground color
- `.highlight` spans: emerald color, font-weight 500
- Timestamp: IBM Plex Mono 9px, `text-[color:var(--color-foreground)]/20`, `mt-0.5`

**User messages:**
```
┌─────────────────────────────────────┐
│       You (muted) │ [UserAvatar]   │
│ ┌────────────────┐│                │
│ │ Transparent bg ││                │
│ │ border only    ││                │
│ └────────────────┘│                │
│          Just now │                │
└─────────────────────────────────────┘
```
- `flex-direction: row-reverse`, `align-self: flex-end`
- Avatar: UserAvatar (28×28 square, "You" text)
- Name: "You" in IBM Plex Mono 10px, muted, `text-right`
- Bubble: `bg-transparent`, `border: 1px solid rgba(foreground, 0.10)`, no border-radius
- Text: same 13px DM Sans, `text-[color:var(--color-foreground)]/80`
- Timestamp: same style, right-aligned

**Empty/welcome state:**
```
┌─────────────────────────────────────┐
│ [PaigeAvatar lg] + Welcome message │
│                                     │
│ → Add a checking account...        │
│ → Create a monthly budget...       │
│ → Upload a bank statement...       │
│ → Calculate loan payments          │
└─────────────────────────────────────┘
```
- Rendered as a Paige message (with avatar, name, bubble)
- Inside the bubble: greeting text + suggestion chips
- Suggestion chips: block-level items (not inline pills), `border: 1px solid rgba(foreground, 0.06)`, no border-radius
- Each chip: `→` prefix in IBM Plex Mono emerald at 50% opacity, 12px text
- Hover: `border-color: rgba(paige, 0.15)`, `bg: rgba(paige, 0.06)`, text turns emerald
- Suggestions list: 4 items tailored to workspace state (currently hardcoded):
  1. "Add a checking account with a balance"
  2. "Create a monthly budget for essentials"
  3. "Upload a bank statement or tax document"
  4. "Calculate loan payments"

**Typing indicator:**
- Same position as a Paige message (with avatar)
- 3 dots with staggered bounce animation — keep existing animation but style dots as squares (no border-radius) at `5px` to match the status dot

**Copy button on assistant messages:**
- Keep existing behavior (opacity-0, group-hover:opacity-100)
- Restyle: no border-radius, position top-right of bubble

**Scroll-to-bottom button:**
- Keep functionality, restyle: no border-radius, match chat panel aesthetic

#### 3d. Error Banner
- Keep existing logic and position
- Restyle: no border-radius, match panel colors

#### 3e. Input Area
```
┌─────────────────────────────────────┐
│ ┌─────────────────────────────┬───┐ │
│ │ Ask Paige anything...       │ → │ │
│ └─────────────────────────────┴───┘ │
│   Paige can make mistakes. Verify   │
│       important financial data.     │
└─────────────────────────────────────┘
```
- Outer: `border-t border-[color:var(--color-foreground)]/6`, padding `16px 20px`
- Input row: flex container, `bg-[var(--color-foreground)]/[0.04]`, `border: 1px solid rgba(foreground, 0.06)`, no border-radius
- Input: Keep textarea for Shift+Enter multiline support. Style: DM Sans 13px, no border, `bg-transparent`, placeholder "Ask Paige anything..." in `rgba(foreground, 0.20)`
- Send button: 36×36, `bg-[var(--color-paige)]`, no border-radius, arrow-right icon in dark color. Hover: slightly darker emerald.
- Hint text: IBM Plex Mono 9px, `text-[color:var(--color-foreground)]/20`, centered, `mt-2`
- Focus state: input row border changes to `rgba(paige, 0.15)`

### Step 4: Update `chat-message.tsx`

Minimal changes — the markdown rendering components stay the same. Updates:

1. **Replace** the streaming cursor color from `bg-foreground` to `bg-[var(--color-paige)]`
2. **Skip auto-highlighting for now** — Paige's system prompt can instruct her to use `**$4,200.00**` (bold) for emphasis, which already renders as `font-semibold text-foreground`
3. Keep all existing markdown component overrides — they work well with the new bubble styling

### Step 5: Minor updates to `page.tsx`

- Update `EXAMPLE_PROMPTS` (if they're defined in page.tsx rather than chat-panel.tsx). Currently defined in `chat-panel.tsx` — the prompts will be updated there directly.
- No prop interface changes needed — all existing props are sufficient.

### Step 6: Rename AI identity from "A4" to "Paige"

**`apps/server/src/services/ai-context.ts`** — Update `SYSTEM_PREAMBLE`:
- Change `"You are A4, an AI financial analyst embedded in the user's financial workspace."` → `"You are Paige, an AI financial analyst embedded in the user's financial workspace."`
- The rest of the preamble (capabilities, rules) stays the same — just the name changes.

**`apps/server/src/__tests__/chat-stream.test.ts`** — Update the mock to match:
- Change `buildWorkspaceContext: vi.fn().mockResolvedValue('You are A4, a financial AI assistant.')` → `buildWorkspaceContext: vi.fn().mockResolvedValue('You are Paige, a financial AI assistant.')`

### Step 7: Chat panel custom scrollbar CSS

(Previously Step 6 — renumbered)

---

## What Does NOT Change

- `useChat.ts` hook — no changes to data flow, state, or SSE handling
- `ChatPanelProps` interface — same props, same data contract
- `page.tsx` integration — same prop wiring, same panel toggle logic
- Markdown rendering logic in `chat-message.tsx` — same components map
- Smart auto-scroll behavior — same refs and logic
- Copy button functionality — same clipboard API usage
- Error handling and retry — same logic
- Keyboard shortcuts (Enter/Shift+Enter) — same behavior
- Conversation CRUD (create, select, delete) — same callbacks, different UI presentation

---

## Conversation Delete UX Decision

The old design had delete buttons in the dropdown. The new tab bar design doesn't have room for inline delete buttons on each tab. Options:

1. **Right-click context menu** on tabs with "Delete conversation" option
2. **Long-press** on tab shows delete option (mobile-friendly)
3. **Swipe gesture** (complex, skip for now)
4. **Keep a small ✕ on hover** at the right edge of each tab (simple, familiar)

**Decision: Option 4** — show a small `✕` button on hover at the right edge of the active/hovered tab. This is the most familiar pattern (browser tabs, VS Code tabs). The `✕` is 14px, appears with `opacity-0 group-hover:opacity-100`, positioned inside the tab's right padding.

---

## Verification

After implementation:
1. `pnpm typecheck` — no type errors
2. `pnpm build` — builds successfully
3. **Dark mode**: Open workspace → chat panel → verify all elements use correct dark mode colors (emerald `#10B981`, dark backgrounds, white-alpha text)
4. **Light mode**: Toggle theme → verify Paige uses `#0D9B6A`, backgrounds are light, text is dark-alpha
5. **Welcome state**: Open chat with no conversations → verify Paige avatar, greeting, 4 suggestion chips. Click a chip → sends message.
6. **Conversation tabs**: Create 3+ conversations → verify tabs scroll horizontally, active tab has emerald underline, `+` button works, `✕` appears on hover
7. **Message flow**: Send a message → verify user bubble (transparent, bordered), Paige response (asymmetric border accent), avatars on both sides, timestamps
8. **Streaming**: Verify typing dots appear with Paige avatar, streaming text builds up with emerald cursor
9. **Scrollbar**: Scroll in messages area → verify thin emerald scrollbar
10. **Input**: Verify placeholder text "Ask Paige anything...", emerald send button, hint text below
11. **Existing e2e tests**: `pnpm exec playwright test apps/web/e2e/chat.spec.ts` — all still pass (same data flow, just visual changes)
