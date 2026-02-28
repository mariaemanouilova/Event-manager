import footerTemplate from './footer.html?raw';
import './footer.css';

export function createFooter() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = footerTemplate;
  return wrapper.firstElementChild;
}
