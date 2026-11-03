const form = document.getElementById('pilotLogin');
const problem = document.getElementById('pilotProblem');

form.addEventListener('submit', async event => {
  event.preventDefault();
  problem.textContent = '';
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const credential = new FormData(form).get('credential');
    const response = await fetch('/pilot/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential }),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error((await response.json()).error?.message ?? 'No se pudo entrar.');
    form.reset();
    const next = new URL(new URLSearchParams(location.search).get('return') ?? '/', location.origin);
    const allowed = next.origin === location.origin && !/^\/(pilot|api)\//.test(next.pathname);
    location.replace(allowed ? next.pathname + next.search : '/');
  } catch (error) {
    problem.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
