# 🎬 QuickShow — Ticket Booking Platform

A full-stack MERN movie ticket booking platform with real-time seat maps, atomic seat holds, waitlist auto-assignment, and QR-code email tickets.

---

## Live Demo

> _Deploy instructions below. Paste your hosted URL here after deployment._

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Backend | Node.js, Express 5 |
| Database | MongoDB (Mongoose) |
| Auth | Clerk (`@clerk/express`, `@clerk/clerk-react`) |
| Payments | Stripe Checkout |
| Background jobs | Inngest |
| Email | Nodemailer over Brevo SMTP |
| QR codes | `qrcode` npm package |
| Movie data | TMDB API |

---

## Setup & Running Locally

### Prerequisites
- Node.js ≥ 18
- MongoDB Atlas account (or local MongoDB)
- Clerk account + application
- Stripe account
- Brevo account (free tier works)
- TMDB API account

### 1. Clone & Install

```bash
git clone <repo-url>
cd "Ticket Booking System"

# Install server dependencies
cd Server && npm install && cd ..

# Install client dependencies
cd Client && npm install && cd ..
```

### 2. Configure Environment Variables

**Server** — copy `Server/.env.example` → `Server/.env` and fill in all values.

**Client** — copy `Client/.env.example` → `Client/.env` and fill in all values.

### 3. Configure Clerk

In your Clerk dashboard:
1. Create an application.
2. Add a webhook pointing to `<your-server-url>/api/inngest` for: `user.created`, `user.updated`, `user.deleted`.
3. Set the signing secret in your server `.env` as `SVIX_SECRET` (if using Svix webhook verification).
4. Set one user's `privateMetadata.role = "admin"` via the Clerk dashboard.

### 4. Configure Stripe Webhook

In Stripe dashboard → Webhooks → Add endpoint:
- URL: `<your-server-url>/api/stripe`
- Events to listen for: `payment_intent.succeeded`
- Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` in server `.env`.

For local testing use the Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/stripe
```

### 5. Start Inngest Dev Server (local)

```bash
npx inngest-cli@latest dev
```

Then start the server — Inngest auto-discovers functions at `/api/inngest`.

### 6. Run

```bash
# Terminal 1 — Backend
cd Server && npm run dev

# Terminal 2 — Frontend
cd Client && npm run dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:3000

---

## API Reference

### Auth
All protected routes require an `Authorization: Bearer <clerk_session_token>` header.

### Shows

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/show/all` | None | List all upcoming shows (unique movies) |
| GET | `/api/show/:movieId` | None | Show detail + date/time slots |
| GET | `/api/show/now-playing` | Organiser | TMDB now-playing movies |
| POST | `/api/show/add` | Admin | Create shows with venue + category pricing |

### Bookings

| Method | Route | Auth | Body / Params | Description |
|---|---|---|---|---|
| POST | `/api/booking/hold` | User | `{ showId, selectedSeats[] }` | Atomically hold seats (10-min TTL) |
| POST | `/api/booking/release` | User | `{ showId, selectedSeats[] }` | Release a hold early |
| POST | `/api/booking/create` | User | `{ showId, selectedSeats[] }` | Create booking + Stripe session |
| GET | `/api/booking/seats/:showId` | None | — | Full seat map with statuses |
| POST | `/api/booking/cancel/:bookingId` | User | — | Cancel confirmed booking + Stripe refund |
| POST | `/api/booking/waitlist` | User | `{ showId, category }` | Join waitlist for sold-out category |

### Users

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/user/bookings` | User | My booking history |
| POST | `/api/user/favorite` | User | Toggle favorite movie |
| GET | `/api/user/favorites` | User | List favorite movies |

### Admin

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/is-admin` | Admin | Role check |
| GET | `/api/admin/dashboard` | Admin | Stats: bookings, revenue, shows, users |
| GET | `/api/admin/shows` | Admin | All shows |
| GET | `/api/admin/bookings` | Admin | All bookings |

