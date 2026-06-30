import { inngest } from "../inngest/index.js";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import Waitlist from "../models/Waitlist.js";
import stripe from 'stripe';

const HOLD_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SEATS_PER_BOOKING = 5;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/booking/hold
// Atomically hold selected seats using a single findOneAndUpdate.
// The filter requires every targeted seat to be available OR have an expired hold.
// MongoDB's document-level lock ensures no two concurrent requests both win.
// ─────────────────────────────────────────────────────────────────────────────
export const holdSeats = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { showId, selectedSeats } = req.body;

        if (!showId || !Array.isArray(selectedSeats) || selectedSeats.length === 0) {
            return res.json({ success: false, message: "Invalid request: showId and selectedSeats required" });
        }
        if (selectedSeats.length > MAX_SEATS_PER_BOOKING) {
            return res.json({ success: false, message: `You can only select up to ${MAX_SEATS_PER_BOOKING} seats` });
        }

        const now = new Date();
        const holdExpiry = new Date(Date.now() + HOLD_TTL_MS);

        // ATOMIC OPERATION: The filter ensures ALL selected seats are currently
        // available or have an expired hold. If any are held/booked, the filter
        // won't match and result will be null — one winner, one loser.
        const result = await Show.findOneAndUpdate(
            {
                _id: showId,
                // Reject if ANY selected seat is held (not expired) or booked
                $nor: [
                    {
                        seats: {
                            $elemMatch: {
                                seatId: { $in: selectedSeats },
                                $or: [
                                    { status: 'booked' },
                                    {
                                        status: 'held',
                                        holdExpiresAt: { $gt: now }
                                    }
                                ]
                            }
                        }
                    }
                ]
            },
            {
                $set: {
                    "seats.$[elem].status": "held",
                    "seats.$[elem].heldBy": userId,
                    "seats.$[elem].holdExpiresAt": holdExpiry
                }
            },
            {
                arrayFilters: [{ "elem.seatId": { $in: selectedSeats } }],
                new: true
            }
        );

        if (!result) {
            return res.json({ success: false, message: "One or more selected seats are no longer available" });
        }

        res.json({ success: true, holdExpiresAt: holdExpiry, message: "Seats held successfully" });
    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/booking/release
// Release a hold (user navigates away or abandons checkout).
// Only releases seats held by the requesting user.
// ─────────────────────────────────────────────────────────────────────────────
export const releaseSeats = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { showId, selectedSeats } = req.body;

        if (!showId || !Array.isArray(selectedSeats) || selectedSeats.length === 0) {
            return res.json({ success: false, message: "Invalid request" });
        }

        await Show.updateOne(
            { _id: showId },
            {
                $set: {
                    "seats.$[elem].status": "available",
                    "seats.$[elem].heldBy": null,
                    "seats.$[elem].holdExpiresAt": null
                }
            },
            {
                arrayFilters: [
                    { "elem.seatId": { $in: selectedSeats }, "elem.heldBy": userId, "elem.status": "held" }
                ]
            }
        );

        // Trigger waitlist processing for the freed seats' categories
        const show = await Show.findById(showId).select('seats');
        const freedCategories = [...new Set(
            show.seats
                .filter(s => selectedSeats.includes(s.seatId))
                .map(s => s.category)
        )];

        for (const category of freedCategories) {
            await inngest.send({
                name: "app/waitlist.process",
                data: { showId, category }
            });
        }

        res.json({ success: true, message: "Seats released" });
    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/booking/seats/:showId
