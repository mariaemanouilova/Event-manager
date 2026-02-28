import template from './login.html?raw';
import './login.css';
import { supabase } from '../../supabase.js';
import { navigateTo } from '../../router/router.js';
import { showToast } from '../../components/toast/toast.js';

export function renderLoginPage(outlet) {
  outlet.innerHTML = template;

  setupLoginForm();
  setupRegisterForm();
}

/* ── Login ────────────────────────────────────────────────── */
function setupLoginForm() {
  const form = document.getElementById('login-form');
  const spinner = document.getElementById('login-spinner');
  const btn = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showToast('Please fill in all fields.', 'error');
      return;
    }

    setLoading(btn, spinner, true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(btn, spinner, false);

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    // On successful login, navigate to the Calendar page
    navigateTo('/calendar');
  });
}

/* ── Register ─────────────────────────────────────────────── */
function setupRegisterForm() {
  const form = document.getElementById('register-form');
  const spinner = document.getElementById('register-spinner');
  const btn = document.getElementById('register-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;

    if (!fullName || !email || !password || !confirm) {
      showToast('Please fill in all fields.', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    if (password !== confirm) {
      showToast('Passwords do not match.', 'error');
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
      showToast(error.message, 'error');
      return;
    }

    // If email confirmation is required, Supabase returns a user but session may be null
    if (data?.user && !data.session) {
      showToast('Account created! Please check your email to confirm, then sign in.', 'success');
      form.reset();
      return;
    }

    // Auto-confirmed → go straight to calendar
    showToast('Account created successfully!', 'success');
    navigateTo('/calendar');
  });
}

/* ── Helpers ──────────────────────────────────────────────── */

function setLoading(btn, spinner, isLoading) {
  btn.disabled = isLoading;
  spinner.classList.toggle('d-none', !isLoading);
}
