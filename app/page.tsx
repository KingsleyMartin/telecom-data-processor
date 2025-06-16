import CustomerDataProcessor from '@/components/CustomerAddressStandardization';

export default function Home() {
  return (
    <main className="container mx-auto">
      <div className="space-y-8 py-8">
        <CustomerDataProcessor />
      </div>
    </main>
  );
}