/**
 * Seed Script — creates a test venue, movie, and upcoming shows
 * Run with: node scripts/seed.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import axios from 'axios';

// ── Connect ────────────────────────────────────────────────────────────────
await mongoose.connect(process.env.MONGODB_URI);
console.log('✅ Connected to MongoDB');

// ── Inline schemas (mirror models exactly) ────────────────────────────────
const VenueSchema = new mongoose.Schema({
    createdBy: String,
    name: String,
    location: String,
    categories: [{ name: String }],
    layout: [{ row: String, seatsInRow: Number, category: String }]
}, { timestamps: true });

const MovieSchema = new mongoose.Schema({
    _id: String,
    title: String,
    overview: String,
    poster_path: String,
    backdrop_path: String,
    genres: Array,
    casts: Array,
    release_date: String,
    original_language: String,
    tagline: String,
    vote_average: Number,
    runtime: Number,
});

const SeatSchema = new mongoose.Schema({
    seatId: String,
    row: String,
    category: String,
    price: Number,
    status: { type: String, default: 'available' },
    heldBy: { type: String, default: null },
    holdExpiresAt: { type: Date, default: null },
    bookedBy: { type: String, default: null }
}, { _id: false });

const ShowSchema = new mongoose.Schema({
    movie: String,
    venue: mongoose.Schema.Types.ObjectId,
    organiser: String,
    showDateTime: Date,
    showPrice: Number,
    categoryPricing: [{ category: String, price: Number }],
    seats: [SeatSchema]
}, { minimize: false });

const Venue = mongoose.models.Venue || mongoose.model('Venue', VenueSchema);
const Movie = mongoose.models.Movie || mongoose.model('Movie', MovieSchema);
const Show = mongoose.models.Show || mongoose.model('Show', ShowSchema);

// ── 1. Venue ───────────────────────────────────────────────────────────────
console.log('\n📍 Creating venue...');
const venue = await Venue.create({
    createdBy: 'seed-admin',
    name: 'QuickShow Cineplex',
    location: 'Mumbai, Maharashtra',
    categories: [{ name: 'Premium' }, { name: 'Standard' }, { name: 'Economy' }],
    layout: [
        { row: 'A', seatsInRow: 10, category: 'Premium' },
        { row: 'B', seatsInRow: 10, category: 'Premium' },
        { row: 'C', seatsInRow: 12, category: 'Standard' },
        { row: 'D', seatsInRow: 12, category: 'Standard' },
        { row: 'E', seatsInRow: 12, category: 'Standard' },
        { row: 'F', seatsInRow: 14, category: 'Economy' },
        { row: 'G', seatsInRow: 14, category: 'Economy' },
        { row: 'H', seatsInRow: 14, category: 'Economy' },
    ]
});
console.log(`   → Created venue: "${venue.name}" (${venue._id})`);

// ── 2. Fetch popular movies from TMDB ─────────────────────────────────────
console.log('\n🎬 Fetching movies from TMDB...');

const TMDB_KEY = process.env.TMDB_API_KEY;
if (!TMDB_KEY || TMDB_KEY.includes('Enter')) {
    console.error('❌ TMDB_API_KEY is not set in Server/.env — add it and re-run');
    process.exit(1);
}

const moviesRes = await axios.get('https://api.themoviedb.org/3/movie/now_playing', {
    headers: { Authorization: `Bearer ${TMDB_KEY}` }
});

// Take first 5 movies
const tmdbMovies = moviesRes.data.results.slice(0, 5);

const moviePricing = [
    { category: 'Premium', price: 300 },
    { category: 'Standard', price: 200 },
    { category: 'Economy', price: 120 }
];

// Build seat array from layout
function buildSeats(layout, pricing) {
    const priceMap = Object.fromEntries(pricing.map(p => [p.category, p.price]));
    const seats = [];
    for (const row of layout) {
        for (let i = 1; i <= row.seatsInRow; i++) {
            seats.push({
                seatId: `${row.row}${i}`,
                row: row.row,
                category: row.category,
                price: priceMap[row.category] ?? 0,
                status: 'available',
                heldBy: null,
                holdExpiresAt: null,
                bookedBy: null
            });
        }
    }
    return seats;
}

const seats = buildSeats(venue.layout, moviePricing);

// ── 3. Create movies + shows ───────────────────────────────────────────────
const showsCreated = [];
const now = new Date();

for (const tmdb of tmdbMovies) {
    // Fetch full movie details
    const [detailRes, creditsRes] = await Promise.all([
        axios.get(`https://api.themoviedb.org/3/movie/${tmdb.id}`, {
            headers: { Authorization: `Bearer ${TMDB_KEY}` }
        }),
        axios.get(`https://api.themoviedb.org/3/movie/${tmdb.id}/credits`, {
            headers: { Authorization: `Bearer ${TMDB_KEY}` }
        })
    ]);

    const md = detailRes.data;
    const mc = creditsRes.data;

    // Upsert movie
    await Movie.findByIdAndUpdate(
        String(tmdb.id),
        {
            _id: String(tmdb.id),
            title: md.title,
            overview: md.overview,
            poster_path: md.poster_path,
            backdrop_path: md.backdrop_path,
            genres: md.genres,
            casts: mc.cast.slice(0, 10),
            release_date: md.release_date,
            original_language: md.original_language,
            tagline: md.tagline || '',
            vote_average: md.vote_average,
            runtime: md.runtime
        },
        { upsert: true, new: true }
    );

    // Create 3 upcoming shows (different days and times)
    const showSlots = [
        new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // tomorrow
        new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // day after
        new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days
    ];

    // Set specific times (10:00, 14:00, 19:00)
    const times = [10, 14, 19];
    for (let i = 0; i < 3; i++) {
        const dt = new Date(showSlots[i]);
        dt.setHours(times[i], 0, 0, 0);

        await Show.create({
            movie: String(tmdb.id),
            venue: venue._id,
            organiser: 'seed-admin',
            showDateTime: dt,
            showPrice: 200,
            categoryPricing: moviePricing,
            seats: seats.map(s => ({ ...s }))
        });
        showsCreated.push(`${md.title} @ ${dt.toLocaleString('en-IN')}`);
    }

    console.log(`   → ${md.title} (${tmdb.id}) — 3 shows created`);
}

console.log(`\n✅ Seed complete!`);
console.log(`   Venue: ${venue.name} (${venue._id})`);
console.log(`   Movies seeded: ${tmdbMovies.length}`);
console.log(`   Total shows: ${showsCreated.length}`);
console.log('\n🔗 Open http://localhost:5173/movies to see the movies\n');

await mongoose.disconnect();
