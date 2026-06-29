# Sushi Trader — Cost Basis & P/L Engineering Handoff

**Target file:** `SushiTraderMobile/App.js` (React Native, single-file `useState` game state)
**Author:** design → engineering handoff
**Scope:** make the profit/loss and day-ledger numbers in the UI real. They are currently displayed in the mockups but **cannot be computed** by the engine because purchase price is never stored.

---

## Why this is needed (the gap)

| UI promises… | Engine currently has… |
|---|---|
| Hold: "paid 232 · +23 if sold now" | batches are `{ qty, acquiredAtHour }` — **no price paid** |
| Price Board: "avg cost 62 · +22 over cost" | no cost basis anywhere |
| Day Ledger: "trading profit +1,649 · spoilage −189" | **no day-close and no profit tracking at all** (`day` is just `floor(hours/24)`) |

`sell()` computes gross proceeds (`earned`) but never compares them to cost. `buy()` only deducts cash.

## Agreed conventions

- **Cost basis for display = weighted average** across all held batches of a commodity.
- **Realized profit = FIFO** (oldest batch's `pricePaid` is consumed first — matches the existing FIFO sort in `sell()`).
- **Realizable / "if sold now" value** uses the spoilage multiplier already in `getSpoilageMultiplier()` (fresh 1.0 / aging 0.8 / urgent 0.5 / spoiled 0), and `Math.floor(price × multiplier)` per unit — identical to `sell()`.

---

# TIER 1 — Cost basis (small, high payoff)

Adds one field. Unlocks the **Hold's unrealized P/L** and the **Price Board's avg cost** as pure derived math. ~15 lines total.

## 1.1 Data model change

Every inventory batch gains a `pricePaid` (per-unit cost at time of purchase):

```js
// before: { qty, acquiredAtHour }
// after:  { qty, acquiredAtHour, pricePaid }
```

## 1.2 Patch `buy()` (~line 280)

In the batch-creation branch, stamp the current price. Because batches are keyed/merged by `acquiredAtHour === prev.totalHours` and price is fixed per hour at a city, a same-hour merge keeps an identical price — so no weighting is needed on merge.

```js
const currentBatch = newInventory[sushiName].find(
  batch => batch.acquiredAtHour === prev.totalHours
);

if (currentBatch) {
  currentBatch.qty += qty;                 // same hour ⇒ same price, no change needed
} else {
  newInventory[sushiName].push({
    qty: qty,
    acquiredAtHour: prev.totalHours,
    pricePaid: prices[sushiName],          // ← ADD THIS
  });
}
```

> Defensive option: if you ever allow same-hour price changes, store a weighted average on merge:
> `currentBatch.pricePaid = (currentBatch.pricePaid*currentBatch.qty + prices[sushiName]*qty) / (currentBatch.qty + qty);`

## 1.3 Add derived selectors (near the other helpers, ~line 200)

```js
const getBatches = (name) => game.inventory[name] || [];

const getTotalQty = (name) =>
  getBatches(name).reduce((s, b) => s + b.qty, 0);

// weighted-average unit cost (display)
const getAvgCost = (name) => {
  const qty = getTotalQty(name);
  if (qty === 0) return 0;
  const basis = getBatches(name).reduce((s, b) => s + b.qty * b.pricePaid, 0);
  return basis / qty;
};

const getCostBasis = (name) =>
  getBatches(name).reduce((s, b) => s + b.qty * b.pricePaid, 0);

// what you'd actually receive selling everything right now (spoilage applied)
const getRealizableValue = (name) =>
  getBatches(name).reduce((s, b) => {
    const mult = getSpoilageMultiplier(getSpoilageState(b.acquiredAtHour));
    return s + b.qty * Math.floor(prices[name] * mult);
  }, 0);

// unrealized P/L "if sold now"
const getUnrealizedPL = (name) => getRealizableValue(name) - getCostBasis(name);
```

## 1.4 UI wiring

- **The Hold** row per commodity:
  - "est. value" = `getRealizableValue(name)`
  - "paid" = `getCostBasis(name)` (total) — or show `getAvgCost(name)` per unit
  - "+N if sold now" = `getUnrealizedPL(name)` (green ≥ 0, red < 0)
- **Price Board** header: "your avg cost {Math.round(getAvgCost('Maguro'))} mon"; per-city "over cost" = `cityPrice − getAvgCost(name)`.

## 1.5 Tier 1 acceptance criteria

- Buy 4 Maguro @ 58, price rises to 67 → Hold shows paid 232, est. value 255 (1 aging@53 +… per spoilage), P/L = value − 232.
- Selling a batch reduces cost basis proportionally (handled automatically — batches carry their own `pricePaid`).
- A fully-fresh holding sold immediately shows P/L ≈ 0 minus the floor rounding.

---

# TIER 2 — Day ledger (a real feature)

Backs the **Day Summary** screen. Requires accumulating realized profit, spoilage losses, and eatery revenue across a day, then snapshotting + resetting at day rollover.

## 2.0 Prerequisite — eatery revenue needs owned-tier tracking

`game.restaurants` is currently a **count (number)**, not a list of what's owned, so per-day revenue can't be derived. Add an owned list first:

```js
// state: replace `restaurants: 0` with
restaurants: [],   // e.g. [{ tierId: 1, cityIndex: 0 }, ...]
```

Daily eatery revenue = `Σ RESTAURANT_TIERS[r.tierId].dailyRevenue`. (If you keep `restaurants` as a count for now, accrue `count × someFlatRevenue` as a stopgap and flag it.)

## 2.1 New state accumulators (in the `useState` init, ~line 85)

```js
dayTradingProfit: 0,   // realized FIFO profit booked today
daySpoilageLoss: 0,    // cost basis of crates lost to spoilage today
dayEateryRevenue: 0,   // collected eatery income today
dayPortsVisited: 0,    // optional, for "Voyages · N ports"
lastDayLedger: null,   // snapshot consumed by the Day Summary screen
```

## 2.2 Patch `sell()` — book realized profit (~line 337)

Inside the FIFO loop, track the cost of what's sold:

```js
let earned = 0;
let costOfSold = 0;                                   // ← ADD

for (let i = 0; i < itemBatches.length && remaining > 0; i++) {
  const batch = itemBatches[i];
  const state = getSpoilageState(batch.acquiredAtHour);
  const multiplier = getSpoilageMultiplier(state);
  if (multiplier === 0) continue;

  const sellQty = Math.min(remaining, batch.qty);
  const pricePerUnit = Math.floor(prices[sushiName] * multiplier);
  earned += sellQty * pricePerUnit;
  costOfSold += sellQty * batch.pricePaid;            // ← ADD (FIFO cost)

  batch.qty -= sellQty;
  remaining -= sellQty;
}

// in the returned object:
return {
  ...prev,
  cash: prev.cash + earned,
  inventory: newInventory,
  dayTradingProfit: prev.dayTradingProfit + (earned - costOfSold),  // ← ADD
  lastActionTime: Date.now(),
};
```

## 2.3 Track spoilage losses

Spoilage is **computed**, not stored — `ageInventory()` is a no-op. Crates are only physically removed (and thus "lost") in two places. Book the loss at each, valued at **cost basis** (`qty × pricePaid`):

**a) Travel arrival — `calculateSpoilageDuringTravel()` (~line 151).** Accumulate a loss total and return it:

