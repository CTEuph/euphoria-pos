import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppInitializer } from '@/features/employee/components/AppInitializer'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppInitializer>
      <App />
    </AppInitializer>
  </React.StrictMode>
)