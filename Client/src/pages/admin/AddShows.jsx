import React, { useEffect, useState } from 'react'
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import { CheckIcon, DeleteIcon, StarIcon } from 'lucide-react';
import { kConverter } from '../../lib/kConverter';
import { useAppContext } from '../../context/AppContext';
import toast from 'react-hot-toast';

const AddShows = () => {

    const { axios, getToken, user, image_base_url } = useAppContext()

    const currency = import.meta.env.VITE_CURRENCY
    const [nowPlayingMovies, setNowPlayingMovies] = useState([]);
    const [selectedMovie, setSelectedMovie] = useState(null);
    const [venues, setVenues] = useState([]);
    const [selectedVenue, setSelectedVenue] = useState(null);
    const [dateTimeSelection, setDateTimeSelection] = useState({});
    const [dateTimeInput, setDateTimeInput] = useState("");
    const [prices, setPrices] = useState({});
    const [addingShow, setAddingShow] = useState(false)

    const fetchData = async () => {
        try {
            const [moviesRes, venuesRes] = await Promise.all([
                axios.get('/api/show/now-playing', { headers: { Authorization: `Bearer ${await getToken()}` } }),
                axios.get('/api/venue/all')
            ])
            if (moviesRes.data.success) setNowPlayingMovies(moviesRes.data.movies)
            if (venuesRes.data.success) setVenues(venuesRes.data.venues)
        } catch (error) {
            console.error('Error fetching data:', error)
        }
    };

    const handleVenueChange = (id) => {
        const venue = venues.find(v => v._id === id) || null;
        setSelectedVenue(venue);
        const initPrices = {};
        venue?.categories.forEach(c => initPrices[c.name] = "");
        setPrices(initPrices);
    };

    const handleDateTimeAdd = () => {
        if (!dateTimeInput) return;
        const [date, time] = dateTimeInput.split("T");
        if (!date || !time) return;

        setDateTimeSelection((prev) => {
            const times = prev[date] || [];
            if (!times.includes(time)) {
                return { ...prev, [date]: [...times, time] };
            }
            return prev;
        });
    };

    const handleRemoveTime = (date, time) => {
        setDateTimeSelection((prev) => {
            const filteredTimes = prev[date].filter((t) => t !== time);
            if (filteredTimes.length === 0) {
                const { [date]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [date]: filteredTimes };
        });
    };

    const handleSubmit = async () => {
        try {
            setAddingShow(true)

            if (!selectedMovie || !selectedVenue || Object.keys(dateTimeSelection).length === 0 || Object.values(prices).some(p => !p)) {
                return toast.error('Please select a movie, venue, date/time, and fill all category prices');
            }

            const showsInput = Object.entries(dateTimeSelection).map(([date, time]) => ({ date, time }));
            const categoryPricing = Object.entries(prices).map(([category, price]) => ({ category, price: Number(price) }));

            const payload = {
                movieId: selectedMovie,
                venueId: selectedVenue._id,
                showsInput,
                categoryPricing,
                showPrice: categoryPricing[0]?.price || 0
            }

            const { data } = await axios.post('/api/show/add', payload, { headers: { Authorization: `Bearer ${await getToken()}` } })

            if (data.success) {
                toast.success(data.message)
                setSelectedMovie(null)
                setDateTimeSelection({})
                setSelectedVenue(null)
                setPrices({})
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.error("Submission error:", error);
            toast.error('An error occurred. Please try again.')
        }
        setAddingShow(false)
    }

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user]);

    return nowPlayingMovies.length > 0 ? (
        <>
            <Title text1="Add" text2="Shows" />
            <p className="mt-10 text-lg font-medium">Now Playing Movies</p>
            <div className="overflow-x-auto pb-4">
                <div className="group flex flex-wrap gap-4 mt-4 w-max">
                    {nowPlayingMovies.map((movie) => (
                        <div key={movie.id} className={`relative max-w-40 cursor-pointer group-hover:not-hover:opacity-40 hover:-translate-y-1 transition duration-300`} onClick={() => setSelectedMovie(movie.id)}>
                            <div className="relative rounded-lg overflow-hidden">
                                <img src={image_base_url + movie.poster_path} alt="" className="w-full object-cover brightness-90" />
                                <div className="text-sm flex items-center justify-between p-2 bg-black/70 w-full absolute bottom-0 left-0">
                                    <p className="flex items-center gap-1 text-gray-400">
                                        <StarIcon className="w-4 h-4 text-primary fill-primary" />
                                        {movie.vote_average.toFixed(1)}
                                    </p>
                                    <p className="text-gray-300">{kConverter(movie.vote_count)} Votes</p>
                                </div>
                            </div>
                            {selectedMovie === movie.id && (
                                <div className="absolute top-2 right-2 flex items-center justify-center bg-primary h-6 w-6 rounded">
                                    <CheckIcon className="w-4 h-4 text-white" strokeWidth={2.5} />
                                </div>
                            )}
                            <p className="font-medium truncate">{movie.title}</p>
                            <p className="text-gray-400 text-sm">{movie.release_date}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Venue Selection */}
            <div className="mt-8">
                <label className="block text-sm font-medium mb-2">Venue</label>
                {venues.length === 0
                    ? <p className="text-gray-400 text-sm">No venues found. Create one in Venue Manager first.</p>
                    : <select onChange={e => handleVenueChange(e.target.value)} value={selectedVenue?._id || ""}
                        className="bg-gray-800 px-4 py-2 rounded outline-none w-full max-w-sm">
                        <option value="">Select a venue</option>
                        {venues.map(v => <option key={v._id} value={v._id}>{v.name} — {v.location}</option>)}
                    </select>
                }
            </div>

            {/* Category Pricing */}
            {selectedVenue && (
                <div className="mt-6">
                    <label className="block text-sm font-medium mb-2">Pricing per Category ({currency})</label>
                    <div className="max-w-sm space-y-2">
                        {selectedVenue.categories.map(c => (
                            <div key={c.name} className="flex items-center gap-3">
                                <span className="w-28 text-sm text-gray-400">{c.name}</span>
                                <input type="number" min={0} value={prices[c.name] || ""} onChange={e => setPrices(p => ({ ...p, [c.name]: e.target.value }))}
                                    placeholder="Price" className="bg-gray-800 px-3 py-1.5 rounded outline-none flex-1 border border-gray-600 focus:border-primary/60" />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Date & Time Selection */}
            <div className="mt-6">
                <label className="block text-sm font-medium mb-2">Select Date and Time</label>
                <div className="inline-flex gap-5 border border-gray-600 p-1 pl-3 rounded-lg">
                    <input type="datetime-local" value={dateTimeInput} onChange={(e) => setDateTimeInput(e.target.value)} className="outline-none rounded-md" />
                    <button onClick={handleDateTimeAdd} className="bg-primary/80 text-white px-3 py-2 text-sm rounded-lg hover:bg-primary cursor-pointer">
                        Add Time
                    </button>
                </div>
            </div>

            {/* Display Selected Times */}
            {Object.keys(dateTimeSelection).length > 0 && (
                <div className="mt-6">
                    <h2 className="mb-2">Selected Date-Times</h2>
                    <ul className="space-y-3">
                        {Object.entries(dateTimeSelection).map(([date, times]) => (
                            <li key={date}>
                                <div className="font-medium">{date}</div>
                                <div className="flex flex-wrap gap-2 mt-1 text-sm">
                                    {times.map((time) => (
                                        <div key={time} className="border border-primary px-2 py-1 flex items-center rounded">
                                            <span>{time}</span>
                                            <DeleteIcon onClick={() => handleRemoveTime(date, time)} width={15} className="ml-2 text-red-500 hover:text-red-700 cursor-pointer" />
                                        </div>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <button onClick={handleSubmit} disabled={addingShow} className="bg-primary text-white px-8 py-2 mt-6 rounded hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50">
                {addingShow ? 'Adding...' : 'Add Show'}
            </button>
        </>
    ) : <Loading />
}

export default AddShows
