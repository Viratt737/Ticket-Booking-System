import { Inngest } from "inngest";
import QRCode from "qrcode";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import Waitlist from "../models/Waitlist.js";
import sendEmail from "../configs/nodeMailer.js";

// Create a client to send and receive events
export const inngest = new Inngest({ id: "movie-ticket-booking" });

const WAITLIST_OFFER_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Clerk user sync functions
// ─────────────────────────────────────────────────────────────────────────────
const syncUserCreation = inngest.createFunction(
    { id: 'sync-user-from-clerk' },
    { event: 'clerk/user.created' },
    async ({ event }) => {
        const { id, first_name, last_name, email_addresses, image_url } = event.data;
        const userData = {
            _id: id,
            email: email_addresses[0].email_address,
            name: first_name + ' ' + last_name,
            image: image_url
        };
        await User.create(userData);
    }
)

const syncUserDeletion = inngest.createFunction(
    { id: 'delete-user-with-clerk' },
    { event: 'clerk/user.deleted' },
    async ({ event }) => {
        const { id } = event.data;
        await User.findByIdAndDelete(id);
    }
)

const syncUserUpdation = inngest.createFunction(
    { id: 'update-user-from-clerk' },
    { event: 'clerk/user.updated' },
    async ({ event }) => {
        const { id, first_name, last_name, email_addresses, image_url } = event.data;
        const userData = {
            _id: id,
            email: email_addresses[0].email_address,
            name: first_name + ' ' + last_name,
            image: image_url
        };
        await User.findByIdAndUpdate(id, userData);
    }
)

// ─────────────────────────────────────────────────────────────────────────────
// Unpaid booking cleanup — runs 10 min after booking created
// If payment was not completed, delete the booking and free the held seats.
// ─────────────────────────────────────────────────────────────────────────────
const releaseSeatsAndDeleteBooking = inngest.createFunction(
    { id: 'release-seats-delete-booking' },
    { event: "app/checkpayment" },
    async ({ event, step }) => {
        const tenMinutesLater = new Date(Date.now() + 10 * 60 * 1000);
        await step.sleepUntil('wait-for-10-minutes', tenMinutesLater);

        await step.run('check-payment-status', async () => {
            const bookingId = event.data.bookingId;
            const booking = await Booking.findById(bookingId);

            if (!booking || booking.isPaid) return;

            // Free the held seats atomically
            await Show.updateOne(
                { _id: booking.show },
                {
                    $set: {
                        "seats.$[elem].status": "available",
                        "seats.$[elem].heldBy": null,
                        "seats.$[elem].holdExpiresAt": null
                    }
                },
                {
                    arrayFilters: [{ "elem.seatId": { $in: booking.bookedSeats } }]
                }
            );

            await Booking.findByIdAndDelete(booking._id);

            // Trigger waitlist processing for freed categories
            const show = await Show.findById(booking.show).select('seats');
            if (show) {
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
            }
        });
    }
)

// ─────────────────────────────────────────────────────────────────────────────
// Sweep expired holds — runs every 5 minutes via cron
// Finds any held seats whose holdExpiresAt has passed and resets them.
// ─────────────────────────────────────────────────────────────────────────────
const sweepExpiredHolds = inngest.createFunction(
    { id: 'sweep-expired-holds' },
    { cron: "*/5 * * * *" },
    async ({ step }) => {
        const now = new Date();

        const result = await step.run('release-expired-holds', async () => {
            const updateResult = await Show.updateMany(
                { seats: { $elemMatch: { status: 'held', holdExpiresAt: { $lte: now } } } },
                {
                    $set: {
                        "seats.$[elem].status": "available",
                        "seats.$[elem].heldBy": null,
                        "seats.$[elem].holdExpiresAt": null
                    }
                },
                {
                    arrayFilters: [{ "elem.status": "held", "elem.holdExpiresAt": { $lte: now } }]
                }
            );
            return { modifiedCount: updateResult.modifiedCount };
        });

        return { swept: result.modifiedCount };
    }
)

