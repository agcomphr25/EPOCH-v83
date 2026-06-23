import { useSearch } from 'wouter';
import VendorPOManager from '@/components/inventory/VendorPOManager';

export default function VendorPOPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preSelectedPoId = params.get('poId') ? parseInt(params.get('poId')!, 10) : undefined;
  const autoOpenIssue = params.get('issue') === '1';

  return (
    <div className="p-6">
      <VendorPOManager preSelectedPoId={preSelectedPoId} autoOpenIssue={autoOpenIssue} />
    </div>
  );
}
