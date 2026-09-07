import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { PromotionStatusBadge } from "@/features/promotions/components/promotion-status-badge";
import { formatPromotionType } from "@/features/promotions/format";
import { getPromotionsSnapshot } from "@/features/promotions/promotion-service";
import { tPromotions } from "@/lib/i18n/promotions-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function PromotionCalendarPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { promotions } = await getPromotionsSnapshot();
  const weeks = Array.from({ length: 5 }, (_, week) => Array.from({ length: 7 }, (_, day) => week * 7 + day + 1));

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/promotions">
          <ArrowLeft aria-hidden="true"/>
          {tPromotions("backToPromotions", locale)}
        </Link>
        <div className="mt-5 flex items-start gap-4">
          <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary"><CalendarDays aria-hidden="true"/></div>
          <div>
            <h1 className="text-3xl font-semibold">{tPromotions("promotionCalendar", locale)}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{tPromotions("subtitle", locale)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="grid grid-cols-7 gap-2 text-xs font-semibold uppercase text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div className="px-2" key={day}>{day}</div>)}
        </div>
        <div className="mt-3 grid grid-cols-7 gap-2">
          {weeks.flat().map((day) => {
            const dayPromotions = promotions.filter((promotion) => Number(promotion.startDate.slice(-2)) <= day && Number(promotion.endDate.slice(-2)) >= day).slice(0, 3);
            return (
              <div className="min-h-32 rounded-md border border-border bg-background p-2" key={day}>
                <div className="text-sm font-semibold">{day}</div>
                <div className="mt-2 flex flex-col gap-1">
                  {dayPromotions.map((promotion, index) => (
                    <Link
                      className={index > 0 ? "rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning" : "rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-primary"}
                      href={`/promotions/${promotion.id}`}
                      key={promotion.id}
                      title={`${promotion.promotionName} - ${formatPromotionType(promotion.type, locale)}`}
                    >
                      <span className="line-clamp-2">{promotion.promotionName}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{tPromotions("overlappingPromotions", locale)}</h2>
        <div className="mt-5 max-w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3">{tPromotions("promotions", locale)}</th>
                <th className="px-3 py-3">{tPromotions("dateRange", locale)}</th>
                <th className="px-3 py-3">{tPromotions("type", locale)}</th>
                <th className="px-3 py-3">{tPromotions("status", locale)}</th>
                <th className="px-3 py-3">{tPromotions("action", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((promotion) => (
                <tr className="border-b border-border last:border-b-0" key={promotion.id}>
                  <td className="px-3 py-3 font-semibold">{promotion.promotionName}</td>
                  <td className="px-3 py-3">{promotion.startDate} to {promotion.endDate}</td>
                  <td className="px-3 py-3">{formatPromotionType(promotion.type, locale)}</td>
                  <td className="px-3 py-3"><PromotionStatusBadge locale={locale} status={promotion.status}/></td>
                  <td className="px-3 py-3"><Link className="text-primary hover:underline" href={`/promotions/${promotion.id}`}>{tPromotions("view", locale)}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
