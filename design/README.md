# Sushi Trader — Design Files

Design mockups and engineering handoff for the Sushi Trader app, to evolve alongside the code in this repo.

## What's here

- **`Sushi Trader - App.dc.html`** — the main design. ~29 phone-screen frames laid out on a canvas: Market, Travel, The Hold, Sell (FIFO), Day Ledger, Price Board, Pantry, Your Eateries, Invest/Provisions, a 6-step onboarding tour, toasts, empty/error states, and more. **This is the source of truth for the UI.**
- **`Sushi Trader - Explorations.dc.html`** — earlier visual exploration (reference only).
- **`A - Stat Bar Comparison.dc.html`** — study of the Cash / Cargo / Eateries stat bar (reference only).
- **`PL-Engineering-Handoff.md`** — ⭐ **read this.** Spec for making the profit/loss and day-ledger numbers real in `App.js`. The UI shows P/L, avg cost, and a day ledger that the engine **cannot currently compute** (purchase price is never stored). Tier 1 = add cost basis; Tier 2 = day-ledger feature. Includes exact code patches with line references.
- **`support.js`** — runtime needed to render the `.dc.html` files. Not app code; don't ship it. Only needed if you open the designs in their original tooling.

## How to read the designs

The `.dc.html` files are markup + an inline logic class. You can read them as source directly — the screen markup is plain inline-styled HTML, and each frame is tagged with `data-screen-label="..."`. Search for those labels to find a specific screen.

## Vocabulary (locked in)

- Cargo is measured in **crates** (1 fish = 1 crate = 1 unit of hold capacity). Not "slots" or "items".
- Owned businesses are **Eateries** (not "shops").
- Currency is **mon**.
- Gains render teal/green (↗), losses crimson/red (↘).

## Next step

Apply **Tier 1** of `PL-Engineering-Handoff.md` first — it's ~15 lines and makes the P/L UI honest. Then Tier 2 for the day ledger.