// Return the full seat map for a show (status visible, never exposes heldBy/bookedBy).
// ─────────────────────────────────────────────────────────────────────────────
export const getSeatMap = async (req, res) => {
    try {
        const { showId } = req.params;
        const showData = await Show.findById(showId).select('seats categoryPricing');

        if (!showData) return res.json({ success: false, message: "Show not found" });

        const now = new Date();
        const seats = showData.seats.map(seat => {
            // Treat expired holds as available for display purposes
            const effectiveStatus =
                seat.status === 'held' && seat.holdExpiresAt && seat.holdExpiresAt < now
                    ? 'available'
                    : seat.status;

            return {
                seatId: seat.seatId,
                row: seat.row,
                category: seat.category,
                price: seat.price,
                status: effectiveStatus
            };
        });

        res.json({ success: true, seats });
    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/booking/create
// Create a Booking only if selected seats are currently held by this user.
// Seats transition held → booked only after Stripe payment (in webhook).
// ─────────────────────────────────────────────────────────────────────────────
export const createBooking = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { showId, selectedSeats } = req.body;
        const { origin } = req.headers;

        if (!showId || !Array.isArray(selectedSeats) || selectedSeats.length === 0) {
            return res.json({ success: false, message: "Invalid request" });
        }

        const now = new Date();
        const showData = await Show.findById(showId).populate('movie');
        if (!showData) return res.json({ success: false, message: "Show not found" });

        // Verify each selected seat is held by this user and not expired
        const heldByUser = showData.seats.filter(seat =>
            selectedSeats.includes(seat.seatId) &&
            seat.status === 'held' &&
            seat.heldBy === userId &&
            seat.holdExpiresAt > now
        );

        if (heldByUser.length !== selectedSeats.length) {
            return res.json({ success: false, message: "Some seats are no longer held by you. Please re-select your seats." });
        }

        // Compute amount from individual seat prices
        const amount = heldByUser.reduce((sum, seat) => sum + seat.price, 0);

        // Create booking record (isPaid = false until Stripe webhook confirms)
        const booking = await Booking.create({
            user: userId,
            show: showId,
            amount,
            bookedSeats: selectedSeats,
            status: 'pending'
        });

        // Stripe Checkout
        const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);

        const line_items = [{
            price_data: {
                currency: process.env.VITE_CURRENCY?.toLowerCase() || 'usd',
                product_data: { name: showData.movie.title },
                unit_amount: Math.round(amount * 100)
            },
            quantity: 1
        }]

        const session = await stripeInstance.checkout.sessions.create({
            success_url: `${origin}/loading/my-bookings`,
            cancel_url: `${origin}/movies/${showData.movie._id}`,
            line_items,
            mode: 'payment',
            metadata: { bookingId: booking._id.toString() },
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        });

        booking.paymentLink = session.url;
        await booking.save();

        // Schedule unpaid cleanup after HOLD_TTL_MS + buffer
        await inngest.send({
            name: "app/checkpayment",
            data: { bookingId: booking._id.toString() }
        });

        res.json({ success: true, url: session.url });
    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/booking/cancel/:bookingId
// Cancel a confirmed booking, free seats, trigger waitlist.
// ─────────────────────────────────────────────────────────────────────────────
export const cancelBooking = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { bookingId } = req.params;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.json({ success: false, message: "Booking not found" });
        if (booking.user !== userId) return res.json({ success: false, message: "Not authorized" });
        if (booking.status === 'cancelled') return res.json({ success: false, message: "Booking already cancelled" });
        if (!booking.isPaid) return res.json({ success: false, message: "Only confirmed bookings can be cancelled" });

        // Atomically free the seats
        await Show.updateOne(
            { _id: booking.show },
            {
                $set: {
                    "seats.$[elem].status": "available",
                    "seats.$[elem].bookedBy": null,
                    "seats.$[elem].heldBy": null,
                    "seats.$[elem].holdExpiresAt": null
                }
            },
            {
                arrayFilters: [{ "elem.seatId": { $in: booking.bookedSeats } }]
            }
        );

        // Mark booking cancelled
        booking.status = 'cancelled';
        await booking.save();

        // Attempt Stripe refund if paymentIntentId is available
        if (booking.paymentIntentId) {
            try {
                const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
                await stripeInstance.refunds.create({ payment_intent: booking.paymentIntentId });
            } catch (refundErr) {
                console.error("Stripe refund failed:", refundErr.message);
                // Non-fatal — booking is still cancelled
            }
        }

        // Get freed categories and trigger waitlist processing
        const show = await Show.findById(booking.show).select('seats');
        const freedCategories = [...new Set(
            show.seats
                .filter(s => booking.bookedSeats.includes(s.seatId))
                .map(s => s.category)
        )];

        for (const category of freedCategories) {
            await inngest.send({
                name: "app/waitlist.process",
                data: { showId: booking.show.toString(), category }
            });
        }

        res.json({ success: true, message: "Booking cancelled successfully" });
    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/booking/waitlist
// Join the waitlist for a sold-out category on a show.
// ─────────────────────────────────────────────────────────────────────────────
export const joinWaitlist = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { showId, category } = req.body;

        if (!showId || !category) {
            return res.json({ success: false, message: "showId and category are required" });
        }

        // Check if user is already on waitlist for this show+category
        const existing = await Waitlist.findOne({
            show: showId,
            user: userId,
            category,
            status: { $in: ['waiting', 'offered'] }
        });

        if (existing) {
            return res.json({ success: false, message: "You are already on the waitlist for this category" });
        }

        // Verify the category is actually sold out
        const show = await Show.findById(showId).select('seats');
        const availableInCategory = show.seats.some(s =>
            s.category === category &&
            (s.status === 'available' || (s.status === 'held' && s.holdExpiresAt < new Date()))
        );

        if (availableInCategory) {
            return res.json({ success: false, message: "Seats are still available for this category — no need to join waitlist" });
        }

        // Determine queue position
        const lastEntry = await Waitlist.findOne({ show: showId, category, status: 'waiting' })
            .sort({ position: -1 }).select('position');
        const position = (lastEntry?.position ?? 0) + 1;

        const entry = await Waitlist.create({ show: showId, user: userId, category, position });

        res.json({ success: true, message: "You've been added to the waitlist", waitlistId: entry._id });
    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}