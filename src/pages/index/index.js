import template from './index.html?raw';
import './index.css';

export function renderHomePage(outlet) {
  outlet.innerHTML = template;

  // Additional initialization logic for the landing page can go here
  // Router links are automatically handled by the main router if they have the 'router-link' class.
}
