# System Design — Ticket Booking Platform

## 1. Seat Hold / TTL Mechanism

When a customer clicks a seat on the seat-selection page, the frontend immediately calls `POST /api/booking/hold`. The backend sets a **10-minute hold** on each selected seat by writing three fields directly onto the seat subdocument inside the Show document:

- `status: "held"` — prevents others from selecting it
- `heldBy: <userId>` — records who holds it
- `holdExpiresAt: now + 10 min` — the TTL timestamp

The frontend receives `holdExpiresAt` and displays a live countdown timer. When the hold expires, the timer reaches zero, the UI resets the selection and the seat becomes available to others again.

Holds are cleaned up by two mechanisms:

**Active release:** If the user navigates away, a `beforeunload` listener fires `navigator.sendBeacon()` to call `POST /api/booking/release`, which immediately resets those seat fields to `available`. On checkout abandonment (Stripe cancel URL), the same endpoint is hit on component unmount.

**Background sweep:** An Inngest cron job (`sweep-expired-holds`) runs every 5 minutes and executes a `Show.updateMany()` targeting all seats where `status = "held"` and `holdExpiresAt ≤ now`. This handles any holds that were not explicitly released (e.g., browser crash, network failure). The update is bulk and non-blocking.

---

## 2. Concurrency Prevention — No Double-Booking

The critical property: **two simultaneous hold requests for the same seat must not both succeed.**

The solution is a **single atomic `findOneAndUpdate`** whose *filter* clause includes the concurrency guard:

```js
await Show.findOneAndUpdate(
  {
    _id: showId,
    $nor: [{
      seats: {
        $elemMatch: {
          seatId: { $in: selectedSeats },
          $or: [
            { status: 'booked' },
            { status: 'held', holdExpiresAt: { $gt: now } }
          ]
        }
      }
    }]
  },
  { $set: { "seats.$[elem].status": "held", ... } },
  { arrayFilters: [...] }
)
```

MongoDB's **document-level write lock** ensures this filter and update execute as one indivisible operation. If Request A acquires the lock and writes `status: "held"`, Request B's filter will evaluate against the updated document and find a currently-held seat — so it gets `null` back and returns a 409. There is no window between the read and write where a second request can slip through.

This is validated by the `Server/test/concurrencyTest.js` script, which fires two simultaneous requests and asserts exactly one wins.

Booking creation (`POST /api/booking/create`) also validates that the seats are still held by the requesting user before creating the Stripe session — so even if a hold expired between hold and checkout, the payment flow is rejected cleanly.

---

## 3. Waitlist Auto-Assignment Flow

When a category is sold out, customers can join a waitlist via `POST /api/booking/waitlist`. Each entry records `{ show, user, category, position }`, where position determines FIFO order.

A seat becomes available through three triggers:
1. A confirmed booking is cancelled
2. A Stripe payment times out (Inngest `releaseSeatsAndDeleteBooking`)
3. A waitlist offer expires before being claimed

In all three cases, the freeing code emits an `app/waitlist.process` Inngest event with `{ showId, category }`.

The `processWaitlist` Inngest function:
1. Finds the lowest-position `waiting` entry for that show+category.
2. Finds an `available` seat in that category.
3. **Atomically holds** the seat for the waitlist user (same `findOneAndUpdate` pattern as regular holds).
4. Updates the Waitlist entry: `status: "offered"`, `offeredSeatId`, `offerExpiresAt = now + 30 min`.
5. Emails the user a link containing the `showId` and pre-selected `seatId` as query params so the UI auto-selects their offered seat when they arrive.
6. Calls `step.sleepUntil(offerExpiresAt)` — Inngest durably suspends the function.

---

## 4. Time-Limited Offer Handling / Expiry

After the 30-minute offer window, the Inngest function wakes up and checks if the waitlist entry is still `"offered"`. If it is:

1. The entry is marked `"expired"`.
2. The held seat is released back to `"available"` (only if `heldBy` still matches the waitlist user, preventing a race where they completed the booking just as expiry ran).
3. The function emits another `app/waitlist.process` event for the same `{showId, category}` — cascading to the next person in the queue.

If the user did complete the booking before expiry, the Stripe webhook transitions their seat to `"booked"` and marks the Waitlist entry `"fulfilled"`, so the post-sleep check finds status ≠ "offered" and exits cleanly.

This design means **no polling** is needed: Inngest's durable sleep handles the timer entirely, and the cascade is event-driven through the queue.

---

## Scope Note

This platform is scoped to **movie events only**, sourced from TMDB. Concert/generic event support is a known limitation. The organiser and admin flows both reference TMDB movie data; adding non-movie events would require a separate event metadata model and UI, which is out of scope for this submission.
