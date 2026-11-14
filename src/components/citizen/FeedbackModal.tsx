import { useState, type FormEvent } from 'react';
import { Star, X } from 'lucide-react';
import { submitResolutionFeedback } from '../../services/firestoreService';
import type { Complaint, UserProfile } from '../../types/domain';

export function FeedbackModal({
  complaint,
  citizen,
  onClose,
}: {
  complaint: Complaint;
  citizen: UserProfile;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [resolvedSatisfactorily, setResolvedSatisfactorily] = useState(true);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await submitResolutionFeedback({
        complaint,
        citizen,
        rating,
        comment,
        resolvedSatisfactorily,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-navy-900 px-6 py-4 text-white">
          <div>
            <p className="font-mono text-xs text-teal-300 tabular-nums">
              {complaint.complaintCode}
            </p>
            <h2 id="feedback-modal-title" className="text-base font-bold">
              Submit Resolution Feedback
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback modal"
            className="rounded-lg p-1 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {error}
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Service Quality Rating
            </label>
            <div className="mt-2 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                    rating >= value
                      ? 'border-teal-600 bg-teal-50 text-teal-700'
                      : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                  }`}
                  aria-label={`Rate ${value} out of 5`}
                >
                  <Star className={`h-5 w-5 ${rating >= value ? 'fill-teal-600' : ''}`} />
                </button>
              ))}
              <span className="ml-2 font-mono text-sm font-semibold text-slate-700 tabular-nums">
                {rating} / 5
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Was the civic issue resolved satisfactorily?
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setResolvedSatisfactorily(true)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                  resolvedSatisfactorily
                    ? 'border-teal-600 bg-teal-50 text-teal-900'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Yes, Resolved &amp; Close
              </button>
              <button
                type="button"
                onClick={() => setResolvedSatisfactorily(false)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                  !resolvedSatisfactorily
                    ? 'border-amber-600 bg-amber-50 text-amber-900'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Needs Follow-up
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Citizen Remarks (Optional)
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share feedback on timeliness, field workmanship, or remaining concerns..."
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-navy-900 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