### Organiser

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/organiser/register` | User | Register as organiser |
| GET | `/api/organiser/is-organiser` | User | Role check |
| POST | `/api/organiser/show` | Organiser | Create a show |
| GET | `/api/organiser/dashboard` | Organiser | Revenue + bookings per show |

### Venues

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/venue/create` | Admin | Create a venue with layout |
| GET | `/api/venue/all` | None | List all venues |

---

## Database Schema

### User
```
_id:    String (Clerk userId)
name:   String
email:  String
image:  String
```

### Movie
```
_id:               String (TMDB movie id)
title:             String
overview:          String
poster_path:       String
backdrop_path:     String
genres:            Array
casts:             Array
release_date:      String
original_language: String
tagline:           String
vote_average:      Number
runtime:           Number
```

### Venue
```
_id:        ObjectId
createdBy:  String (userId)
name:       String
location:   String
categories: [{ name: String }]
layout:     [{ row: String, seatsInRow: Number, category: String }]
```

### Show
```
_id:             ObjectId
movie:           String (Movie._id)
venue:           ObjectId (Venue._id)
organiser:       String (User._id)
showDateTime:    Date
showPrice:       Number (base price from first category)
categoryPricing: [{ category: String, price: Number }]
seats: [{
  seatId:        String        e.g. "A1"
  row:           String
  category:      String
  price:         Number
  status:        "available" | "held" | "booked"
  heldBy:        String | null (userId)
  holdExpiresAt: Date | null
  bookedBy:      String | null (userId)
}]
```

### Booking
```
_id:              ObjectId
user:             String (User._id)
show:             ObjectId (Show._id)
amount:           Number
bookedSeats:      [String]     seatIds
isPaid:           Boolean
paymentLink:      String
paymentIntentId:  String | null
status:           "pending" | "confirmed" | "cancelled"
createdAt:        Date
```

### Waitlist
```
_id:            ObjectId
show:           ObjectId (Show._id)
user:           String (User._id)
category:       String
status:         "waiting" | "offered" | "fulfilled" | "expired"
offeredSeatId:  String | null
offerExpiresAt: Date | null
position:       Number
createdAt:      Date
```

---

## Seat Hold & Waitlist — How It Works

### Seat Hold / TTL

1. Customer selects a seat → `POST /api/booking/hold` is called immediately.
2. Backend performs a **single atomic `findOneAndUpdate`** whose filter requires all selected seats to be `available` or have an expired hold. MongoDB's document-level lock means concurrent requests are serialized — only one can win.
3. On success, `status = "held"`, `heldBy = userId`, `holdExpiresAt = now + 10 min`.
4. Frontend shows a countdown timer. On expiry, UI resets automatically.
5. On navigation away, `beforeunload` sends a beacon to `POST /api/booking/release`.
6. A cron Inngest job (`sweep-expired-holds`) runs every 5 minutes as a safety net.

### Waitlist

1. Sold-out category shows a "Join Waitlist" button.
2. On cancellation / expiry / abandoned payment, an `app/waitlist.process` event is emitted.
3. The `processWaitlist` Inngest function finds the next waiting user, atomically holds a seat for them, and emails a 30-minute offer link.
4. Inngest durably sleeps until the offer window closes. If unclaimed, it expires the entry, releases the seat, and cascades to the next person.

---

## Known Limitations

- **Movies only:** Platform is scoped to TMDB-sourced movie events. Concert/generic event support is not implemented.
- **Stripe refunds:** Cancellation attempts a Stripe refund automatically if `paymentIntentId` is stored. For older bookings without this field, a manual refund via the Stripe dashboard is needed.
- **No mobile app:** Web only.

---

## Deployment

### Backend (Render / Railway)
1. Set all env vars from `Server/.env.example`.
2. Set start command: `node server.js`.
3. Point Inngest to your deployed URL in the Inngest dashboard.
4. Point Stripe webhook to `<backend-url>/api/stripe`.

### Frontend (Vercel)
1. Set all env vars from `Client/.env.example`.
2. Set `VITE_BASE_URL` to your deployed backend URL.
3. Deploy with `npm run build` (build command) and `dist` (output directory).
