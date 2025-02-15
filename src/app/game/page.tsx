'use client'

import { useState } from 'react'

export default function GamePage() {
  const [word, setWord] = useState('')

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800">
      <div className="min-h-screen flex items-end">
        <div className="w-full max-w-2xl mx-auto p-8">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4">
            <form className="flex gap-4">
              <input
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="Type your word..."
                className="flex-1 px-6 py-4 rounded-xl border border-white/20 bg-white/5 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 transition-all hover:border-white/40"
              />
              <button
                type="submit"
                className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-semibold shadow-lg transition-all duration-300"
              >
                Submit
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  )
} 