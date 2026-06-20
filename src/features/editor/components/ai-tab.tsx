import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare, WandSparkles } from 'lucide-react'
import { cn } from '@/shared/ui/cn'
import { AiPanel } from './ai-panel'
import { AgentChatPanel } from './agent-chat-panel'

type AiTabView = 'assistant' | 'generate'

/**
 * Container for the AI sidebar tab. Splits the on-device assistant (agent that
 * edits the timeline) from the generation tools (TTS / music). Both run locally.
 */
export const AiTab = memo(function AiTab() {
  const { t } = useTranslation()
  const [view, setView] = useState<AiTabView>('assistant')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 p-2">
        <SegmentButton
          active={view === 'assistant'}
          onClick={() => setView('assistant')}
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label={t('agent.tab.assistant', { defaultValue: 'Assistant' })}
        />
        <SegmentButton
          active={view === 'generate'}
          onClick={() => setView('generate')}
          icon={<WandSparkles className="h-3.5 w-3.5" />}
          label={t('agent.tab.generate', { defaultValue: 'Generate' })}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {view === 'assistant' ? <AgentChatPanel /> : <AiPanel />}
      </div>
    </div>
  )
})

function SegmentButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
