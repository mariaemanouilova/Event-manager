import template from './index.html?raw';
import './index.css';

export function renderLandingPage(outlet) {
  outlet.innerHTML = template;
}
