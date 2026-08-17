const ROWS: Array<{ persona: string; role: string; expected: string }> = [
  { persona: 'owner@licenseco.test', role: 'owner', expected: 'view + manage + provision' },
  { persona: 'billing@licenseco.test', role: 'billing-admin', expected: 'view + manage + provision' },
  { persona: 'admin@licenseco.test', role: 'admin', expected: 'view + manage (no provision)' },
  { persona: 'member@licenseco.test', role: 'member', expected: 'view only' },
  { persona: 'owner@otherco.test', role: 'owner (otherco)', expected: 'cross-tenant: blocked on licenseco' },
];

/** Expected-tier legend so a tester knows what each seeded persona should see. */
export default function PersonaLegend() {
  return (
    <section className="card">
      <h2>UAT persona legend</h2>
      <p className="muted small">Password for all licensing personas: <code>test1234</code></p>
      <table className="legend">
        <thead>
          <tr><th>Persona</th><th>Tenant role</th><th>Expected controls</th></tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.persona}>
              <td><code>{r.persona}</code></td>
              <td>{r.role}</td>
              <td>{r.expected}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Sign in as <code>owner@otherco.test</code> on <code>licenseco.seat.lvh.me</code> to
        eyeball the cross-tenant block (no licenseco seats/roles on the token).
      </p>
    </section>
  );
}
