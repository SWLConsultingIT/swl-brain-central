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
    return <span className="text-xs text-fg-subtle">—</span>
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
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-fg text-bg hover:bg-fg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? (
          <>
            <span className="size-3 rounded-full border-2 border-bg/30 border-t-bg animate-spin" />
            Running…
          </>
        ) : (
          <>
            {label}
            <span aria-hidden>→</span>
          </>
        )}
      </button>
      {error && (
        <span className="text-[11px] text-destructive leading-tight">
          {error}
        </span>
      )}
    </div>
  )
}
