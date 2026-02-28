import template from './calendar.html?raw';
import './calendar.css';

export function renderCalendarPage(outlet) {
  outlet.innerHTML = template;
}
