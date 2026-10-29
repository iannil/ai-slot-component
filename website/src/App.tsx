import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Privacy from './pages/Privacy'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/privacy" element={<Privacy />} />
    </Routes>
  )
}
