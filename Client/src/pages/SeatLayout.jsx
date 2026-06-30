import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Loading from '../components/Loading'
import { ArrowRightIcon, ClockIcon, TimerIcon, UsersIcon } from 'lucide-react'
import isoTimeFormat from '../lib/isoTimeFormat'
import BlurCircle from '../components/BlurCircle'
import toast from 'react-hot-toast'
import { useAppContext } from '../context/AppContext'
import { assets } from '../assets/assets'

// Map category names to tailwind-compatible colour classes
const CATEGORY_COLORS = {
    'Premium':  { bg: 'bg-yellow-500/20',  border: 'border-yellow-500/60',  selected: 'bg-yellow-500',  dot: 'bg-yellow-400' },
    'Standard': { bg: 'bg-blue-500/20',    border: 'border-blue-500/60',    selected: 'bg-blue-500',    dot: 'bg-blue-400'   },
    'VIP':      { bg: 'bg-purple-500/20',  border: 'border-purple-500/60',  selected: 'bg-purple-500',  dot: 'bg-purple-400' },
    'Economy':  { bg: 'bg-green-500/20',   border: 'border-green-500/60',   selected: 'bg-green-500',   dot: 'bg-green-400'  },
    // Fallback for any other category name
    default:    { bg: 'bg-primary/10',     border: 'border-primary/40',     selected: 'bg-primary',     dot: 'bg-primary'    },
}

const getCategoryColor = (category) => CATEGORY_COLORS[category] || CATEGORY_COLORS.default;

const MAX_SEATS = 5;
const HOLD_TTL_MS = 10 * 60 * 1000;

