// Author: Claude Code
// CalendarView — monthly grid for the Calendar system space.
// Days with indexed objects show a filled dot. Clicking a day enters that day's view.

import { useState } from 'react';
import { useIndexStore } from '../store/index';
import './CalendarView.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS   = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

function pad(n) { return String(n).padStart(2, '0'); }

export default function CalendarView() {
  const getDatesWithObjects = useIndexStore(s => s.getDatesWithObjects);
  const enterCalendarDay    = useIndexStore(s => s.enterCalendarDay);

  const today      = new Date();
  const todayStr   = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const datesWithObjects = getDatesWithObjects();

  const firstDay     = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  // Build grid cells: leading empty + day cells
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <button className="calendar-nav" onClick={prevMonth} aria-label="Previous month">‹</button>
        <span className="calendar-month-label">{MONTHS[viewMonth]} {viewYear}</span>
        <button className="calendar-nav" onClick={nextMonth} aria-label="Next month">›</button>
      </div>

      <div className="calendar-weekdays">
        {WEEKDAYS.map(d => <span key={d} className="calendar-weekday">{d}</span>)}
      </div>

      <div className="calendar-grid">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="calendar-cell empty" />;

          const dateStr  = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
          const isToday  = dateStr === todayStr;
          const isFuture = dateStr > todayStr;
          const hasDot   = datesWithObjects.has(dateStr);

          return (
            <div
              key={dateStr}
              className={`calendar-cell${isToday ? ' today' : ''}${isFuture ? ' future' : ''}`}
              onClick={() => enterCalendarDay(dateStr)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && enterCalendarDay(dateStr)}
            >
              <span className="calendar-day-number">{day}</span>
              {hasDot && <span className="calendar-dot" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
