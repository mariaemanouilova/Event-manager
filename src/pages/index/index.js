import template from './index.html?raw';
import './index.css';

export function renderHomePage(outlet) {
  outlet.innerHTML = template;
}
