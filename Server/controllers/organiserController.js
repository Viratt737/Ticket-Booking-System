import { clerkClient } from "@clerk/express";
import Venue from "../models/Venue.js";
import Show from "../models/Show.js";
import Booking from "../models/Booking.js";
import { ensureMovieExists } from "./showController.js";
import { buildSeatsFromLayout } from "../configs/seatHelper.js";

export const registerOrganiser = async (req, res) => {
    try {
        const auth = req.auth();
        console.log("Register Organiser Auth State:", auth);
        const { userId } = auth;
        if (!userId) {
            return res.json({ success: false, message: "No user ID found in request auth state" });
        }
        const user = await clerkClient.users.getUser(userId);
        await clerkClient.users.updateUserMetadata(userId, {
            privateMetadata: { ...user.privateMetadata, role: 'organiser' }
        });
        res.json({ success: true, message: "You're now registered as an organiser" });
    } catch (error) {
        console.error("Register Organiser Error:", error);
        res.json({ success: false, message: error.message });
    }
}

export const isOrganiser = async (req, res) => {
    try {
        const { userId } = req.auth();
        const user = await clerkClient.users.getUser(userId);
        const role = user.privateMetadata.role;
        res.json({ success: true, isOrganiser: role === 'organiser' || role === 'admin' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
}

export const createOrganiserShow = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { movieId, venueId, showDateTime, categoryPricing } = req.body;

        if (!movieId || !venueId || !showDateTime || !categoryPricing?.length) {
            return res.json({ success: false, message: "Missing required fields" });
        }

        const venue = await Venue.findById(venueId);
        if (!venue) return res.json({ success: false, message: "Venue not found" });

        await ensureMovieExists(movieId);

        const basePrice = categoryPricing[0]?.price || 0;

        // Build seat map from venue layout
        const seats = buildSeatsFromLayout(venue.layout, categoryPricing);

        const show = await Show.create({
            movie: movieId,
            venue: venueId,
            organiser: userId,
            showDateTime: new Date(showDateTime),
            showPrice: basePrice,
            categoryPricing,
            seats
        });

        res.json({ success: true, show, message: "Show created successfully" });
    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}

export const getOrganiserDashboard = async (req, res) => {
    try {
        const { userId } = req.auth();
        const shows = await Show.find({ organiser: userId }).populate('movie').populate('venue').sort({ showDateTime: -1 });

        const showIds = shows.map(s => s._id);
        const bookings = await Booking.find({ show: { $in: showIds }, isPaid: true });

        const revenueByShow = {};
        const countByShow = {};
        bookings.forEach(b => {
            const key = b.show.toString();
            revenueByShow[key] = (revenueByShow[key] || 0) + b.amount;
            countByShow[key] = (countByShow[key] || 0) + 1;
        });

        const eventSummary = shows.map(show => ({
            showId: show._id,
            movieTitle: show.movie?.title,
            venueName: show.venue?.name,
            showDateTime: show.showDateTime,
            totalSeats: show.seats.length,
            bookedSeats: show.seats.filter(s => s.status === 'booked').length,
            totalBookings: countByShow[show._id.toString()] || 0,
            revenue: revenueByShow[show._id.toString()] || 0
        }));

        const totalRevenue = Object.values(revenueByShow).reduce((a, b) => a + b, 0);

        res.json({ success: true, eventSummary, totalRevenue, totalShows: shows.length });
    } catch (error) {
        console.error(error.message);
        res.json({ success: false, message: error.message });
    }
}