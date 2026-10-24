import type { SelectHTMLAttributes } from "react";

type AdminSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  containerClassName?: string;
};

export function AdminSelect({
  children,
  className = "",
  containerClassName = "",
  ...props
}: AdminSelectProps) {
  return (
    <div className={`relative inline-flex h-10 min-w-[144px] items-center ${containerClassName}`}>
      <select
        {...props}
        className={`h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white py-0 pl-3 pr-11 text-sm leading-none text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${className}`}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500"
      >
        <svg className="block h-4 w-4" viewBox="0 0 16 16" fill="none">
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}
