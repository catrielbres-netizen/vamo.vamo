import dynamic from 'next/dynamic';

const DriverRegisterClient = dynamic(
  () => import('./DriverRegisterClient'),
  { 
    ssr: false, 
    loading: () => <div className="min-h-screen bg-[#121212]" />
  }
);

export default function Page() {
  return <DriverRegisterClient />;
}
