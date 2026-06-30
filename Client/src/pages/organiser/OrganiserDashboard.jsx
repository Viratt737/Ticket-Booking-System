import React, { useEffect, useState } from 'react'
import { useAppContext } from '../../context/AppContext'
import Title from '../../components/admin/Title'
import Loading from '../../components/Loading'
import BlurCircle from '../../components/BlurCircle'
import { dateFormat } from '../../lib/dateFormat'

const OrganiserDashboard = () => {
  const { axios, getToken } = useAppContext()
  const currency = import.meta.env.VITE_CURRENCY

  const [summary, setSummary] = useState({ eventSummary: [], totalRevenue: 0, totalShows: 0 })
  const [loading, setLoading] = useState(true)

  const fetchDashboard = async () => {
    try {
      const { data } = await axios.get('/api/organiser/dashboard', { headers: { Authorization: `Bearer ${await getToken()}` } })
      if (data.success) setSummary(data)
    } catch (error) {
      console.error(error)
    }
    setLoading(false)
  }

  useEffect(() => { fetchDashboard() }, [])

  if (loading) return <Loading />

  return (
    <div>
      <Title text1="My" text2="Events" />

      <div className='relative flex flex-wrap gap-4 mt-6'>
        <BlurCircle top="-100px" left="0" />
        <div className='flex items-center justify-between px-4 py-3 bg-primary/10 border border-primary/20 rounded-md max-w-50 w-full'>
          <div><h1 className='text-sm'>Total Revenue</h1><p className='text-xl font-medium mt-1'>{currency}{summary.totalRevenue}</p></div>
        </div>
        <div className='flex items-center justify-between px-4 py-3 bg-primary/10 border border-primary/20 rounded-md max-w-50 w-full'>
          <div><h1 className='text-sm'>Total Shows</h1><p className='text-xl font-medium mt-1'>{summary.totalShows}</p></div>
        </div>
      </div>

      <div className='max-w-4xl mt-10 overflow-x-auto'>
        <table className='w-full border-collapse rounded-md overflow-hidden text-nowrap'>
          <thead>
            <tr className='bg-primary/20 text-left text-white'>
              <th className='p-2 font-medium pl-5'>Movie</th>
              <th className='p-2 font-medium'>Venue</th>
              <th className='p-2 font-medium'>Show Time</th>
              <th className='p-2 font-medium'>Bookings</th>
              <th className='p-2 font-medium'>Revenue</th>
            </tr>
          </thead>
          <tbody className='text-sm font-light'>
            {summary.eventSummary.map((e, i) => (
              <tr key={i} className='border-b border-primary/10 bg-primary/5 even:bg-primary/10'>
                <td className='p-2 min-w-45 pl-5'>{e.movieTitle}</td>
                <td className='p-2'>{e.venueName}</td>
                <td className='p-2'>{dateFormat(e.showDateTime)}</td>
                <td className='p-2'>{e.totalBookings}</td>
                <td className='p-2'>{currency}{e.revenue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default OrganiserDashboard