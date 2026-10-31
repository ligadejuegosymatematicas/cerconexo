const form = document.getElementById('pilotLogin'), problem = document.getElementById('pilotProblem');
form.addEventListener('submit', async event => {
  event.preventDefault(); problem.textContent = ''; const button = form.querySelector('button'); button.disabled = true;
  try {
    const credential = new FormData(form).get('credential');
    const response = await fetch('/pilot/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential }), cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? 'No se pudo entrar.');
    form.reset();
    const next = new URL(new URLSearchParams(location.search).get('return') ?? '/', location.origin);
    location.replace(next.origin === location.origin && !next.pathname.startsWith('/pilot/') && !next.pathname.startsWith('/api/') ? next.pathname + next.search : '/');
  } catch (error) { problem.textContent = error.message; }
  finally { button.disabled = false; }
});
