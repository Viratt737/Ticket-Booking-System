import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../../context/AppContext'
import toast from 'react-hot-toast'
import BlurCircle from '../../components/BlurCircle'

const OrganiserOnboard = () => {
  const { axios, getToken, fetchIsOrganiser, isOrganiser } = useAppContext()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    try {
      setLoading(true)
      const { data } = await axios.post('/api/organiser/register', {}, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      if (data.success) {
        toast.success(data.message)
        await fetchIsOrganiser()
        navigate('/organiser')
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      toast.error(error.message)
    }
    setLoading(false)
  }

  return (
    <div className='relative flex flex-col items-center justify-center min-h-[70vh] px-6 text-center'>
      <BlurCircle top="0" left="0" />
      <h1 className='text-3xl font-semibold'>Become an Organiser</h1>
      <p className='text-gray-400 mt-3 max-w-md'>
        Create show listings on available venues, set your own per-category pricing, and track bookings and revenue from your own dashboard.
      </p>
      {isOrganiser ? (
        <button onClick={() => navigate('/organiser')}
          className='mt-8 px-8 py-3 bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'>
          Go to Dashboard
        </button>
      ) : (
        <button onClick={handleRegister} disabled={loading}
          className='mt-8 px-8 py-3 bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'>
          {loading ? 'Registering...' : 'Register as Organiser'}
        </button>
      )}
    </div>
  )
}

export default OrganiserOnboard