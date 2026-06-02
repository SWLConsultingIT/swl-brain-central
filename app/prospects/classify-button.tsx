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
    return <span className="text-xs text-muted-fg/40">—</span>
  }

  const label = status === 'new' ? 'Run ticket filter' : 'Run LLM classify →'

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
    <div className="flex flex-col items-stretch gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-[11px] font-medium px-3 py-1.5 rounded-md bg-muted hover:bg-border text-fg ring-1 ring-border hover:ring-border-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? 'Running…' : label}
      </button>
      {error && (
        <span className="text-[10px] text-destructive leading-tight">
          {error}
        </span>
      )}
    </div>
  )
}
