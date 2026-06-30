import React, { useEffect, useState } from 'react'
import Loading from '../components/Loading'
import BlurCircle from '../components/BlurCircle'
import timeFormat from '../lib/timeFormat'
import { dateFormat } from '../lib/dateFormat'
import { useAppContext } from '../context/AppContext'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { XCircleIcon } from 'lucide-react'

const STATUS_BADGE = {
    confirmed: 'bg-green-500/20 text-green-400 border-green-500/40',
    pending:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/40',
}

const MyBookings = () => {
    const currency = import.meta.env.VITE_CURRENCY

    const { axios, getToken, user, image_base_url } = useAppContext()

    const [bookings, setBookings] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [cancellingId, setCancellingId] = useState(null)

    const getMyBookings = async () => {
        try {
            const { data } = await axios.get('/api/user/bookings', {
                headers: { Authorization: `Bearer ${await getToken()}` }
            })
            if (data.success) {
                setBookings(data.bookings)
            }
        } catch (error) {
            console.error(error)
        }
        setIsLoading(false)
    }

    const handleCancel = async (bookingId) => {
        if (!window.confirm('Are you sure you want to cancel this booking? This action cannot be undone.')) return

        setCancellingId(bookingId)
        try {
            const { data } = await axios.post(`/api/booking/cancel/${bookingId}`, {}, {
                headers: { Authorization: `Bearer ${await getToken()}` }
            })
            if (data.success) {
                toast.success('Booking cancelled successfully')
                getMyBookings()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        }
        setCancellingId(null)
    }

    useEffect(() => {
        if (user) {
            getMyBookings()
        }
    }, [user])

    return !isLoading ? (
        <div className='relative px-6 md:px-16 lg:px-40 pt-30 md:pt-40 min-h-[80vh]'>
            <BlurCircle top="100px" left="100px" />
            <div>
                <BlurCircle bottom="0px" left="600px" />
            </div>
            <h1 className='text-2xl font-semibold mb-6'>My Bookings</h1>

            {bookings.length === 0 && (
                <p className='text-gray-400'>No bookings yet. <Link to="/movies" className='text-primary hover:underline'>Browse shows</Link></p>
            )}

            {bookings.map((item, index) => (
                <div key={index} className={`flex flex-col md:flex-row justify-between rounded-xl mt-4 p-3 max-w-3xl border transition
                    ${item.status === 'cancelled'
                        ? 'bg-red-900/5 border-red-500/20 opacity-70'
                        : 'bg-primary/8 border-primary/20 hover:border-primary/40'}`}>

                    <div className='flex flex-col md:flex-row gap-3'>
                        <img
                            src={image_base_url + item.show.movie.poster_path}
                            alt={item.show.movie.title}
                            className='md:max-w-40 aspect-video h-auto object-cover object-bottom rounded-lg'
                        />
                        <div className='flex flex-col p-2 gap-1'>
                            <div className='flex items-center gap-3 flex-wrap'>
                                <p className='text-lg font-semibold'>{item.show.movie.title}</p>
                                {/* Status badge */}
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE[item.status] || STATUS_BADGE.pending}`}>
                                    {item.status === 'confirmed' ? '✓ Confirmed'
                                        : item.status === 'cancelled' ? '✗ Cancelled'
                                            : '⏳ Pending Payment'}
                                </span>
                            </div>
                            <p className='text-gray-400 text-sm'>{timeFormat(item.show.movie.runtime)}</p>
                            <p className='text-gray-400 text-sm'>{dateFormat(item.show.showDateTime)}</p>
                            {item.show.venue && (
                                <p className='text-gray-500 text-xs'>📍 {item.show.venue.name}</p>
                            )}
                        </div>
                    </div>

                    <div className='flex flex-col md:items-end md:text-right justify-between p-2 gap-3'>
                        <div>
                            <p className='text-2xl font-semibold'>{currency}{item.amount}</p>
                            {!item.isPaid && item.status !== 'cancelled' && (
                                <Link to={item.paymentLink} className='mt-1 inline-block bg-primary px-4 py-1.5 text-sm rounded-full font-medium cursor-pointer hover:bg-primary-dull transition'>
                                    Pay Now
                                </Link>
                            )}
                        </div>

                        <div className='text-sm space-y-1'>
                            <p><span className='text-gray-400'>Tickets:</span> {item.bookedSeats.length}</p>
                            <p><span className='text-gray-400'>Seats:</span> {item.bookedSeats.join(', ')}</p>
                        </div>

                        {/* Cancel button — only for confirmed, non-cancelled bookings */}
                        {item.isPaid && item.status === 'confirmed' && (
                            <button
                                id={`cancel-booking-${item._id}`}
                                onClick={() => handleCancel(item._id)}
                                disabled={cancellingId === item._id}
                                className='flex items-center gap-1.5 text-xs text-red-400 border border-red-500/40 rounded-full px-3 py-1.5 hover:bg-red-500/10 transition cursor-pointer disabled:opacity-50'
                            >
                                <XCircleIcon className='w-3.5 h-3.5' />
                                {cancellingId === item._id ? 'Cancelling...' : 'Cancel Booking'}
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    ) : <Loading />
}

export default MyBookings
