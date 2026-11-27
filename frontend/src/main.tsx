import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
// 段階に固有の CSS (Tailwind の読み込みと色のトークンは殻の index.css が 1 度だけ持つ)
import 'ml-pathfinder-frontend/stage.css'
import 'ml-fathom-frontend/stage.css'
import 'ml-createarchitecture-frontend/stage.css'
import 'ml-dashboard-frontend/stage.css'
import { Shell } from './Shell'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
)
