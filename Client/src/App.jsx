import React from 'react'
import Navbar from './components/Navbar'
import { Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Movies from './pages/Movies'
import MovieDetails from './pages/MovieDetails'
import SeatLayout from './pages/SeatLayout'
import MyBookings from './pages/MyBookings'
import Favorite from './pages/Favorite'
import { Toaster } from 'react-hot-toast'
import Footer from './components/Footer'
import Layout from './pages/admin/Layout'
import Dashboard from './pages/admin/Dashboard'
import AddShows from './pages/admin/AddShows'
import ListShows from './pages/admin/ListShows'
import ListBookings from './pages/admin/ListBookings'
import VenueManager from './pages/admin/VenueManager'
import OrganiserLayout from './pages/organiser/OrganiserLayout'
import OrganiserOnboard from './pages/organiser/OrganiserOnboard'
import OrganiserDashboard from './pages/organiser/OrganiserDashboard'
import OrganiserAddShow from './pages/organiser/OrganiserAddShow'
import { useAppContext } from './context/AppContext'
import { SignIn } from '@clerk/clerk-react'
import Loading from './components/Loading'

const App = () => {

  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isOrganiserRoute = location.pathname.startsWith('/organiser') && location.pathname !== '/organiser/onboard'

  const { user } = useAppContext()

  return (
    <>
      <Toaster />
      {!isAdminRoute && !isOrganiserRoute && <Navbar/>}
      <Routes>
        <Route path='/' element={<Home/>} />
        <Route path='/movies' element={<Movies/>} />
        <Route path='/movies/:id' element={<MovieDetails/>} />
        <Route path='/movies/:id/:date' element={<SeatLayout/>} />
        <Route path='/my-bookings' element={<MyBookings/>} />
        <Route path='/loading/:nextUrl' element={<Loading/>} />

        <Route path='/favorite' element={<Favorite/>} />

        <Route path='/organiser/onboard' element={<OrganiserOnboard/>} />
        <Route path='/organiser' element={<OrganiserLayout/>}>
          <Route index element={<OrganiserDashboard/>}/>
          <Route path="add-show" element={<OrganiserAddShow/>}/>
        </Route>

        <Route path='/admin/*' element={user ? <Layout/> : (
          <div className='min-h-screen flex justify-center items-center'>
            <SignIn fallbackRedirectUrl={'/admin'} />
          </div>
        )}>
          <Route index element={<Dashboard/>}/>
          <Route path="add-shows" element={<AddShows/>}/>
          <Route path="list-shows" element={<ListShows/>}/>
          <Route path="list-bookings" element={<ListBookings/>}/>
          <Route path="venues" element={<VenueManager/>}/>
        </Route>
      </Routes>
       {!isAdminRoute && !isOrganiserRoute && <Footer />}
    </>
  )
}

export default App