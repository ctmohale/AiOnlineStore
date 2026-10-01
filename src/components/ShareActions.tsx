import { Check, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useFeedback } from './FeedbackProvider';

export default function ShareActions({ url, title, text, compact = false }: { url: string; title: string; text: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const { notify } = useFeedback();
  const encodedUrl = encodeURIComponent(url); const encodedText = encodeURIComponent(`${text} ${url}`);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); notify('Share link copied.', 'success', 'Copied'); window.setTimeout(() => setCopied(false), 1800); } catch { notify('The link could not be copied. Select it from the address bar.', 'warning'); } };
  const nativeShare = async () => { try { if (navigator.share) await navigator.share({ title, text, url }); else await copy(); } catch (error) { if ((error as Error).name !== 'AbortError') notify('Sharing could not be opened.', 'warning'); } };
  return <div className={compact ? 'share-actions compact' : 'share-actions'} aria-label="Share options">
    <button type="button" className="share-native" onClick={() => void nativeShare()}><Share2 /> Share</button>
    <a href={`https://wa.me/?text=${encodedText}`} target="_blank" rel="noreferrer" aria-label="Share on WhatsApp">WhatsApp</a>
    <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noreferrer" aria-label="Share on Facebook">Facebook</a>
    <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodedUrl}`} target="_blank" rel="noreferrer" aria-label="Share on X">X</a>
    <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`} target="_blank" rel="noreferrer" aria-label="Share on LinkedIn">LinkedIn</a>
    <button type="button" onClick={() => void copy()}>{copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy link'}</button>
  </div>;
}
