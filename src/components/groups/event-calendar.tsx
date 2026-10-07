"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, startTransition } from "react";
import FullCalendar, { type CalendarRef, type EventSourceFuncInfo, type DatesSetInfo } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import listPlugin from "@fullcalendar/react/list";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { useRouter } from "next/navigation";
import { calendarEventsAction } from "@/app/events/calendar-actions";
import { calendarDate, calendarView, calendarQuery, type CalendarView } from "@/lib/events/calendar";
import "./event-calendar.css";
const plugins = [classicThemePlugin,dayGridPlugin,timeGridPlugin,listPlugin];
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
function Calendar({ slug, initialDate, initialView }: { slug: string; initialDate?: string; initialView: CalendarView }) {
  const ref = useRef<CalendarRef>(null);
  const sequence = useRef(0);
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [title,setTitle] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [count,setCount] = useState(0);
  const loadEvents = useCallback(async (info: EventSourceFuncInfo) => {
    const request = ++sequence.current;
    // FullCalendar can request its initial range while rendering. Defer React
    // updates and the Server Action until that synchronous render has finished.
    await Promise.resolve();
    if (request !== sequence.current) return [];
    setLoading(true); setError("");
    const result = await calendarEventsAction({ slug, start: info.startStr, end: info.endStr }).catch(() => ({ ok: false, events: undefined, message: "Unable to load events. Try again." }));
    if (request !== sequence.current) return [];
    setLoading(false);
    if (!result.ok) { setError(result.message ?? "Unable to load events."); setCount(0); return []; }
    setCount(result.events?.length ?? 0);
    const query = new URLSearchParams(window.location.search);
    return (result.events ?? []).map(event => {
      const destination = new URL(event.url,window.location.origin);
      const date = calendarDate(query.get("date") ?? undefined);
      const selectedView = calendarView(query.get("view") ?? undefined);
      if (date) destination.searchParams.set("calendarDate",date);
      if (selectedView) destination.searchParams.set("calendarView",selectedView);
      return { ...event, url: destination.pathname+destination.search };
    });
  },[slug]);
  useEffect(() => {
    // Register after commit: FullCalendar invokes event sources during its
    // initial render when they are passed as props, including discarded
    // Strict Mode renders. Server Actions must only run on mounted calendars.
    const source = ref.current?.getApi().addEventSource(loadEvents);
    const invalidateRequests = () => { sequence.current++; };
    return () => {
      invalidateRequests();
      source?.remove();
    };
  }, [loadEvents]);
  const datesSet = useCallback((info: DatesSetInfo) => {
    setView(info.view.type as CalendarView); setTitle(info.view.title);
    const date = info.view.calendar.getDate();
    if (date) window.history.replaceState(null,"",window.location.pathname+calendarQuery(localDate(date),info.view.type));
  },[]);
  useEffect(() => {
    const restore = () => {
      const query = new URLSearchParams(window.location.search);
      const restoredView = calendarView(query.get("view") ?? undefined);
      const restoredDate = calendarDate(query.get("date") ?? undefined);
      if (restoredView) ref.current?.getApi().changeView(restoredView,restoredDate);
      else if (restoredDate) ref.current?.getApi().gotoDate(restoredDate);
    };
    window.addEventListener("popstate",restore);
    return () => { window.removeEventListener("popstate",restore); };
  },[]);
  return <section aria-label="Group event calendar" className="rally-event-calendar my-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded border px-3 py-2" onClick={() => ref.current?.getApi().prev()}>Previous</button>
        <button type="button" className="min-h-11 rounded border px-3 py-2" onClick={() => ref.current?.getApi().today()}>Today</button>
        <button type="button" className="min-h-11 rounded border px-3 py-2" onClick={() => ref.current?.getApi().next()}>Next</button>
      </div>
      <label>Calendar view<select className="ml-2 min-h-11 rounded border p-2" value={view} onChange={event => ref.current?.getApi().changeView(event.target.value)}><option value="dayGridMonth">Month</option><option value="timeGridWeek">Week</option><option value="timeGridDay">Day</option><option value="listWeek">Agenda</option></select></label>
    </div>
    <h2 className="my-3 text-xl font-semibold" aria-live="polite">{title}</h2>
    <p className="mb-3 text-sm">Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    {loading && <p role="status">Loading events…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="min-h-11 underline" onClick={() => ref.current?.getApi().refetchEvents()}>Retry loading events</button></div>}
    {!loading && !error && count===0 && <p role="status">No events in this date range.</p>}
    <FullCalendar ref={ref} plugins={plugins} initialView={initialView} initialDate={initialDate} timeZone="local" headerToolbar={false} height="auto" datesSet={datesSet} editable={false} selectable={false} navLinks={false} dayMaxEvents={3} forceEventDuration={false} defaultTimedEventDuration={{ seconds: 1 }} eventMinHeight={24} displayEventEnd nowIndicator
      eventClick={info => { info.jsEvent.preventDefault(); const query=new URLSearchParams(window.location.search); const target=new URL(info.event.url,window.location.origin); for(const [key,dest] of [["date","calendarDate"],["view","calendarView"]]) { const value=query.get(key); if(value)target.searchParams.set(dest,value); } startTransition(()=>router.push(target.pathname+target.search)); }}
      eventDidMount={info => { if (info.view.type === "listWeek") info.el.setAttribute("role", "link"); info.el.setAttribute("aria-label",info.event.title+(info.event.extendedProps.status === "cancelled" ? " — Cancelled" : "")); }}
      eventContent={info => {
        const label = <span className="rally-calendar-event-label">{info.timeText && <span>{info.timeText} </span>}{info.event.title}{info.event.extendedProps.recurring && <span className="text-xs"> · Recurring</span>}{info.event.extendedProps.status === "cancelled" && <strong> · Cancelled</strong>}</span>;
        return label;
      }} />
  </section>;
}
const subscribeViewport = (listener: () => void) => {
  const media = window.matchMedia("(max-width: 767px)");
  media.addEventListener("change",listener);
  return () => media.removeEventListener("change",listener);
};
const viewportSnapshot = () => window.matchMedia("(max-width: 767px)").matches;
const serverViewportSnapshot = () => undefined;
export function EventCalendar({ slug, date, view, focus }: { slug: string; date?: string; view?: string; focus?: string }) {
  const mobile = useSyncExternalStore(subscribeViewport,viewportSnapshot,serverViewportSnapshot);
  if (mobile === undefined) return <p role="status">Loading calendar…</p>;
  const initialDate = calendarDate(date) ?? (focus && Number.isFinite(Date.parse(focus)) ? localDate(new Date(focus)) : undefined);
  return <Calendar key={slug} slug={slug} initialDate={initialDate} initialView={calendarView(view) ?? (mobile ? "listWeek" : "dayGridMonth")} />;
}
