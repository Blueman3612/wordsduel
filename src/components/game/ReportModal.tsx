import { useState, ChangeEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  word: string
}

const REPORT_REASONS = [
  'Violates requirement',
  'Not English',
  'Inappropriate content',
  'Other'
]

export function ReportModal({ isOpen, onClose, word }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('Violates requirement')
  const [details, setDetails] = useState('')

  const handleSubmit = () => {
    // TODO: Implement report submission
    console.log('Report submitted:', {
      word,
      reason: selectedReason,
      details
    })
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Report "${word}"`}
    >
      <div className="space-y-6">
        {/* Report Reasons */}
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

        {/* Additional Details */}
        <div className="space-y-3">
          <label className="block text-sm text-white/70">
            Additional details (optional)
          </label>
          <Input
            isTextarea
            value={details}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDetails(e.target.value)}
            placeholder="Please provide any additional context..."
            className="w-full h-24 px-4 py-3 bg-white/5 border-2 border-white/10 
              text-white placeholder:text-white/40
              focus:outline-none focus:border-purple-500/50
              resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            onClick={onClose}
            className="px-6 py-3 bg-white/10 from-transparent to-transparent hover:bg-white/20 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedReason}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
          >
            Submit Report
          </Button>
        </div>
      </div>
    </Modal>
  )
} 