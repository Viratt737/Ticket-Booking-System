import mongoose from "mongoose";

const waitlistSchema = new mongoose.Schema({
    show:           { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Show' },
    user:           { type: String, required: true, ref: 'User' },
    category:       { type: String, required: true },
    status: {
        type: String,
        enum: ['waiting', 'offered', 'fulfilled', 'expired'],
        default: 'waiting'
    },
    offeredSeatId:  { type: String, default: null },
    offerExpiresAt: { type: Date, default: null },
    position:       { type: Number }    // order in queue (lower = earlier)
}, { timestamps: true });

// Index for quick queue lookup
waitlistSchema.index({ show: 1, category: 1, status: 1, position: 1 });

const Waitlist = mongoose.model("Waitlist", waitlistSchema);
export default Waitlist;
