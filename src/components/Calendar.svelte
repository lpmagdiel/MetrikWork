<script>
  import { ChevronLeft, ChevronRight } from "lucide-svelte";

  let {
    onDateSelect = (date) => {},
    selectedStart = $bindable(null),
    selectedEnd = $bindable(null),
  } = $props();

  let currentMonth = $state(new Date().getMonth());
  let currentYear = $state(new Date().getFullYear());

  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  const daysInMonth = $derived(
    new Date(currentYear, currentMonth + 1, 0).getDate(),
  );
  const firstDayOfMonth = $derived(
    new Date(currentYear, currentMonth, 1).getDay(),
  );

  const days = $derived.by(() => {
    const daysArray = [];
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfMonth; i++) {
      daysArray.push(null);
    }
    // Add actual days
    for (let i = 1; i <= daysInMonth; i++) {
      daysArray.push(new Date(currentYear, currentMonth, i));
    }
    return daysArray;
  });

  function prevMonth() {
    if (currentMonth === 0) {
      currentMonth = 11;
      currentYear--;
    } else {
      currentMonth--;
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear++;
    } else {
      currentMonth++;
    }
  }

  function selectDate(date) {
    if (!date) return;

    if (!selectedStart || (selectedStart && selectedEnd)) {
      // Start new range
      selectedStart = date;
      selectedEnd = null;
    } else {
      // Complete range
      if (date < selectedStart) {
        selectedEnd = selectedStart;
        selectedStart = date;
      } else {
        selectedEnd = date;
      }
    }

    if (selectedStart && selectedEnd) {
      onDateSelect({ start: selectedStart, end: selectedEnd });
    }
  }

  function isInRange(date) {
    if (!date || !selectedStart) return false;
    if (!selectedEnd) return date.getTime() === selectedStart.getTime();
    return date >= selectedStart && date <= selectedEnd;
  }

  function isRangeStart(date) {
    return date && selectedStart && date.getTime() === selectedStart.getTime();
  }

  function isRangeEnd(date) {
    return date && selectedEnd && date.getTime() === selectedEnd.getTime();
  }
</script>

<div class="calendar">
  <div class="calendar-header">
    <button class="nav-btn" onclick={prevMonth}>
      <ChevronLeft size={20} />
    </button>
    <span class="month-year">{monthNames[currentMonth]} {currentYear}</span>
    <button class="nav-btn" onclick={nextMonth}>
      <ChevronRight size={20} />
    </button>
  </div>

  <div class="weekdays">
    <div class="weekday">D</div>
    <div class="weekday">L</div>
    <div class="weekday">M</div>
    <div class="weekday">M</div>
    <div class="weekday">J</div>
    <div class="weekday">V</div>
    <div class="weekday">S</div>
  </div>

  <div class="days-grid">
    {#each days as day}
      <button
        class="day"
        class:empty={!day}
        class:in-range={isInRange(day)}
        class:range-start={isRangeStart(day)}
        class:range-end={isRangeEnd(day)}
        onclick={() => selectDate(day)}
        disabled={!day}
      >
        {day ? day.getDate() : ""}
      </button>
    {/each}
  </div>
</div>

<style>
  .calendar {
    background: white;
    border-radius: 16px;
    padding: 16px;
  }

  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .nav-btn {
    background: #f5f5f5;
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #333;
    transition: all 0.2s;
  }

  .nav-btn:hover {
    background: var(--success-color);
    color: white;
  }

  .month-year {
    font-size: 15px;
    font-weight: 700;
    color: #333;
  }

  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    margin-bottom: 8px;
  }

  .weekday {
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: #878787;
    padding: 4px;
  }

  .days-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }

  .day {
    aspect-ratio: 1;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #333;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
  }

  .day.empty {
    cursor: default;
  }

  .day:not(.empty):hover {
    background: var(--bg-accent-subtle);
  }

  .day.in-range {
    background: var(--bg-accent-subtle);
  }

  .day.range-start,
  .day.range-end {
    background: var(--success-color);
    color: white;
  }

  .day.range-start {
    border-radius: 8px 0 0 8px;
  }

  .day.range-end {
    border-radius: 0 8px 8px 0;
  }

  .day.range-start.range-end {
    border-radius: 8px;
  }
</style>
