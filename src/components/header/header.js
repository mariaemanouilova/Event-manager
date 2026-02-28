import headerTemplate from './header.html?raw';
import './header.css';

export function createHeader() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = headerTemplate;
  return wrapper.firstElementChild;
}
