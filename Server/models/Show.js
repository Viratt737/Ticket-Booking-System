import mongoose from "mongoose";

const showSchema = new mongoose.Schema(
    {
        movie: { type: String, required: true, ref: 'Movie' },
        venue: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', default: null },
        organiser: { type: String, ref: 'User', default: null },
        showDateTime: { type: Date, required: true },
        showPrice: { type: Number, required: true },
        categoryPricing: [{ category: String, price: Number }],
        occupiedSeats: { type: Object, default: {} }
    }, { minimize: false }
)

const Show = mongoose.model("Show", showSchema);
export default Show;