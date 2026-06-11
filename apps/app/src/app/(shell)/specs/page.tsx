import { Button, EmptyState } from '@arther/ui';

export default function SpecsPage() {
  return (
    <EmptyState
      title="No products yet"
      description="Products and their shared components live here — the system of record your documents are generated from."
      primaryAction={<Button>Add product</Button>}
      secondaryAction={<Button variant="ghost">Import spreadsheet</Button>}
    />
  );
}
