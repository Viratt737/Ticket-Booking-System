import axios from "axios"
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import Venue from "../models/Venue.js";
import { inngest } from "../inngest/index.js";
import { buildSeatsFromLayout } from "../configs/seatHelper.js";

// API to get now playing movies from TMDB API
export const getNowPlayingMovies = async (req, res) => {
    try {
        const { data } = await axios.get('https://api.themoviedb.org/3/movie/now_playing', {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
        })

        const movies = data.results;
        res.json({ success: true, movies: movies })
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message })
    }
}

// Ensures movie exists in DB; fetches from TMDB if missing.
export const ensureMovieExists = async (movieId) => {
    let movie = await Movie.findById(movieId);
    if (movie) return movie;

    const [movieDetailsResponse, movieCreditsResponse] = await Promise.all([
        axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }),
        axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } })
    ]);

    const movieApiData = movieDetailsResponse.data;
    const movieCreditsData = movieCreditsResponse.data;

    const movieDetails = {
        _id: movieId,
        title: movieApiData.title,
        overview: movieApiData.overview,
        poster_path: movieApiData.poster_path,
        backdrop_path: movieApiData.backdrop_path,
        genres: movieApiData.genres,
        casts: movieCreditsData.cast,
        release_date: movieApiData.release_date,
        original_language: movieApiData.original_language,
        tagline: movieApiData.tagline || "",
        vote_average: movieApiData.vote_average,
        runtime: movieApiData.runtime,
    }

    return await Movie.create(movieDetails);
}

// API to add a new show (admin route) — now requires venueId + categoryPricing
export const addShow = async (req, res) => {
    try {
        const { movieId, venueId, showsInput, categoryPricing, showPrice } = req.body

        if (!movieId || !venueId || !showsInput?.length || !categoryPricing?.length) {
            return res.json({ success: false, message: "Missing required fields (movieId, venueId, showsInput, categoryPricing)" })
        }

        const venue = await Venue.findById(venueId)
        if (!venue) return res.json({ success: false, message: "Venue not found" })

        const movie = await ensureMovieExists(movieId);

        // Build base price from first category
        const basePrice = showPrice || categoryPricing[0]?.price || 0;

        // Build seat map once and reuse for all shows
        const seats = buildSeatsFromLayout(venue.layout, categoryPricing);

        const showsToCreate = [];
        showsInput.forEach(show => {
            const showDate = show.date;
            show.time.forEach((time) => {
                const dateTimeString = `${showDate}T${time}`;
                showsToCreate.push({
                    movie: movieId,
                    venue: venueId,
                    showDateTime: new Date(dateTimeString),
                    showPrice: basePrice,
                    categoryPricing,
                    seats: seats.map(s => ({ ...s }))  // fresh copy per show
                })
            })
        });

        if (showsToCreate.length > 0) {
            await Show.insertMany(showsToCreate);
        }

        await inngest.send({
            name: "app/show.added",
            data: { movieTitle: movie.title }
        })

        res.json({ success: true, message: 'Show Added successfully.' })
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message })
    }
}

// API to get all shows from the database
export const getShows = async (req, res) => {
    try {
        const shows = await Show.find({ showDateTime: { $gte: new Date() } }).populate('movie').sort({ showDateTime: 1 });
        const uniqueShows = new Set(shows.map(show => show.movie))
        res.json({ success: true, shows: Array.from(uniqueShows) })
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
}

// API to get a single show with its date/time slots (grouped by date)
export const getShow = async (req, res) => {
    try {
        const { movieId } = req.params;
        const shows = await Show.find({ movie: movieId, showDateTime: { $gte: new Date() } })

        const movie = await Movie.findById(movieId);
        const dateTime = {};

        shows.forEach((show) => {
            const date = show.showDateTime.toISOString().split("T")[0];
            if (!dateTime[date]) {
                dateTime[date] = []
            }
            dateTime[date].push({ time: show.showDateTime, showId: show._id })
        })

        res.json({ success: true, movie, dateTime })
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
}