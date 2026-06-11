export default function PlatformLoading() {
  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto animate-pulse">
      <div className="h-7 w-44 bg-gray-200 rounded mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 border border-gray-200 rounded-lg" />
        ))}
      </div>
      <div className="h-80 bg-gray-100 border border-gray-200 rounded-lg" />
    </div>
  );
}
