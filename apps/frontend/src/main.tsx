// apps/frontend/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createClient } from '@supabase/supabase-js'

import Dashboard from './pages/Dashboard.tsx'
import WeavePage from './pages/WeavePage.tsx'
import { logger } from '@regloom/utils'

import './index.css'

// Supabase — safe fallback
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'public-anon-key'
const supabase = createClient(supabaseUrl, supabaseKey)

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: 1, staleTime: 1000 * 60 },
    },
})

export const AuthContext = React.createContext(supabase)

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AuthContext.Provider value={supabase}>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/weave" element={<WeavePage />} />
                    </Routes>
                </BrowserRouter>
                <ReactQueryDevtools initialIsOpen={false} />
            </QueryClientProvider>
        </AuthContext.Provider>
    </React.StrictMode>
)