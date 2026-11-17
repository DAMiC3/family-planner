export function RewardsComingSoon() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-4">
      <span className="text-2xl" aria-hidden>
        🎁
      </span>
      <div>
        <p className="font-semibold">Rewards — coming soon</p>
        <p className="text-sm text-muted">Points from chores will be swappable for rewards. Keep collecting them!</p>
      </div>
    </div>
  );
}
