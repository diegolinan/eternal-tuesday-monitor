import { Atom, Microscope } from 'lucide-react';
import {
  siAnthropic,
  siCursor,
  siGoogle,
  siPerplexity,
  type SimpleIcon,
} from 'simple-icons';

const brandIcons: Record<string, SimpleIcon> = {
  'vendor-anthropic': siAnthropic,
  'vendor-cursor': siCursor,
  'vendor-google': siGoogle,
  'vendor-perplexity': siPerplexity,
};

function GenericMark({
  vendor,
  vendorId,
}: {
  vendor: string;
  vendorId?: string;
}) {
  if (vendorId === 'vendor-independent-research') {
    return <Microscope aria-hidden="true" />;
  }
  if (vendorId === 'vendor-openai') return <Atom aria-hidden="true" />;
  return <span aria-hidden="true">{vendor.slice(0, 2)}</span>;
}

export function VendorMark({
  vendor,
  vendorId,
  withLabel = true,
}: {
  vendor: string;
  vendorId?: string;
  withLabel?: boolean;
}) {
  const icon = vendorId ? brandIcons[vendorId] : undefined;
  return (
    <span className="vendor-mark" title={vendor}>
      <span className="vendor-mark-icon" aria-hidden="true">
        {icon ? (
          <svg viewBox="0 0 24 24" role="presentation">
            <path d={icon.path} fill="currentColor" />
          </svg>
        ) : (
          <GenericMark vendor={vendor} vendorId={vendorId} />
        )}
      </span>
      {withLabel && <span>{vendor}</span>}
    </span>
  );
}
