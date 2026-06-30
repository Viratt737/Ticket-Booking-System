import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAppContext } from '../../context/AppContext'
import Loading from '../../components/Loading'
import AdminNavbar from '../../components/admin/AdminNavbar'
import OrganiserSidebar from '../../components/organiser/OrganiserSidebar'
import toast from 'react-hot-toast'

const OrganiserLayout = () => {
  const { isOrganiser, fetchIsOrganiser } = useAppContext()
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const check = async () => {
      await fetchIsOrganiser()
      setChecked(true)
    }
    check()
  }, [])

  useEffect(() => {
    if (checked && !isOrganiser) {
      toast.error("You're not registered as an organiser yet")
      navigate('/organiser/onboard')
    }
  }, [checked, isOrganiser])

  if (!checked) return <Loading />

  return isOrganiser ? (
    <>
      <AdminNavbar />
      <div className='flex'>
        <OrganiserSidebar />
        <div className='flex-1 px-4 py-10 md:px-10 h-[calc(100vh-64px)] overflow-y-auto'>
          <Outlet />
        </div>
      </div>
    </>
  ) : <Loading />
}

export default OrganiserLayout