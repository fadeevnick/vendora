import { VendorSidebar } from '../../components/VendorSidebar'

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <VendorSidebar />
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  )
}
