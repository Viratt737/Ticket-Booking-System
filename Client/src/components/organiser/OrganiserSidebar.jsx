import { LayoutDashboardIcon, PlusSquareIcon } from 'lucide-react'
import React from 'react'
import { NavLink } from 'react-router-dom'

const OrganiserSidebar = () => {
  const links = [
    { name: 'Dashboard', path: '/organiser', icon: LayoutDashboardIcon },
    { name: 'Create Show', path: '/organiser/add-show', icon: PlusSquareIcon },
  ]

  return (
    <div className='h-[calc(100vh-64px)] md:flex flex-col items-center pt-8 max-w-13 md:max-w-60 w-full border-r border-gray-300/20 text-sm'>
      <div className='w-full'>
        {links.map((link, index) => (
          <NavLink key={index} to={link.path} end className={({ isActive }) => `relative flex items-center max-md:justify-center gap-2 w-full py-2.5 min-md:pl-10 first:mt-2 text-gray-400 ${isActive && 'bg-primary/15 text-primary group'}`}>
            {({ isActive }) => (
              <>
                <link.icon className="w-5 h-5" />
                <p className="max-md:hidden">{link.name}</p>
                <span className={`w-1.5 h-10 rounded-l right-0 absolute ${isActive && 'bg-primary'}`} />
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export default OrganiserSidebar