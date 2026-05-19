import ManufacturingOperationsDashboard from './ManufacturingOperationsDashboard';

export default function ANGIETTestDashboard() {
  return (
    <ManufacturingOperationsDashboard
      ownerName="Angie"
      subtitle="Cutting Table Operations"
      hiddenNavHrefs={[
        '/department-queue/cnc',
        '/department-queue/gunsmith',
      ]}
    />
  );
}
