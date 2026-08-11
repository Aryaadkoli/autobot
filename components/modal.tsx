"use client";

import { useEffect } from "react";

export default function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${
          wide ? "max-w-2xl" : "max-w-md"
        } max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl`}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-medium text-stone-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 cursor-pointer text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
