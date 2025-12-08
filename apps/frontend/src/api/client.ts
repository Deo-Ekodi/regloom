// apps/frontend/src/api/client.ts
// ─────────────────────────────────────────────────────────────────────────────
// API client wrappers using Axios for backend calls and Supabase for auth.
// Provides React Query hooks like useWeave for querying/submitting weaves.
// Uses shared types from @regloom/types for type safety.
// Includes logging and error handling for robustness.
// ─────────────────────────────────────────────────────────────────────────────

// apps/frontend/src/api/client.ts
import axios from 'axios'
import { useQuery, useMutation } from '@tanstack/react-query'
import { WeaveInput, WeaveOutput } from '@regloom/types'
import { browserLogger as logger } from '@regloom/utils/browser'

const BACKEND_URL = process.env.VITE_BACKEND_BASE_URL || 'http://localhost:4000'

const api = axios.create({
    baseURL: `${BACKEND_URL}/api`,
    timeout: 30000,
})

export const useWeaves = () => {
    return useQuery<WeaveOutput[]>({
        queryKey: ['weaves'],
        queryFn: async () => {
            const { data } = await api.get('/weaves')
            return data
        },
        placeholderData: [], // Prevents flash of "no weaves"
    })
}

export const useSubmitWeave = () => {
    return useMutation({
        mutationFn: async (input: WeaveInput) => {
            const { data } = await api.post('/weave', input)
            return data
        },
        onSuccess: () => logger.info('Weave submitted'),
        onError: (err) => logger.error('Weave failed', err),
    })
}