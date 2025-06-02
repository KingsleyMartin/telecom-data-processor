//import DataMigrationApp from '@/components/DataMigration';
import WorkflowApp from '@/components/Workflow';

export default function Home() {
  return (
    <main className="container mx-auto">
      <div className="space-y-8 py-8">
        <WorkflowApp />
      </div>
    </main>
  );
}