// ─────────────────────────────────────────────────────────────────────────────
// Booking confirmation email with QR code — triggered after successful payment
// ─────────────────────────────────────────────────────────────────────────────
const sendBookingConfirmationEmail = inngest.createFunction(
    { id: "send-booking-confirmation-email" },
    { event: "app/show.booked" },
    async ({ event, step }) => {
        const { bookingId } = event.data;

        const booking = await Booking.findById(bookingId).populate({
            path: 'show',
            populate: { path: "movie", model: "Movie" }
        }).populate('user');

        if (!booking?.user?.email) return;

        // Generate QR code as base64 data URL
        const qrDataUrl = await QRCode.toDataURL(bookingId, {
            width: 200,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        });

        const currency = process.env.CURRENCY || '$';
        const showDate = new Date(booking.show.showDateTime).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' });
        const showTime = new Date(booking.show.showDateTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' });

        await sendEmail({
            to: booking.user.email,
            subject: `🎬 Booking Confirmed: "${booking.show.movie.title}"`,
            body: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #09090B; color: #ffffff; border-radius: 12px; overflow: hidden;">
                    <div style="background: #3B82F6; padding: 24px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px; color: white;">🎟 Your Ticket is Confirmed!</h1>
                    </div>
                    <div style="padding: 32px;">
                        <p style="font-size: 16px; color: #d1d5db;">Hi <strong>${booking.user.name}</strong>,</p>
                        <p style="color: #d1d5db;">Your booking for <strong style="color: #3B82F6;">"${booking.show.movie.title}"</strong> is confirmed.</p>

                        <div style="background: #1c1c1e; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #3B82F6;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr><td style="padding: 6px 0; color: #9ca3af;">📅 Date</td><td style="color: #fff; text-align: right;">${showDate}</td></tr>
                                <tr><td style="padding: 6px 0; color: #9ca3af;">⏰ Time</td><td style="color: #fff; text-align: right;">${showTime}</td></tr>
                                <tr><td style="padding: 6px 0; color: #9ca3af;">🪑 Seats</td><td style="color: #fff; text-align: right;">${booking.bookedSeats.join(', ')}</td></tr>
                                <tr><td style="padding: 6px 0; color: #9ca3af;">💰 Amount</td><td style="color: #fff; text-align: right;">${currency}${booking.amount}</td></tr>
                                <tr><td style="padding: 6px 0; color: #9ca3af;">🔖 Booking ID</td><td style="color: #fff; text-align: right; font-size: 12px;">${bookingId}</td></tr>
                            </table>
                        </div>

                        <div style="text-align: center; margin: 24px 0;">
                            <p style="color: #9ca3af; margin-bottom: 12px; font-size: 14px;">Scan this QR code at the venue</p>
                            <img src="${qrDataUrl}" alt="QR Code" style="border: 4px solid #3B82F6; border-radius: 8px; width: 180px; height: 180px;" />
                        </div>

                        <p style="color: #6b7280; font-size: 13px;">Enjoy the show! 🍿</p>
                        <p style="color: #6b7280; font-size: 13px;">Thanks for booking with us,<br>— QuickShow Team</p>
                    </div>
                </div>
            `
        });
    }
)

// ─────────────────────────────────────────────────────────────────────────────
// Show reminders — every 8 hours, emails users with shows in next 8 hours
// ─────────────────────────────────────────────────────────────────────────────
const sendShowReminders = inngest.createFunction(
    { id: "send-show-reminders" },
    { cron: "0 */8 * * *" },
    async ({ step }) => {
        const now = new Date();
        const in8Hours = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const windowStart = new Date(in8Hours.getTime() - 10 * 60 * 1000);

        const reminderTasks = await step.run("prepare-reminder-tasks", async () => {
            const shows = await Show.find({
                showDateTime: { $gte: windowStart, $lte: in8Hours },
            }).populate('movie');

            const tasks = [];

            for (const show of shows) {
                if (!show.movie) continue;

                // Get unique bookers from seats array
                const userIds = [...new Set(
                    show.seats.filter(s => s.status === 'booked' && s.bookedBy).map(s => s.bookedBy)
                )];
                if (userIds.length === 0) continue;

                const users = await User.find({ _id: { $in: userIds } }).select("name email");
                for (const user of users) {
                    tasks.push({
                        userEmail: user.email,
                        userName: user.name,
                        movieTitle: show.movie.title,
                        showTime: show.showDateTime,
                    });
                }
            }
            return tasks;
        });

        if (reminderTasks.length === 0) {
            return { sent: 0, message: "No reminders to send." };
        }

        const results = await step.run('send-all-reminders', async () => {
            return await Promise.allSettled(
                reminderTasks.map(task => sendEmail({
                    to: task.userEmail,
                    subject: `Reminder: Your movie "${task.movieTitle}" starts soon!`,
                    body: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                            <h2>Hello ${task.userName},</h2>
                            <p>This is a quick reminder that your movie:</p>
                            <h3 style="color: #3B82F6;">"${task.movieTitle}"</h3>
                            <p>is scheduled for <strong>${new Date(task.showTime).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</strong> at 
                            <strong>${new Date(task.showTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</strong>.</p>
                            <p>It starts in approximately <strong>8 hours</strong> — make sure you're ready!</p>
                            <p>Enjoy the show!<br>QuickShow Team</p>
                        </div>`
                }))
            );
        });

        const sent = results.filter(r => r.status === "fulfilled").length;
        return { sent, failed: results.length - sent };
    }
)

