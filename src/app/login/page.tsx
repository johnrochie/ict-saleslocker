'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const router                  = useRouter()
  const supabase                = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Invalid email or password. Please try again.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex bg-gray-50">

      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-navy-700 flex-col justify-between p-12">
        <div>
          <Image
            src="/logo.png"
            alt="ICT Services"
            width={140}
            height={60}
            className="brightness-0 invert"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            SalesLocker
          </h1>
          <p className="text-blue-200 text-lg leading-relaxed max-w-sm">
            Your single view of pipeline, revenue, and performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-brand-500" />
          <p className="text-gray-400 text-sm">ICT Services Internal Platform</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">

          <div className="lg:hidden mb-8 text-center">
            <Image
              src="/logo.png"
              alt="ICT Services"
              width={120}
              height={52}
              className="mx-auto"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-navy-700">Sign in</h2>
            <p className="text-body text-sm mt-1">Access your SalesLocker dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-navy-700 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-navy-700
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                           placeholder:text-gray-400"
                placeholder="you@ictservices.ie"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-navy-700 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-navy-700
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center rounded-lg bg-brand-500 px-4 py-2.5
                         text-sm font-semibold text-white hover:bg-brand-600 focus:outline-none
                         focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
                         disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-8">ictservices.ie</p>
        </div>
      </div>

    </div>
  )
}
