export const dynamic = "force-dynamic";

export default function Ping() {
  return <pre>pong {new Date().toISOString()}</pre>;
}
