import React, { useEffect, useState } from 'react'
import { useAppContext } from '../../context/AppContext'
import toast from 'react-hot-toast'
import Title from '../../components/admin/Title'
import { CheckIcon, StarIcon } from 'lucide-react'
import { kConverter } from '../../lib/kConverter'
import Loading from '../../components/Loading'

const OrganiserAddShow = () => {
  const { axios, getToken, image_base_url } = useAppContext()

  const [nowPlayingMovies, setNowPlayingMovies] = useState([])
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [venues, setVenues] = useState([])
  const [selectedVenue, setSelectedVenue] = useState(null)
  const [showDateTime, setShowDateTime] = useState("")
  const [prices, setPrices] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const [moviesRes, venuesRes] = await Promise.all([
        axios.get('/api/show/now-playing', { headers: { Authorization: `Bearer ${await getToken()}` } }),
        axios.get('/api/venue/all')
      ])
      if (moviesRes.data.success) setNowPlayingMovies(moviesRes.data.movies)
      if (venuesRes.data.success) setVenues(venuesRes.data.venues)
    } catch (error) {
      console.error(error)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleVenueChange = (id) => {
    const venue = venues.find(v => v._id === id)
    setSelectedVenue(venue)
    const initPrices = {}
    venue?.categories.forEach(c => initPrices[c.name] = "")
    setPrices(initPrices)
  }

  const handleSubmit = async () => {
    try {
      if (!selectedMovie || !selectedVenue || !showDateTime || Object.values(prices).some(p => !p)) {
        return toast.error("Select a movie, venue, date/time, and fill all category prices")
      }
      setSubmitting(true)
      const categoryPricing = Object.entries(prices).map(([category, price]) => ({ category, price: Number(price) }))

      const { data } = await axios.post('/api/organiser/show', {
        movieId: selectedMovie, venueId: selectedVenue._id, showDateTime, categoryPricing
      }, { headers: { Authorization: `Bearer ${await getToken()}` } })

      if (data.success) {
        toast.success(data.message)
        setSelectedMovie(null); setShowDateTime(""); setSelectedVenue(null); setPrices({})
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      toast.error(error.message)
    }
    setSubmitting(false)
  }

  if (loading) return <Loading />
  if (venues.length === 0) return <p className='text-gray-400'>No venues available yet. Ask an admin to create one first.</p>

  return (
    <div className='max-w-3xl'>
      <Title text1="Create" text2="Show" />

      <p className='mt-8 text-sm font-medium'>Select Movie</p>
      <div className='overflow-x-auto pb-4'>
        <div className='flex flex-wrap gap-4 mt-3 w-max'>
          {nowPlayingMovies.map((movie) => (
            <div key={movie.id} className='relative max-w-36 cursor-pointer hover:-translate-y-1 transition duration-300' onClick={() => setSelectedMovie(movie.id)}>
              <div className='relative rounded-lg overflow-hidden'>
                <img src={image_base_url + movie.poster_path} alt="" className='w-full object-cover brightness-90' />
                <div className='text-xs flex items-center justify-between p-2 bg-black/70 w-full absolute bottom-0 left-0'>
                  <p className='flex items-center gap-1 text-gray-400'>
                    <StarIcon className='w-3.5 h-3.5 text-primary fill-primary' />
                    {movie.vote_average.toFixed(1)}
                  </p>
                  <p className='text-gray-300'>{kConverter(movie.vote_count)} Votes</p>
                </div>
              </div>
              {selectedMovie === movie.id && (
                <div className='absolute top-2 right-2 flex items-center justify-center bg-primary h-6 w-6 rounded'>
                  <CheckIcon className='w-4 h-4 text-white' strokeWidth={2.5} />
                </div>
              )}
              <p className='text-sm truncate mt-1'>{movie.title}</p>
            </div>
          ))}
        </div>
      </div>

      <p className='mt-8 text-sm font-medium'>Venue</p>
      <select onChange={e => handleVenueChange(e.target.value)} value={selectedVenue?._id || ""}
        className='bg-gray-800 px-4 py-2 rounded outline-none w-full max-w-sm mt-2'>
        <option value="">Select a venue</option>
        {venues.map(v => <option key={v._id} value={v._id}>{v.name} — {v.location}</option>)}
      </select>

      <p className='mt-8 text-sm font-medium'>Show Date & Time</p>
      <input type="datetime-local" value={showDateTime} onChange={e => setShowDateTime(e.target.value)}
        className='bg-gray-800 px-4 py-2 rounded outline-none w-full max-w-sm mt-2' />

      {selectedVenue && (
        <>
          <p className='mt-8 text-sm font-medium'>Pricing per category</p>
          <div className='max-w-sm'>
            {selectedVenue.categories.map(c => (
              <div key={c.name} className='flex items-center gap-3 mt-2'>
                <span className='w-24 text-sm text-gray-400'>{c.name}</span>
                <input type="number" min={0} value={prices[c.name] || ""} onChange={e => setPrices(p => ({ ...p, [c.name]: e.target.value }))}
                  placeholder="Price" className='bg-gray-800 px-3 py-1.5 rounded outline-none flex-1' />
              </div>
            ))}
          </div>
        </>
      )}

      <button onClick={handleSubmit} disabled={submitting}
        className='mt-8 px-8 py-3 bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'>
        {submitting ? "Creating..." : "Create Show"}
      </button>
    </div>
  )
}

export default OrganiserAddShow