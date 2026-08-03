// Server-side only. AIRTABLE_TOKEN is read from environment variables set
// in Vercel (never exposed to the browser). This route is the ONLY thing
// that talks to Airtable directly.

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appf3APfG2HK8EgBH';
const TABLE_ID = process.env.AIRTABLE_HABITS_TABLE_ID || 'tbl60IvijqeQLO610';

const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

async function airtableFetch(path, options = {}) {
  const res = await fetch(`${AIRTABLE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Airtable error ${res.status}`);
  }
  return data;
}

export default async function handler(req, res) {
  if (!AIRTABLE_TOKEN) {
    return res.status(500).json({ error: 'Server is not configured with an Airtable token.' });
  }

  try {
    if (req.method === 'GET') {
      // Fetch all records, optionally filtered by member name
      const { member } = req.query;
      let allRecords = [];
      let offset;
      do {
        const params = new URLSearchParams();
        if (offset) params.set('offset', offset);
        if (member) {
          params.set(
            'filterByFormula',
            `LOWER({Member Name}) = LOWER("${member.replace(/"/g, '\\"')}")`
          );
        }
        params.set('pageSize', '100');
        const data = await airtableFetch(`?${params.toString()}`);
        allRecords = allRecords.concat(data.records || []);
        offset = data.offset;
      } while (offset);

      return res.status(200).json({ records: allRecords });
    }

    if (req.method === 'POST') {
      // Create a new day's entry
      const { fields } = req.body;
      if (!fields || !fields['Member Name'] || !fields['Date']) {
        return res.status(400).json({ error: 'Member Name and Date are required.' });
      }
      const data = await airtableFetch('', {
        method: 'POST',
        body: JSON.stringify({ records: [{ fields }] }),
      });
      return res.status(200).json({ record: data.records[0] });
    }

    if (req.method === 'PATCH') {
      // Update an existing day's entry
      const { recordId, fields } = req.body;
      if (!recordId || !fields) {
        return res.status(400).json({ error: 'recordId and fields are required.' });
      }
      const data = await airtableFetch('', {
        method: 'PATCH',
        body: JSON.stringify({ records: [{ id: recordId, fields }] }),
      });
      return res.status(200).json({ record: data.records[0] });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown server error' });
  }
}
