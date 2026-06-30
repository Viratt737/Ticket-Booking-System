import React, { useEffect, useState } from 'react'
import { useAppContext } from '../../context/AppContext'
import toast from 'react-hot-toast'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import Title from '../../components/admin/Title'
import Loading from '../../components/Loading'

const CATEGORY_COLORS = ['bg-primary/70', 'bg-yellow-500/70', 'bg-green-500/70', 'bg-blue-500/70']

const VenueManager = () => {
  const { axios, getToken } = useAppContext()

  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [categories, setCategories] = useState([{ name: "Standard" }])
  const [layout, setLayout] = useState([{ row: "A", seatsInRow: 10, category: "Standard" }])
  const [submitting, setSubmitting] = useState(false)

  const fetchVenues = async () => {
    try {
      const { data } = await axios.get('/api/venue/all')
      if (data.success) setVenues(data.venues)
    } catch (error) { console.error(error) }
    setLoading(false)
  }

  useEffect(() => { fetchVenues() }, [])

  const addCategory = () => setCategories(prev => [...prev, { name: "" }])
  const updateCategory = (i, val) => setCategories(prev => prev.map((c, idx) => idx === i ? { name: val } : c))
  const removeCategory = (i) => setCategories(prev => prev.filter((_, idx) => idx !== i))

  const addRow = () => {
    const nextLetter = String.fromCharCode(65 + layout.length)
    setLayout(prev => [...prev, { row: nextLetter, seatsInRow: 10, category: categories[0]?.name || "" }])
  }
  const updateRow = (i, field, val) => setLayout(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  const removeRow = (i) => setLayout(prev => prev.filter((_, idx) => idx !== i))

  const totalSeats = layout.reduce((sum, r) => sum + Number(r.seatsInRow || 0), 0)

  const handleSubmit = async () => {
    try {
      if (!name || !location || categories.some(c => !c.name)) {
        return toast.error("Fill venue name, location, and all category names")
      }
      setSubmitting(true)
      const { data } = await axios.post('/api/venue/create', { name, location, categories, layout }, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      })
      if (data.success) {
        toast.success("Venue created")
        setName(""); setLocation(""); setCategories([{ name: "Standard" }]); setLayout([{ row: "A", seatsInRow: 10, category: "Standard" }])
        setShowForm(false)
        fetchVenues()
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      toast.error(error.message)
    }
    setSubmitting(false)
  }

  if (loading) return <Loading />

  return (
    <div>
      <div className='flex items-center justify-between'>
        <Title text1="Manage" text2="Venues" />
        <button onClick={() => setShowForm(!showForm)} className='flex items-center gap-1 px-4 py-2 bg-primary hover:bg-primary-dull transition rounded-full text-sm font-medium cursor-pointer'>
          <PlusIcon className='w-4 h-4' /> {showForm ? "Cancel" : "New Venue"}
        </button>
      </div>

      {showForm && (
        <div className='mt-6 max-w-2xl bg-primary/5 border border-primary/20 rounded-lg p-6'>
          <div className='flex flex-col gap-3 max-w-md'>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Venue name (e.g. PVR Phoenix)"
              className='bg-gray-800 px-4 py-2 rounded outline-none' />
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location"
              className='bg-gray-800 px-4 py-2 rounded outline-none' />
          </div>

          <p className='mt-6 font-medium text-sm'>Seat Categories</p>
          <div className='flex flex-col gap-2 mt-2 max-w-md'>
            {categories.map((c, i) => (
              <div key={i} className='flex items-center gap-2'>
                <span className={`w-4 h-4 rounded ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`} />
                <input value={c.name} onChange={e => updateCategory(i, e.target.value)} placeholder="e.g. Premium"
                  className='bg-gray-800 px-3 py-1.5 rounded outline-none flex-1 text-sm' />
                {categories.length > 1 && <Trash2Icon onClick={() => removeCategory(i)} className='w-4 h-4 text-red-500 cursor-pointer' />}
              </div>
            ))}
            <button onClick={addCategory} className='flex items-center gap-1 text-sm text-primary mt-1 w-max'>
              <PlusIcon className='w-3.5 h-3.5' /> Add category
            </button>
          </div>

          <p className='mt-6 font-medium text-sm'>Seat Layout (rows)</p>
          <div className='flex flex-col gap-2 mt-2'>
            {layout.map((row, i) => (
              <div key={i} className='flex items-center gap-2'>
                <input value={row.row} onChange={e => updateRow(i, 'row', e.target.value)} placeholder="Row"
                  className='bg-gray-800 px-3 py-1.5 rounded outline-none w-16 text-sm' />
                <input type="number" min={1} value={row.seatsInRow} onChange={e => updateRow(i, 'seatsInRow', e.target.value)}
                  placeholder="Seats" className='bg-gray-800 px-3 py-1.5 rounded outline-none w-20 text-sm' />
                <select value={row.category} onChange={e => updateRow(i, 'category', e.target.value)}
                  className='bg-gray-800 px-3 py-1.5 rounded outline-none text-sm'>
                  {categories.map((c, ci) => <option key={ci} value={c.name}>{c.name || `Category ${ci + 1}`}</option>)}
                </select>
                {layout.length > 1 && <Trash2Icon onClick={() => removeRow(i)} className='w-4 h-4 text-red-500 cursor-pointer' />}
              </div>
            ))}
            <button onClick={addRow} className='flex items-center gap-1 text-sm text-primary mt-1 w-max'>
              <PlusIcon className='w-3.5 h-3.5' /> Add row
            </button>
          </div>

          <p className='mt-6 font-medium text-sm'>Live Preview ({totalSeats} seats)</p>
          <div className='mt-2 flex flex-col items-center gap-2 bg-black/30 rounded-lg p-4'>
            {layout.map((row, i) => {
              const colorIdx = categories.findIndex(c => c.name === row.category)
              return (
                <div key={i} className='flex items-center gap-2'>
                  <span className='text-xs text-gray-400 w-6'>{row.row}</span>
                  <div className='flex gap-1'>
                    {Array.from({ length: Number(row.seatsInRow) || 0 }).map((_, si) => (
                      <span key={si} className={`h-4 w-4 rounded-sm ${CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length] || 'bg-gray-600'}`} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <button onClick={handleSubmit} disabled={submitting}
            className='mt-6 px-8 py-2.5 bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer text-sm'>
            {submitting ? "Creating..." : "Create Venue"}
          </button>
        </div>
      )}

      <div className='flex flex-wrap gap-4 mt-6'>
        {venues.map(v => (
          <div key={v._id} className='bg-primary/10 border border-primary/20 rounded-lg p-4 w-64'>
            <p className='font-medium'>{v.name}</p>
            <p className='text-sm text-gray-400'>{v.location}</p>
            <p className='text-xs text-gray-500 mt-2'>{v.categories.map(c => c.name).join(", ")}</p>
            <p className='text-xs text-gray-500'>{v.layout.reduce((s, r) => s + r.seatsInRow, 0)} seats</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default VenueManager