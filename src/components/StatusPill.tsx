export default function StatusPill({ status, label }: { status: string; label?: string }) {
  return <span className={`status status-${status.replaceAll('_', '-')}`}><i />{label || status.replaceAll('_', ' ')}</span>;
}
