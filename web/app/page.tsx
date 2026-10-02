async function getFloor() {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:5174";
  try {
    const r = await fetch(`${base}/api/floor`, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export default async function Page() {
  const floor = await getFloor();
  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>Money Beast Capital · Trading Floor</h1>
      {!floor ? (
        <p>Backend no disponible (KV sin conectar o semilla pendiente).</p>
      ) : (
        <>
          <p>Patrimonio: <b>{floor.equity}€</b> · Día: <b>{floor.dayPnl}€</b> · Exposición: {floor.exposure}%</p>
          <p>Agentes: {floor.counts.agents} · Abiertas: {floor.counts.open} · Comité: {floor.committee ? "sí" : "no"}</p>
          <h2>Últimos mensajes</h2>
          <ul>
            {floor.msgs.slice(-10).map((m: any) => (
              <li key={m.id}><b>{m.from}:</b> {m.text}</li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
