import { useLocation, useSearch } from 'wouter';
import WADWizard from '@/components/wad/WADWizard';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WADWizardPageProps {
  params: { id: string };
}

export default function WADWizardPage({ params }: WADWizardPageProps) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const wadId = params.id;

  // Honor ?step=<n> deep-links from My Tasks dashboard (WAD approval signature requests).
  const searchParams = new URLSearchParams(search);
  const stepParam = searchParams.get('step');
  const stepNumber = stepParam != null ? Number.parseInt(stepParam, 10) : NaN;
  const initialStep = Number.isFinite(stepNumber) && stepNumber >= 1 && stepNumber <= 12 ? stepNumber : null;

  const handleClose = () => navigate(`/work-orders/${wadId}`);

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={handleClose} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to WAD Detail
        </Button>
      </div>
      <WADWizard wadId={wadId} onClose={handleClose} initialStep={initialStep} />
    </div>
  );
}