```js
let lostValue = 0;
// ...inside the batch loop, when state === 'spoiled':
spoiledQty += batch.qty;
totalSpoiled += batch.qty;
lostValue += batch.qty * batch.pricePaid;   // ← ADD
// ...
return { spoilage, totalSpoiled, lostValue, newInventory };   // ← add lostValue
```

Then in `updateGameTime()` where the notification is applied (~line 136):

```js
if (spoilage.totalSpoiled > 0) {
  newGame.spoilageNotification = spoilage;
  newGame.inventory = spoilage.newInventory;
  newGame.daySpoilageLoss = (newGame.daySpoilageLoss || 0) + spoilage.lostValue;  // ← ADD
}
```

**b) Manual `discardSpoiled()` (~line 376).** Before filtering out spoiled batches, sum their cost basis into `daySpoilageLoss`.

## 2.4 Eatery revenue accrual

On each day rollover (see 2.5), add one day's revenue:
`dayEateryRevenue += Σ RESTAURANT_TIERS[r.tierId].dailyRevenue` and add the same amount to `cash` (collected income). If you prefer "collect on visit," accrue into a per-eatery pending bucket instead and move it to cash on arrival — but the ledger figure should reflect what was earned that day.

## 2.5 Day rollover — snapshot + reset (in `updateGameTime`, ~line 118)

