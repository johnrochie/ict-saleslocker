import { cn } from '@/lib/utils/formatting'

interface MetricCardProps {
  label: string
  value: string
  subValue?: string
  color?: 'brand' | 'green' | 'red' | 'amber' | 'navy' | 'gray'
  icon?: React.ReactNode
}

const colorMap = {
  brand: { icon: 'bg-brand-100 text-brand-500', value: 'text-brand-500' },
  green: { icon: 'bg-green-100 text-green-600',  value: 'text-green-700' },
  red:   { icon: 'bg-red-100 text-red-500',       value: 'text-red-700'   },
  amber: { icon: 'bg-amber-100 text-amber-600',   value: 'text-amber-700' },
  navy:  { icon: 'bg-blue-100 text-navy-700',     value: 'text-navy-700'  },
  gray:  { icon: 'bg-gray-100 text-gray-500',     value: 'text-gray-600'  },
}

export default function MetricCard({ label, value, subValue, color = 'brand', icon }: MetricCardProps) {
  const colors = colorMap[color]

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-start gap-4">
      {icon && (
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', colors.icon)}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
        <p className={cn('text-2xl font-bold leading-tight', colors.value)}>{value}</p>
        {subValue && (
          <p className="text-xs text-gray-400 mt-0.5">{subValue}</p>
        )}
      </div>
    </div>
  )
}
