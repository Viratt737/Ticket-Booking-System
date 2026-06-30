import stripe from "stripe";
import Booking from '../models/Booking.js';
import Show from '../models/Show.js';
import { inngest } from "../inngest/index.js";

export const stripeWebhooks = async (request, response) => {
    const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
    const sig = request.headers["stripe-signature"];

    let event;

    try {
        event = stripeInstance.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
    } catch (error) {
        return response.status(400).send(`Webhook Error: ${error.message}`);
    }

    try {
        switch (event.type) {
            case "payment_intent.succeeded": {
                const paymentIntent = event.data.object;
                const sessionList = await stripeInstance.checkout.sessions.list({
                    payment_intent: paymentIntent.id
                });

                const session = sessionList.data[0];
                const { bookingId } = session.metadata;

                const booking = await Booking.findById(bookingId);
                if (!booking) break;

                // Atomically transition seats from held → booked
                await Show.updateOne(
                    { _id: booking.show },
                    {
                        $set: {
                            "seats.$[elem].status": "booked",
                            "seats.$[elem].bookedBy": booking.user,
                            "seats.$[elem].heldBy": null,
                            "seats.$[elem].holdExpiresAt": null
                        }
                    },
                    {
                        arrayFilters: [{ "elem.seatId": { $in: booking.bookedSeats } }]
                    }
                );

                // Mark booking confirmed + store paymentIntentId for potential refunds
                await Booking.findByIdAndUpdate(bookingId, {
                    isPaid: true,
                    status: 'confirmed',
                    paymentIntentId: paymentIntent.id,
                    paymentLink: ""
                });

                // Send confirmation email with QR code
                await inngest.send({
                    name: "app/show.booked",
                    data: { bookingId }
                });

                break;
            }

            default:
                console.log('Unhandled event type:', event.type)
        }
        response.json({ received: true })
    } catch (err) {
        console.error("Webhook processing error:", err);
        response.status(500).send("Internal Server Error");
    }
}