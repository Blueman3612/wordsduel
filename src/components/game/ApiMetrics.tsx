'use client'

import { useMetricsStore } from '@/lib/supabase/client'
import { useEffect, useState, useRef } from 'react'

export function ApiMetrics() {
  const apiCalls = useMetricsStore((state) => state.apiCalls)
  const resetMetrics = useMetricsStore((state) => state.resetMetrics)
  const [callsPerSecond, setCallsPerSecond] = useState(0)
  const lastTotalRef = useRef(apiCalls.total)
  const intervalCallsRef = useRef(0)

  // Set up interval to update rate every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCallsPerSecond(intervalCallsRef.current)
      intervalCallsRef.current = 0
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Track calls as they happen
  useEffect(() => {
    const newCalls = apiCalls.total - lastTotalRef.current
    if (newCalls > 0) {
      intervalCallsRef.current += newCalls
      lastTotalRef.current = apiCalls.total
    }
  }, [apiCalls.total])

  // Reset everything
  const handleReset = () => {
    resetMetrics()
    lastTotalRef.current = 0
    intervalCallsRef.current = 0
    setCallsPerSecond(0)
  }

  return (
    <div className="fixed top-4 right-4 bg-black/80 backdrop-blur-sm p-4 rounded-lg border border-white/10 text-sm z-50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-white/80">API Metrics</h3>
        <button
          onClick={handleReset}
          className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded"
        >
          Reset
        </button>
      </div>
      <div className="space-y-1 text-white/60">
        <p>Total Calls: {apiCalls.total}</p>
        <p>REST Calls: {apiCalls.rest}</p>
        <p>Realtime Events: {apiCalls.realtime}</p>
        <p className="text-purple-400">Rate: {callsPerSecond}/s</p>
      </div>
    </div>
  )
} 