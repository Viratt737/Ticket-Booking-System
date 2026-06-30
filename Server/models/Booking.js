import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
    user:           { type: String, required: true, ref: 'User' },
    show:           { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Show' },
    amount:         { type: Number, required: true },
    bookedSeats:    { type: Array, required: true },     // array of seatIds
    isPaid:         { type: Boolean, default: false },
    paymentLink:    { type: String },
    paymentIntentId: { type: String, default: null },   // stored for Stripe refunds
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled'],
        default: 'pending'
    }
}, { timestamps: true })

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;