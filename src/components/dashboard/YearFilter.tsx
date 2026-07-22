'use client'

import { useRouter, usePathname } from 'next/navigation'

export default function YearFilter({ years, selected }: { years: number[]; selected: number }) {
  const router   = useRouter()
  const pathname = usePathname()

  return (
    <select
      value={selected}
      onChange={e => router.push(`${pathname}?year=${e.target.value}`)}
      className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300 bg-white"
    >
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  )
}