`day` already recomputes from `totalHours`. Detect the boundary and close the books:

```js
// after newGame.day is computed and spoilage/aging applied:
if (newGame.day > prev.day) {
  // (accrue eatery revenue for the day here, see 2.4)
  newGame.lastDayLedger = {
    day: prev.day,
    tradingProfit: newGame.dayTradingProfit,
    spoilageLoss: newGame.daySpoilageLoss,
    eateryRevenue: newGame.dayEateryRevenue,
    portsVisited: newGame.dayPortsVisited,
    net: newGame.dayTradingProfit + newGame.dayEateryRevenue - newGame.daySpoilageLoss,
    purseEnd: newGame.cash,
  };
  // reset accumulators for the new day
  newGame.dayTradingProfit = 0;
  newGame.daySpoilageLoss = 0;
  newGame.dayEateryRevenue = 0;
  newGame.dayPortsVisited = 0;
}
```

> **Edge case — multiple days in one jump.** Because time advances by real elapsed hours, several days can roll over at once. v1: snapshot once with the accumulated totals (above). If you want per-day granularity later, loop day-by-day.

## 2.6 Day Summary screen mapping

Drive the screen entirely from `game.lastDayLedger`:
- "NET FOR THE DAY" = `net`
- "Trading profit" = `tradingProfit`
- "Eatery revenue · N eateries" = `eateryRevenue`
- "Spoilage losses" = `−spoilageLoss`
- "Voyages · N ports" = `portsVisited`
- "Purse at day's end" = `purseEnd`

These now reconcile by construction: `tradingProfit + eateryRevenue − spoilageLoss === net`, and `net === purseEnd − purseStart`.

## 2.7 Tier 2 acceptance criteria

- Buy low, sail, sell high → "Trading profit" equals `Σ(sale − FIFO cost)` for crates sold that day.
- Lose crates to spoilage in transit → "Spoilage losses" equals their cost basis, and it matches the Spoilage Report total.
- The four ledger line items **sum to the net**, and the net equals the change in purse. (This was the reconciliation bug flagged in the mockups.)
- Owning eateries adds their `dailyRevenue` to both cash and the ledger each day.

---

## Test checklist

- [ ] `pricePaid` present on every batch after `buy()` (including merged same-hour buys).
- [ ] Hold P/L flips green/red correctly as market price crosses avg cost.
- [ ] Price Board avg cost matches weighted average of held batches.
- [ ] Realized profit uses FIFO order (oldest pricePaid consumed first).
- [ ] Spoilage loss booked at travel arrival **and** manual discard, valued at cost basis.
- [ ] Day rollover snapshots `lastDayLedger` and resets accumulators to 0.
- [ ] Ledger line items sum to net; net equals purse delta.
- [ ] Multi-day time jumps don't double-count or drop a day's figures.

## Files / symbols touched

`SushiTraderMobile/App.js`: `useState` init · `updateGameTime` · `calculateSpoilageDuringTravel` · `buy` · `sell` · `discardSpoiled` · new selectors (`getAvgCost`, `getCostBasis`, `getRealizableValue`, `getUnrealizedPL`) · Day Summary render.
