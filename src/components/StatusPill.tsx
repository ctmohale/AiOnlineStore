export default function StatusPill({ status }: { status: string }) {
  return <span className={`status status-${status.replaceAll('_', '-')}`}><i />{status.replaceAll('_', ' ')}</span>;
}
