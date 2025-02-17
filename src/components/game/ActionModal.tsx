import { useState, ChangeEvent, ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface ActionModalProps {
  isOpen: boolean
  onClose: () => void
  word: string
  mode: 'report' | 'challenge' | 'info'
  title?: string
  children?: ReactNode
  onSubmit?: (details: string) => void
  hideButtons?: boolean
}

const REPORT_REASONS = [
  'Violates requirement',
  'Not English',
  'Inappropriate content',
  'Other'
]

export function ActionModal({ 
  isOpen, 
  onClose, 
  word, 
  mode, 
  title,
  children,
  onSubmit,
  hideButtons = false
}: ActionModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('Violates requirement')
  const [details, setDetails] = useState('')

  const getTitle = () => {
    if (title) return title
    switch (mode) {
      case 'report':
        return `Report "${word}"`
      case 'challenge':
        return `Challenge "${word}"`
      case 'info':
        return `About "${word}"`
      default:
        return word
    }
  }

  const handleSubmit = () => {
    if (onSubmit) {
      onSubmit(mode === 'report' ? `${selectedReason}\n${details}` : details)
    } else {
      // Default report handling
      console.log(`${mode} submitted:`, {
        word,
        reason: selectedReason,
        details
      })
    }
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getTitle()}
    >
      <div className="space-y-6">
        {children || (
          <>
            {mode === 'report' && (
              <div className="space-y-3">
                <label className="block text-sm text-white/70">
                  Reason for report
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {REPORT_REASONS.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => setSelectedReason(reason)}
                      className={`
                        p-3 rounded-xl text-sm text-left transition-all
                        ${selectedReason === reason
                          ? 'bg-purple-500/30 border-2 border-purple-500/50'
                          : 'bg-white/5 border-2 border-white/10 hover:bg-white/10'
                        }
                      `}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Additional Details */}
            <div className="space-y-3">
              <label className="block text-sm text-white/70">
                {mode === 'report' ? 'Additional details (optional)' : 'Your comment'}
              </label>
              <Input
                isTextarea
                value={details}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDetails(e.target.value)}
                placeholder={mode === 'report' 
                  ? "Please provide any additional context..."
                  : "Add your comment here..."
                }
                className="w-full h-24 px-4 py-3 bg-white/5 border-2 border-white/10 
                  text-white placeholder:text-white/40
                  focus:outline-none focus:border-purple-500/50
                  resize-none"
              />
            </div>
          </>
        )}

        {/* Actions */}
        {!hideButtons && (
          <div className="flex justify-end gap-3">
            <Button
              onClick={onClose}
              className="px-6 py-3 bg-white/10 from-transparent to-transparent hover:bg-white/20 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={mode === 'report' && !selectedReason}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
            >
              {mode === 'report' ? 'Submit Report' : mode === 'challenge' ? 'Submit Challenge' : 'Submit'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
} 