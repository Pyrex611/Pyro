"use client";

interface DynamicIslandProps {
  view: "companies" | "personnel";
  onViewChange: (view: "companies" | "personnel") => void;
  companiesCount?: number;
  personnelCount?: number;
  className?: string;
}

export function DynamicIsland({
  view,
  onViewChange,
  companiesCount,
  personnelCount,
  className = "",
}: DynamicIslandProps) {
  return (
    <div className={`flex justify-center items-center w-full my-3 ${className}`}>
      <div
        className="inline-flex items-center p-1.5 rounded-full bg-white border shadow-md gap-1 select-none transition-all"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          type="button"
          onClick={() => onViewChange("companies")}
          className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all duration-150 ${
            view === "companies"
              ? "bg-[#0f6e56] text-white shadow-sm"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/60"
          }`}
        >
          <span>🏢</span>
          <span>Practices & Clinics</span>
          {companiesCount !== undefined && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                view === "companies" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {companiesCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onViewChange("personnel")}
          className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all duration-150 ${
            view === "personnel"
              ? "bg-[#0f6e56] text-white shadow-sm"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/60"
          }`}
        >
          <span>👤</span>
          <span>Doctors & Personnel</span>
          {personnelCount !== undefined && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                view === "personnel" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {personnelCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}