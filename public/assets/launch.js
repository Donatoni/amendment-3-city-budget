const form = document.querySelector('#login-form');
const error = document.querySelector('#login-error');
const status = document.querySelector('#login-status');
const submit = form.querySelector('[type="submit"]');
const password = document.querySelector('#password');
const toggle = document.querySelector('#password-toggle');
const params = new URLSearchParams(location.search);
const errors = {
  invalid: 'The username or password is incorrect. Please try again.',
  unavailable: 'Reviewer access is not configured yet. Please try again later.',
  limited: 'Too many sign-in attempts. Please try again in 15 minutes.',
  request: 'We couldn’t sign you in. Refresh this page and try again.',
};
if (params.has('staff')) document.querySelector('.login-description').textContent = 'Sign in with your staff email to open the dashboard. The shared reviewer account opens the budget preview only.';
function showError(message) { error.textContent = message; error.hidden = false; }
if (Object.hasOwn(errors, params.get('error'))) showError(errors[params.get('error')]);
form.elements.next.value = params.get('next') || '/';
toggle.hidden = false;
toggle.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  toggle.textContent = show ? 'Hide' : 'Show';
  toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  toggle.setAttribute('aria-pressed', String(show));
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  error.hidden = true;
  status.textContent = 'Signing you in…';
  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  let succeeded = false;
  try {
    const response = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams(new FormData(form)), credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok) { showError(data.error || errors.request); password.focus(); return; }
    succeeded = true;
    status.textContent = 'You’re signed in. Opening your workspace…';
    location.assign(data.redirect || '/');
  } catch { showError('We couldn’t connect. Check your connection and try again.'); }
  finally {
    if (!succeeded) { submit.disabled = false; status.textContent = ''; form.removeAttribute('aria-busy'); }
  }
});
