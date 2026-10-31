import { STATUS_LABEL, type Status } from "@/shared/types";

const STYLE: Record<Status, string> = {
  new: "bg-amber-100 text-amber-900",
  interview: "bg-emerald-100 text-emerald-900",
  rejected: "bg-stone-200 text-stone-700",
};
const SHORT: Record<Status, string> = { new: "Yangi", interview: "Suhbat", rejected: "Rad etilgan" };

export const StatusBadge = ({ status, long }: { status: Status; long?: boolean }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLE[status]}`}>
    {long ? STATUS_LABEL[status] : SHORT[status]}
  </span>
);
