import mongoose from "mongoose";

const venueSchema = new mongoose.Schema({
    createdBy: { type: String, ref: 'User' },
    name: { type: String, required: true },
    location: { type: String, required: true },
    categories: [{ name: { type: String, required: true } }],
    layout: [{
        row: { type: String, required: true },
        seatsInRow: { type: Number, required: true },
        category: { type: String, required: true }
    }]
}, { timestamps: true });

const Venue = mongoose.model("Venue", venueSchema);
export default Venue;