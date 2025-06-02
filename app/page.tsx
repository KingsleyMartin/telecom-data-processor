import DataMigrationApp from '@/components/DataMigration';
import TelecomServicesApp from '@/components/TelecomServices';

export default function Home() {
  return (
    <main className="container mx-auto">
      <div className="space-y-8 py-8">
        <DataMigrationApp />
      </div>
    </main>
  );
}