// ─────────────────────────────────────────────────────────────────────────────
// New show notifications
// ─────────────────────────────────────────────────────────────────────────────
const sendNewShowNotifications = inngest.createFunction(
    { id: "send-new-show-notifications" },
    { event: "app/show.added" },
    async ({ event }) => {
        const { movieTitle } = event.data;
        const users = await User.find({});

        for (const user of users) {
            await sendEmail({
                to: user.email,
                subject: `🎬 New Show Added: ${movieTitle}`,
                body: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2>Hi ${user.name},</h2>
                        <p>We've just added a new show to our library:</p>
                        <h3 style="color: #3B82F6;">"${movieTitle}"</h3>
                        <p>Visit our website to book your seats!</p>
                        <p>Thanks,<br>QuickShow Team</p>
                    </div>`
            });
        }

        return { message: "Notifications sent." };
    }
)

// ─────────────────────────────────────────────────────────────────────────────
// Waitlist processor — triggered when seats are freed (cancellation / expiry)
// Finds the next waiting customer, places a hold in their name, emails them.
// ─────────────────────────────────────────────────────────────────────────────
const processWaitlist = inngest.createFunction(
    { id: "process-waitlist" },
    { event: "app/waitlist.process" },
    async ({ event, step }) => {
        const { showId, category } = event.data;

        const offerResult = await step.run('find-and-offer-seat', async () => {
            const now = new Date();

            // Find the next waiting entry (lowest position)
            const entry = await Waitlist.findOne({
                show: showId,
                category,
                status: 'waiting'
            }).sort({ position: 1 });

            if (!entry) return null;

            // Find an available seat in this category
            const show = await Show.findById(showId).populate('movie');
            if (!show) return null;

            const availableSeat = show.seats.find(s =>
                s.category === category &&
                (s.status === 'available' ||
                    (s.status === 'held' && s.holdExpiresAt && s.holdExpiresAt <= now))
            );

            if (!availableSeat) return null;

            const offerExpiry = new Date(Date.now() + WAITLIST_OFFER_WINDOW_MS);

            // Atomically hold the seat for this waitlist user
            const result = await Show.findOneAndUpdate(
                {
                    _id: showId,
                    $nor: [{
                        seats: {
                            $elemMatch: {
                                seatId: availableSeat.seatId,
                                $or: [
                                    { status: 'booked' },
                                    { status: 'held', holdExpiresAt: { $gt: now } }
                                ]
                            }
                        }
                    }]
                },
                {
                    $set: {
                        "seats.$[elem].status": "held",
                        "seats.$[elem].heldBy": entry.user,
                        "seats.$[elem].holdExpiresAt": offerExpiry
                    }
                },
                {
                    arrayFilters: [{ "elem.seatId": availableSeat.seatId }],
                    new: true
                }
            );

            if (!result) return null;

            // Update waitlist entry
            await Waitlist.findByIdAndUpdate(entry._id, {
                status: 'offered',
                offeredSeatId: availableSeat.seatId,
                offerExpiresAt: offerExpiry
            });

            // Send email to user
            const user = await User.findById(entry.user);
            if (user) {
                const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
                const movieDate = show.showDateTime.toISOString().split('T')[0];
                const offerLink = `${clientUrl}/movies/${show.movie._id}/${movieDate}?waitlist_seat=${availableSeat.seatId}&show=${showId}`;

                await sendEmail({
                    to: user.email,
                    subject: `🎟 Your waitlisted seat for "${show.movie.title}" is now available!`,
                    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #09090B; color: #ffffff; border-radius: 12px; padding: 32px;">
                            <h2 style="color: #3B82F6;">Great news, ${user.name}!</h2>
                            <p>A seat has become available in the <strong>${category}</strong> category for:</p>
                            <h3 style="color: #3B82F6;">"${show.movie.title}"</h3>
                            <p>📅 ${new Date(show.showDateTime).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' })}</p>
                            <p>⏰ ${new Date(show.showDateTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })}</p>
                            <p>🪑 Seat: <strong>${availableSeat.seatId}</strong></p>
                            <p style="color: #ef4444;">⚠️ This offer expires in <strong>30 minutes</strong>. Act quickly!</p>
                            <a href="${offerLink}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #3B82F6; color: white; border-radius: 8px; text-decoration: none; font-weight: bold;">
                                Claim Your Seat
                            </a>
                            <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">If you don't claim it in time, the next person on the waitlist will be notified.</p>
                            <p style="color: #6b7280; font-size: 13px;">— QuickShow Team</p>
                        </div>`
                });
            }

            return { entryId: entry._id.toString(), seatId: availableSeat.seatId, offerExpiry };
        });

        if (!offerResult) return { message: "No waitlist entries or no available seats" };

        // Sleep until offer expires, then check if it was claimed
        const offerExpiry = new Date(offerResult.offerExpiry);
        await step.sleepUntil('wait-for-offer-expiry', offerExpiry);

        await step.run('check-offer-claimed', async () => {
            const entry = await Waitlist.findById(offerResult.entryId);
            if (!entry || entry.status !== 'offered') return; // already fulfilled or manually resolved

            // Offer expired — mark entry as expired, free the seat
            await Waitlist.findByIdAndUpdate(offerResult.entryId, { status: 'expired' });

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
                    arrayFilters: [{ "elem.seatId": offerResult.seatId, "elem.heldBy": entry.user }]
                }
            );

            // Move to next person in queue
            await inngest.send({
                name: "app/waitlist.process",
                data: { showId, category }
            });
        });
    }
)


export const functions = [
    syncUserCreation,
    syncUserDeletion,
    syncUserUpdation,
    releaseSeatsAndDeleteBooking,
    sweepExpiredHolds,
    sendBookingConfirmationEmail,
    sendShowReminders,
    sendNewShowNotifications,
    processWaitlist
];