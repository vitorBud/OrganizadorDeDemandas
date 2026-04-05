import { Droplets, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import {
  Button,
  LiquidButton,
  MetalButton,
} from '@/components/ui/liquid-glass-button'

/** Demo route: shadcn-style UI + liquid glass / metal buttons */
export function LiquidDemo() {
  const navigate = useNavigate()

  return (
    <div className="relative min-h-svh w-full overflow-hidden">
      <img
        src="https://images.unsplash.com/photo-1557683316-973673baf926?w=1600&q=80"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/35" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-svh max-w-4xl flex-col gap-10 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <LiquidButton
            type="button"
            size="sm"
            variant="outline"
            className="!border-white/30 !bg-white/10 !text-white"
            onClick={() => navigate('/')}
          >
            ← Voltar ao início
          </LiquidButton>
          <p className="text-sm text-white/80">
            Demo dos componentes em <code className="rounded bg-white/10 px-1">@/components/ui</code>
          </p>
        </div>

        <section className="relative flex min-h-[220px] items-center justify-center rounded-2xl border border-white/20 bg-white/5 p-8 backdrop-blur-sm">
          <LiquidButton
            type="button"
            className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-white"
          >
            <Droplets className="size-5" aria-hidden />
            Liquid Glass
          </LiquidButton>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-white/10 p-8 backdrop-blur-md">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-white">
            Button (shadcn + CVA)
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button variant="default">Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="cool">Cool</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-white/10 p-8 backdrop-blur-md">
          <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-white">
            <Sparkles className="size-5" aria-hidden />
            MetalButton
          </h2>
          <div className="flex flex-wrap gap-4">
            <MetalButton variant="default">Default</MetalButton>
            <MetalButton variant="primary">Primary</MetalButton>
            <MetalButton variant="success">Success</MetalButton>
            <MetalButton variant="gold">Gold</MetalButton>
          </div>
        </section>
      </div>
    </div>
  )
}
