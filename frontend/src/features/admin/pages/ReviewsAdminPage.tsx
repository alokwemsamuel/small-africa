import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { adminApi, type AdminReview } from '../api';
import { AdminHeader, Empty, Loading, Pager, Panel, SelectField, StatusPill, TextAreaField } from '../ui';
import { fmt } from '../format';

export function ReviewsAdminPage() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, error } = useQuery({
    queryKey: ['admin', 'reviews', status, page],
    queryFn: ({ signal }) => adminApi.reviews({ status, page }, signal),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title="Reviews"
        intro="Guest reviews appear on the website only after you approve them. Replies are shown publicly under the review."
      />
      <SelectField
        label="Show"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={[
          ['pending', 'Waiting for moderation'],
          ['approved', 'Published'],
          ['hidden', 'Hidden'],
          ['', 'All'],
        ]}
        className="w-60"
      />
      {!data ? (
        <Loading error={error} />
      ) : data.items.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.items.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    </div>
  );
}

function ReviewCard({ review }: { review: AdminReview }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState(review.reply ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (body: { status?: string; reply?: string | null }, key: string) => {
    setBusy(key);
    try {
      await adminApi.moderateReview(review.id, body);
      void qc.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      void qc.invalidateQueries({ queryKey: ['public'] });
      toast('Review updated');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <li>
      <Panel>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-accent" aria-label={`${review.rating} out of 5`}>
            {'★'.repeat(review.rating)}
            <span className="text-muted">{'★'.repeat(5 - review.rating)}</span>
          </span>
          <span className="font-semibold">{review.author}</span>
          <StatusPill status={review.status} label={review.status === 'approved' ? 'Published' : undefined} />
          {review.verified && (
            <span className="text-success text-xs font-semibold">Verified order {review.orderReference}</span>
          )}
          <span className="text-muted ml-auto text-xs">{fmt.dateTime(review.createdAt)}</span>
        </div>
        {review.dish && <p className="text-secondary mt-1 text-sm">{review.dish}</p>}
        {review.title && <p className="mt-3 font-serif text-xl">{review.title}</p>}
        <p className="text-secondary mt-1">{review.body}</p>
        <TextAreaField
          label="Public reply (optional)"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          maxLength={1000}
          className="mt-4"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {review.status !== 'approved' && (
            <Button
              size="sm"
              loading={busy === 'approve'}
              onClick={() => act({ status: 'approved', reply: reply || null }, 'approve')}
            >
              Approve{reply ? ' and reply' : ''}
            </Button>
          )}
          {review.status !== 'hidden' && (
            <Button
              size="sm"
              variant="ghost"
              loading={busy === 'hide'}
              onClick={() => act({ status: 'hidden' }, 'hide')}
            >
              Hide
            </Button>
          )}
          {reply !== (review.reply ?? '') && (
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'reply'}
              onClick={() => act({ reply: reply || null }, 'reply')}
            >
              Save reply
            </Button>
          )}
        </div>
      </Panel>
    </li>
  );
}
