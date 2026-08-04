// Server-side only. ADMIN_PASSCODE is read from environment variables set
// in Vercel — never exposed in the repo or the browser bundle. This is what
// makes the admin gate a real check instead of a client-side stub.

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!ADMIN_PASSCODE) {
    return res.status(500).json({ error: 'Admin passcode is not configured on the server.' });
  }

  const { passcode } = req.body || {};

  if (typeof passcode === 'string' && passcode === ADMIN_PASSCODE) {
    return res.status(200).json({ ok: true });
  }

  return res.status(401).json({ ok: false, error: 'Incorrect passcode.' });
}
