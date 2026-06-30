import Venue from "../models/Venue.js";

export const createVenue = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { name, location, categories, layout } = req.body;

        if (!name || !location || !categories?.length || !layout?.length) {
            return res.json({ success: false, message: "Missing required venue fields" });
        }

        const validCategoryNames = categories.map(c => c.name);
        const invalidRow = layout.find(row => !validCategoryNames.includes(row.category));
        if (invalidRow) {
            return res.json({ success: false, message: `Row ${invalidRow.row} uses an undefined category` });
        }

        const venue = await Venue.create({ createdBy: userId, name, location, categories, layout });
        res.json({ success: true, venue });
    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}

export const getAllVenues = async (req, res) => {
    try {
        const venues = await Venue.find({}).sort({ createdAt: -1 });
        res.json({ success: true, venues });
    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}