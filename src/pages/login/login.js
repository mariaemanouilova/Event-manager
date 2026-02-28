import template from './login.html?raw';
import './login.css';
import { supabase } from '../../supabase.js';
import { navigateTo } from '../../router/router.js';

export function renderLoginPage(outlet) {
  outlet.innerHTML = template;

  setupLoginForm();
  setupRegisterForm();
}

/* ── Login ────────────────────────────────────────────────── */
function setupLoginForm() {
  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  const spinner = document.getElementById('login-spinner');
  const btn = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('d-none');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showError(errorBox, 'Please fill in all fields.');
      return;
    }

    setLoading(btn, spinner, true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(btn, spinner, false);

    if (error) {
      showError(errorBox, error.message);
      return;
    }

    // On successful login, navigate to the Calendar page
    navigateTo('/calendar');
  });
}

/* ── Register ─────────────────────────────────────────────── */
function setupRegisterForm() {
  const form = document.getElementById('register-form');
  const errorBox = document.getElementById('register-error');
  const successBox = document.getElementById('register-success');
  const spinner = document.getElementById('register-spinner');
  const btn = document.getElementById('register-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('d-none');
    successBox.classList.add('d-none');

    const fullName = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;

    if (!fullName || !email || !password || !confirm) {
      showError(errorBox, 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      showError(errorBox, 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      showError(errorBox, 'Passwords do not match.');
      return;
    }

    setLoading(btn, spinner, true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    setLoading(btn, spinner, false);

    if (error) {
      showError(errorBox, error.message);
      return;
    }

    // If email confirmation is required, Supabase returns a user but session may be null
    if (data?.user && !data.session) {
      successBox.textContent = 'Account created! Please check your email to confirm, then sign in.';
      successBox.classList.remove('d-none');
      form.reset();
      return;
    }

    // Auto-confirmed → go straight to calendar
    navigateTo('/calendar');
  });
}

/* ── Helpers ──────────────────────────────────────────────── */
function showError(box, message) {
  box.textContent = message;
  box.classList.remove('d-none');
}

function setLoading(btn, spinner, isLoading) {
  btn.disabled = isLoading;
  spinner.classList.toggle('d-none', !isLoading);
}