const SeatLayout = () => {
    const { id, date } = useParams()
    const [searchParams] = useSearchParams()

    const [show, setShow] = useState(null)
    const [seatMap, setSeatMap] = useState([])           // from GET /api/booking/seats/:showId
    const [selectedSeats, setSelectedSeats] = useState([])
    const [selectedTime, setSelectedTime] = useState(null)
    const [holdExpiresAt, setHoldExpiresAt] = useState(null)
    const [countdown, setCountdown] = useState(null)     // seconds remaining
    const [isBooking, setIsBooking] = useState(false)

    // For waitlist pre-selection from email link
    const waitlistSeatId = searchParams.get('waitlist_seat')
    const waitlistShowId = searchParams.get('show')

    const holdRef = useRef({ showId: null, seats: [] })
    const countdownRef = useRef(null)
    const navigate = useNavigate()
    const { axios, getToken, user } = useAppContext()

    // ── Fetch show data (times grouped by date) ──────────────────────────────
    const getShow = async () => {
        try {
            const { data } = await axios.get(`/api/show/${id}`)
            if (data.success) setShow(data)
        } catch (error) {
            console.error(error)
        }
    }

    // ── Fetch full seat map for a given showId ────────────────────────────────
    const fetchSeatMap = async (showId) => {
        try {
            const { data } = await axios.get(`/api/booking/seats/${showId}`)
            if (data.success) setSeatMap(data.seats)
            else toast.error(data.message)
        } catch (error) {
            console.error(error)
        }
    }

    // ── Countdown timer ───────────────────────────────────────────────────────
    const startCountdown = useCallback((expiresAt) => {
        if (countdownRef.current) clearInterval(countdownRef.current)

        const tick = () => {
            const remaining = Math.floor((new Date(expiresAt) - Date.now()) / 1000)
            if (remaining <= 0) {
                clearInterval(countdownRef.current)
                setCountdown(0)
                setHoldExpiresAt(null)
                setSelectedSeats([])
                holdRef.current = { showId: null, seats: [] }
                toast.error('Your seat hold has expired. Please re-select your seats.')
                if (selectedTime) fetchSeatMap(selectedTime.showId)
                return
            }
            setCountdown(remaining)
        }
        tick()
        countdownRef.current = setInterval(tick, 1000)
    }, [selectedTime])

    const formatCountdown = (seconds) => {
        if (seconds === null) return null
        const m = String(Math.floor(seconds / 60)).padStart(2, '0')
        const s = String(seconds % 60).padStart(2, '0')
        return `${m}:${s}`
    }

    // ── Release hold on unmount / beforeunload ────────────────────────────────
    const releaseHold = useCallback(async (showId, seats) => {
        if (!showId || seats.length === 0) return
        try {
            await axios.post('/api/booking/release',
                { showId, selectedSeats: seats },
                { headers: { Authorization: `Bearer ${await getToken()}` } }
            )
        } catch { /* silent — best effort */ }
    }, [axios, getToken])

    useEffect(() => {
        const handleUnload = () => {
            const { showId, seats } = holdRef.current
            if (showId && seats.length > 0) {
                navigator.sendBeacon(
                    `${axios.defaults.baseURL}/api/booking/release`,
                    new Blob([JSON.stringify({ showId, selectedSeats: seats })], { type: 'application/json' })
                )
            }
        }
        window.addEventListener('beforeunload', handleUnload)
        return () => {
            window.removeEventListener('beforeunload', handleUnload)
            clearInterval(countdownRef.current)
            const { showId, seats } = holdRef.current
            releaseHold(showId, seats)
        }
    }, [releaseHold])

    // ── Seat click → call hold endpoint ──────────────────────────────────────
    const handleSeatClick = async (seat) => {
        if (!user) return toast.error('Please log in to select seats')
        if (!selectedTime) return toast('Please select a showtime first')
        if (seat.status === 'booked') return  // no toast — visually obvious
        if (seat.status === 'held') return toast('This seat is currently held by someone else')

        const isSelected = selectedSeats.includes(seat.seatId)

        // Deselect
        if (isSelected) {
            const newSelected = selectedSeats.filter(s => s !== seat.seatId)
            setSelectedSeats(newSelected)

            // Release just this one seat
            await releaseHold(selectedTime.showId, [seat.seatId])
            holdRef.current.seats = newSelected

            if (newSelected.length === 0) {
                setHoldExpiresAt(null)
                setCountdown(null)
                if (countdownRef.current) clearInterval(countdownRef.current)
            }
            return
        }

        // Enforce max seats
        if (selectedSeats.length >= MAX_SEATS) {
            return toast(`You can only select up to ${MAX_SEATS} seats`)
        }

        const newSelected = [...selectedSeats, seat.seatId]

        // Call hold endpoint
        try {
            const { data } = await axios.post('/api/booking/hold',
                { showId: selectedTime.showId, selectedSeats: newSelected },
                { headers: { Authorization: `Bearer ${await getToken()}` } }
            )

            if (data.success) {
                setSelectedSeats(newSelected)
                holdRef.current = { showId: selectedTime.showId, seats: newSelected }
                setHoldExpiresAt(data.holdExpiresAt)
                startCountdown(data.holdExpiresAt)
            } else {
                toast.error(data.message)
                // Refresh seat map to reflect current state
                fetchSeatMap(selectedTime.showId)
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    // ── Proceed to checkout ───────────────────────────────────────────────────
    const bookTickets = async () => {
        if (!user) return toast.error('Please log in to proceed')
        if (!selectedTime || selectedSeats.length === 0) return toast.error('Please select a showtime and seats')
        if (countdown !== null && countdown <= 0) return toast.error('Your hold has expired. Please re-select seats.')

        setIsBooking(true)
        try {
            const { data } = await axios.post('/api/booking/create',
                { showId: selectedTime.showId, selectedSeats },
                { headers: { Authorization: `Bearer ${await getToken()}` } }
            )

            if (data.success) {
                holdRef.current = { showId: null, seats: [] } // prevent release on unmount
                window.location.href = data.url
            } else {
                toast.error(data.message)
                fetchSeatMap(selectedTime.showId)
            }
        } catch (error) {
            toast.error(error.message)
        }
        setIsBooking(false)
    }

    // ── Showtime selection ────────────────────────────────────────────────────
    const handleTimeSelect = async (item) => {
        // Release previous hold if switching times
        if (holdRef.current.showId && holdRef.current.seats.length > 0) {
            await releaseHold(holdRef.current.showId, holdRef.current.seats)
            holdRef.current = { showId: null, seats: [] }
        }
        setSelectedSeats([])
        setHoldExpiresAt(null)
        setCountdown(null)
        if (countdownRef.current) clearInterval(countdownRef.current)

        setSelectedTime(item)
    }

    // ── Effects ───────────────────────────────────────────────────────────────
    useEffect(() => { getShow() }, [])

    useEffect(() => {
        if (selectedTime) fetchSeatMap(selectedTime.showId)
    }, [selectedTime])

    // Handle waitlist offer pre-selection
    useEffect(() => {
        if (waitlistSeatId && waitlistShowId && show && !selectedTime) {
            // Find and auto-select the offered showtime
            const allTimes = Object.values(show.dateTime || {}).flat()
            const matchingTime = allTimes.find(t => t.showId === waitlistShowId)
            if (matchingTime) handleTimeSelect(matchingTime)
        }
    }, [show, waitlistSeatId, waitlistShowId])

    // ── Render helpers ────────────────────────────────────────────────────────
    const groupedSeats = () => {
        const byRow = {}
        for (const seat of seatMap) {
            if (!byRow[seat.row]) byRow[seat.row] = []
            byRow[seat.row].push(seat)
        }
        return byRow
    }

    const currency = import.meta.env.VITE_CURRENCY || '$'

    // Collect unique categories for the legend
    const categories = [...new Map(seatMap.map(s => [s.category, s])).entries()]
        .map(([cat, sample]) => ({ category: cat, price: sample.price }))
        .sort((a, b) => b.price - a.price)

    const totalAmount = selectedSeats.reduce((sum, sid) => {
        const seat = seatMap.find(s => s.seatId === sid)
        return sum + (seat?.price || 0)
    }, 0)

    if (!show) return <Loading />

    const rows = groupedSeats()

    return (
        <div className='flex flex-col md:flex-row px-6 md:px-16 lg:px-40 py-30 md:pt-50 gap-8'>
            {/* ── Sidebar: Times ──────────────────────────────────────────── */}
            <div className='w-64 shrink-0'>
                <div className='bg-primary/10 border border-primary/20 rounded-lg py-8 h-max md:sticky md:top-30'>
                    <p className='text-lg font-semibold px-6 mb-4'>Available Timings</p>
                    <div className='space-y-1'>
                        {show.dateTime[date]?.map((item) => (
                            <div key={item.time}
                                onClick={() => handleTimeSelect(item)}
                                className={`flex items-center gap-2 px-6 py-2 rounded-r-md cursor-pointer transition ${selectedTime?.time === item.time ? "bg-primary text-white" : "hover:bg-primary/20"}`}>
                                <ClockIcon className="w-4 h-4" />
                                <p className='text-sm'>{isoTimeFormat(item.time)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Legend */}
                {seatMap.length > 0 && (
                    <div className='mt-6 bg-primary/5 border border-primary/10 rounded-lg p-4'>
                        <p className='text-sm font-semibold mb-3 text-gray-300'>Categories & Pricing</p>
                        <div className='space-y-2'>
                            {categories.map(({ category, price }) => {
                                const colors = getCategoryColor(category)
                                return (
                                    <div key={category} className='flex items-center justify-between'>
                                        <div className='flex items-center gap-2'>
                                            <div className={`w-3 h-3 rounded-sm ${colors.dot}`} />
                                            <span className='text-xs text-gray-300'>{category}</span>
                                        </div>
                                        <span className='text-xs font-medium'>{currency}{price}</span>
                                    </div>
                                )
                            })}
                            <hr className='border-white/10 my-2' />
                            <div className='flex items-center gap-2'>
                                <div className='w-3 h-3 rounded-sm bg-red-900/60 border border-red-700/60' />
                                <span className='text-xs text-gray-400'>Booked</span>
                            </div>
                            <div className='flex items-center gap-2'>
                                <div className='w-3 h-3 rounded-sm bg-gray-700/60 border border-gray-600/60' />
                                <span className='text-xs text-gray-400'>Held</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Main: Seat map ──────────────────────────────────────────── */}
            <div className='relative flex-1 flex flex-col items-center'>
                <BlurCircle top="-100px" left="-100px" />
                <BlurCircle bottom="0" right="0" />

                <h1 className='text-2xl font-semibold mb-4'>Select Your Seat</h1>
                <img src={assets.screenImage} alt="screen" className='max-w-xs w-full' />
                <p className='text-gray-400 text-xs mb-8 tracking-widest'>SCREEN THIS WAY</p>

                {!selectedTime && (
                    <div className='flex flex-col items-center gap-3 py-16 text-gray-500'>
                        <ClockIcon className='w-10 h-10 opacity-40' />
                        <p>Select a showtime to view available seats</p>
                    </div>
                )}

                {selectedTime && seatMap.length === 0 && <Loading />}

                {selectedTime && seatMap.length > 0 && (
                    <div className='w-full max-w-2xl'>
                        {Object.entries(rows).map(([row, seats]) => {
                            const rowCategory = seats[0]?.category
                            const colors = getCategoryColor(rowCategory)
                            return (
                                <div key={row} className='flex items-center gap-3 mb-2'>
                                    {/* Row label */}
                                    <div className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center shrink-0 ${colors.dot} text-black`}>
                                        {row}
                                    </div>
                                    {/* Seats */}
                                    <div className='flex flex-wrap gap-1.5'>
                                        {seats.map(seat => {
                                            const isSelected = selectedSeats.includes(seat.seatId)
                                            const isBooked = seat.status === 'booked'
                                            const isHeld = seat.status === 'held'

                                            let btnClass = `relative h-8 w-10 text-xs rounded flex items-center justify-center transition-all font-medium `

                                            if (isBooked) {
                                                btnClass += 'bg-red-900/60 border border-red-700/60 text-red-400 cursor-not-allowed'
                                            } else if (isHeld) {
                                                btnClass += 'bg-gray-700/60 border border-gray-600/60 text-gray-500 cursor-not-allowed'
                                            } else if (isSelected) {
                                                btnClass += `${colors.selected} border border-transparent text-white cursor-pointer scale-105 shadow-lg`
                                            } else {
                                                btnClass += `${colors.bg} border ${colors.border} text-gray-200 cursor-pointer hover:scale-105 hover:brightness-125`
                                            }

                                            return (
                                                <button
                                                    key={seat.seatId}
                                                    id={`seat-${seat.seatId}`}
                                                    onClick={() => !isBooked && !isHeld && handleSeatClick(seat)}
                                                    disabled={isBooked || isHeld}
                                                    title={`${seat.seatId} — ${seat.category} — ${currency}${seat.price}${isBooked ? ' (Booked)' : isHeld ? ' (Held)' : ''}`}
                                                    className={btnClass}
                                                >
                                                    {seat.seatId}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* ── Hold countdown + selection summary ────────────────── */}
                {selectedSeats.length > 0 && (
                    <div className='mt-10 w-full max-w-sm bg-primary/10 border border-primary/20 rounded-xl p-5 space-y-3'>
                        {/* Countdown */}
                        {countdown !== null && (
                            <div className={`flex items-center gap-2 text-sm font-medium ${countdown < 60 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
                                <TimerIcon className='w-4 h-4' />
                                <span>Seats held for: <strong>{formatCountdown(countdown)}</strong></span>
                            </div>
                        )}

                        {/* Selected seats */}
                        <div className='flex items-center gap-2 text-sm text-gray-300'>
                            <UsersIcon className='w-4 h-4 text-primary' />
                            <span>{selectedSeats.length}/{MAX_SEATS} seats selected: {selectedSeats.join(', ')}</span>
                        </div>

                        {/* Amount */}
                        <div className='flex items-center justify-between pt-2 border-t border-primary/20'>
                            <span className='text-gray-400 text-sm'>Total</span>
                            <span className='text-xl font-bold text-primary'>{currency}{totalAmount}</span>
                        </div>

                        <button
                            onClick={bookTickets}
                            disabled={isBooking || countdown === 0}
                            className='w-full flex items-center justify-center gap-2 py-3 text-sm bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            {isBooking ? 'Processing...' : 'Proceed to Checkout'}
                            <ArrowRightIcon strokeWidth={3} className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Waitlist notice */}
                {selectedTime && seatMap.length > 0 && (() => {
                    const categoriesMap = {}
                    seatMap.forEach(s => {
                        if (!categoriesMap[s.category]) categoriesMap[s.category] = { total: 0, available: 0 }
                        categoriesMap[s.category].total++
                        if (s.status === 'available') categoriesMap[s.category].available++
                    })
                    const soldOut = Object.entries(categoriesMap).filter(([, v]) => v.available === 0)
                    if (soldOut.length === 0) return null
                    return (
                        <div className='mt-6 w-full max-w-sm bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4'>
                            <p className='text-yellow-400 text-sm font-medium mb-2'>Sold-out categories</p>
                            {soldOut.map(([category]) => (
                                <JoinWaitlistButton
                                    key={category}
                                    category={category}
                                    showId={selectedTime.showId}
                                    user={user}
                                    axios={axios}
                                    getToken={getToken}
                                />
                            ))}
                        </div>
                    )
                })()}
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Small sub-component for joining the waitlist
// ─────────────────────────────────────────────────────────────────────────────
const JoinWaitlistButton = ({ category, showId, user, axios, getToken }) => {
    const [joined, setJoined] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleJoin = async () => {
        if (!user) return toast.error('Please log in to join the waitlist')
        setLoading(true)
        try {
            const { data } = await axios.post('/api/booking/waitlist',
                { showId, category },
                { headers: { Authorization: `Bearer ${await getToken()}` } }
            )
            if (data.success) {
                setJoined(true)
                toast.success(`You're on the waitlist for ${category}!`)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        }
        setLoading(false)
    }

    return (
        <div className='flex items-center justify-between py-1'>
            <span className='text-sm text-gray-300'>{category}</span>
            <button
                onClick={handleJoin}
                disabled={joined || loading}
                className='text-xs px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/30 transition disabled:opacity-50 cursor-pointer'
            >
                {joined ? '✓ On waitlist' : loading ? 'Joining...' : 'Join Waitlist'}
            </button>
        </div>
    )
}

export default SeatLayout
