'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  jobId: string
  status: string
}

export default function ClassifyButton({ jobId, status }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (status !== 'new' && status !== 'prequalified') {
    return <span className="text-xs opacity-40">—</span>
  }

  const label = status === 'new' ? 'Run ticket filter' : 'Run LLM classify'

  async function onClick() {
    setError(null)
    const res = await fetch(`/api/jobs/${jobId}/classify`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? `HTTP ${res.status}`)
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-xs px-2.5 py-1 rounded border border-white/20 hover:border-white/50 hover:bg-white/5 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? 'Running…' : label}
      </button>
      {error && <span className="text-[10px] text-red-400 max-w-[180px] text-right">{error}</span>}
    </div>
  )
}
