import mongoose from "mongoose";

const seatSchema = new mongoose.Schema({
    seatId:         { type: String, required: true },        // e.g. "A1", "B3"
    row:            { type: String, required: true },
    category:       { type: String, required: true },        // matches Venue category name
    price:          { type: Number, required: true, default: 0 },
    status:         { type: String, enum: ['available', 'held', 'booked'], default: 'available' },
    heldBy:         { type: String, default: null },         // Clerk userId
    holdExpiresAt:  { type: Date, default: null },
    bookedBy:       { type: String, default: null }
}, { _id: false });

const showSchema = new mongoose.Schema(
    {
        movie:          { type: String, required: true, ref: 'Movie' },
        venue:          { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', default: null },
        organiser:      { type: String, ref: 'User', default: null },
        showDateTime:   { type: Date, required: true },
        showPrice:      { type: Number, required: true },
        categoryPricing: [{ category: String, price: Number }],
        seats:          [seatSchema]
    }, { minimize: false }
)

// Index to speed up hold-expiry sweeps
showSchema.index({ "seats.status": 1, "seats.holdExpiresAt": 1 });

const Show = mongoose.model("Show", showSchema);
export default Show;