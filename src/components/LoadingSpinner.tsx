export function LoadingSpinner({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-[#1a1a1f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-[#e8820c]/30 border-t-[#e8820c] rounded-full animate-spin" />
        <p className="text-[#8888a0] text-base">{message}</p>
      </div>
    </div>
  );
}
