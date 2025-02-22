import { createBrowserClient } from '@supabase/ssr'
import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'

// Store for API metrics
interface MetricsStore {
  apiCalls: {
    total: number
    realtime: number
    rest: number
  }
  resetMetrics: () => void
  incrementRealtime: () => void
  incrementRest: () => void
}

export const useMetricsStore = create<MetricsStore>((set) => ({
  apiCalls: {
    total: 0,
    realtime: 0,
    rest: 0
  },
  resetMetrics: () => set({ apiCalls: { total: 0, realtime: 0, rest: 0 } }),
  incrementRealtime: () => set((state) => ({
    apiCalls: {
      ...state.apiCalls,
      total: state.apiCalls.total + 1,
      realtime: state.apiCalls.realtime + 1
    }
  })),
  incrementRest: () => set((state) => ({
    apiCalls: {
      ...state.apiCalls,
      total: state.apiCalls.total + 1,
      rest: state.apiCalls.rest + 1
    }
  }))
}))

// Create the Supabase client
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Add middleware to track API calls
const originalFrom = supabase.from.bind(supabase)
supabase.from = (table: string) => {
  useMetricsStore.getState().incrementRest()
  return originalFrom(table)
}

const originalChannel = supabase.channel.bind(supabase)
supabase.channel = (name: string, opts?: any) => {
  const channel = originalChannel(name, opts)
  const originalSubscribe = channel.subscribe.bind(channel)
  
  channel.subscribe = (callback?: any) => {
    useMetricsStore.getState().incrementRealtime()
    return originalSubscribe(callback)
  }
  
  return channel
}

export { supabase } 