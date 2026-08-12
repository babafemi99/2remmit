import {
  ArrowClockwise,
  Check,
  PaperPlaneTilt,
  Plus,
  Prohibit,
  X,
} from "@phosphor-icons/react";

import type { LiveState } from "@/hooks/use-transfer-activity-stream";
import type { TransferActivity } from "@/types/transfer-detail";

const ICONS = {
  created: Plus,
  submitted: PaperPlaneTilt,
  completed: Check,
  failed: X,
  cancelled: Prohibit,
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ActivityTimeline({
  activities,
  loading,
  state,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  activities: TransferActivity[];
  loading: boolean;
  state: LiveState;
  error?: string;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <section className="activity-section" aria-labelledby="activity-heading">
      <div className="activity-heading-row">
        <h2 id="activity-heading">Activity</h2>
        <LiveConnectionIndicator state={state} onRefresh={onRetry} />
      </div>
      {loading ? (
        <div className="activity-loading" role="status">
          <span aria-hidden="true" /> Loading activity…
        </div>
      ) : error ? (
        <div className="activity-error" role="alert">
          <strong>Activity couldn’t be loaded</strong>
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            <ArrowClockwise aria-hidden="true" /> Retry
          </button>
        </div>
      ) : activities.length ? (
        <>
          <ol className="activity-timeline">
            {activities.map((activity) => {
              const Icon = ICONS[activity.type];
              return (
                <li
                  key={activity.id}
                  className="activity-item"
                  data-type={activity.type}
                >
                  <span className="activity-icon">
                    <Icon aria-hidden="true" size={16} weight="bold" />
                  </span>
                  <div>
                    <strong>{activity.message}</strong>
                    <p>
                      {activity.previous_status
                        ? `${capitalize(activity.previous_status)} → ${capitalize(activity.new_status)}`
                        : capitalize(activity.new_status)}
                    </p>
                    {activity.source === "provider" ? (
                      <span>
                        Provider event
                        {activity.event_id ? ` · ${activity.event_id}` : ""}
                      </span>
                    ) : null}
                  </div>
                  <time dateTime={activity.created_at}>
                    {formatTimestamp(activity.created_at)}
                  </time>
                </li>
              );
            })}
          </ol>
          {hasMore ? (
            <button
              className="pagination-button"
              type="button"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? "Loading…" : "Load earlier activity"}
            </button>
          ) : null}
        </>
      ) : (
        <div className="activity-empty">No activity has been recorded yet.</div>
      )}
    </section>
  );
}

function capitalize(value: string) {
  return value[0].toUpperCase() + value.slice(1);
}

export function LiveConnectionIndicator({
  state,
  onRefresh,
}: {
  state: LiveState;
  onRefresh: () => void;
}) {
  const label =
    state === "live"
      ? "Live"
      : state === "paused"
        ? "Updates paused"
        : state === "reconnecting"
          ? "Reconnecting…"
          : "Connecting…";
  return (
    <div className="live-indicator" data-state={state}>
      <span aria-hidden="true" />
      {label}
      {state === "paused" ? (
        <button type="button" onClick={onRefresh}>
          Refresh activity
        </button>
      ) : null}
    </div>
  );
}
