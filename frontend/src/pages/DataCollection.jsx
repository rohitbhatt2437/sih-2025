import React, { useEffect, useMemo, useState } from 'react';

export default function DataCollection() {
  const baseUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

  const allowedStates = ['Odisha', 'Tripura', 'Telangana', 'Madhya Pradesh'];

  const [states, setStates] = useState([]); // { state, count }
  const [stateSel, setStateSel] = useState('');
  const [districts, setDistricts] = useState([]); // { district, count }
  const [districtSel, setDistrictSel] = useState('');
  const [villages, setVillages] = useState([]); // { village, count }
  const [villageSel, setVillageSel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [claims, setClaims] = useState([]); // { id, formType, status, name, appliedDate, address }

  const filteredStates = useMemo(() => {
    // Only show the four states we use, but include counts from API
    const map = new Map(states.map(s => [s.state, s.count]));
    return allowedStates.map(s => ({ state: s, count: map.get(s) || 0 }));
  }, [states]);

  async function fetchJSON(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  // Load states with UNAPPROVED counts
  useEffect(() => {
    (async () => {
      try {
        setError('');
        const { data } = await fetchJSON(`${baseUrl}/api/claims/states?status=UNAPPROVED`);
        setStates(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e?.message || 'Failed to load states');
      }
    })();
  }, [baseUrl]);

  // Load districts when state changes
  useEffect(() => {
    setDistrictSel('');
    setVillageSel('');
    setDistricts([]);
    setVillages([]);
    setClaims([]);
    if (!stateSel) return;
    (async () => {
      try {
        setError('');
        const { data } = await fetchJSON(`${baseUrl}/api/claims/districts?state=${encodeURIComponent(stateSel)}&status=UNAPPROVED`);
        setDistricts(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e?.message || 'Failed to load districts');
      }
    })();
  }, [stateSel, baseUrl]);

  // Load villages when district changes
  useEffect(() => {
    setVillageSel('');
    setVillages([]);
    setClaims([]);
    if (!stateSel || !districtSel) return;
    (async () => {
      try {
        setError('');
        const { data } = await fetchJSON(`${baseUrl}/api/claims/villages?state=${encodeURIComponent(stateSel)}&district=${encodeURIComponent(districtSel)}&status=UNAPPROVED`);
        setVillages(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e?.message || 'Failed to load villages');
      }
    })();
  }, [districtSel, stateSel, baseUrl]);

  // Load claims list when village or filters change
  useEffect(() => {
    setClaims([]);
    if (!stateSel) return;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const qs = new URLSearchParams({ status: 'UNAPPROVED' });
        if (stateSel) qs.set('state', stateSel);
        if (districtSel) qs.set('district', districtSel);
        if (villageSel) qs.set('village', villageSel);
        const { data } = await fetchJSON(`${baseUrl}/api/claims/list?${qs.toString()}`);
        setClaims(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e?.message || 'Failed to load claims');
      } finally {
        setLoading(false);
      }
    })();
  }, [stateSel, districtSel, villageSel, baseUrl]);

  async function updateClaim(id, payload) {
    await fetchJSON(`${baseUrl}/api/claims/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async function onApprove(id) {
    await updateClaim(id, { status: 'APPROVED' });
    // Refresh current list
    const qs = new URLSearchParams({ status: 'UNAPPROVED' });
    if (stateSel) qs.set('state', stateSel);
    if (districtSel) qs.set('district', districtSel);
    if (villageSel) qs.set('village', villageSel);
    const { data } = await fetchJSON(`${baseUrl}/api/claims/list?${qs.toString()}`);
    setClaims(Array.isArray(data) ? data : []);
    // Also refresh aggregates for badges
    const s = await fetchJSON(`${baseUrl}/api/claims/states?status=UNAPPROVED`);
    setStates(s.data || []);
    if (stateSel) {
      const d = await fetchJSON(`${baseUrl}/api/claims/districts?state=${encodeURIComponent(stateSel)}&status=UNAPPROVED`);
      setDistricts(d.data || []);
      if (districtSel) {
        const v = await fetchJSON(`${baseUrl}/api/claims/villages?state=${encodeURIComponent(stateSel)}&district=${encodeURIComponent(districtSel)}&status=UNAPPROVED`);
        setVillages(v.data || []);
      }
    }
  }

  async function onReject(id) {
    const reason = window.prompt('Enter rejection reason (optional):') || '';
    await updateClaim(id, { status: 'REJECTED', rejectionReason: reason });
    await onApprove(id); // reuse reload logic
  }

  function EditableCell({ value, onSave }) {
    const [v, setV] = useState(value || '');
    const [editing, setEditing] = useState(false);
    return (
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input className="border rounded px-2 py-1 text-sm" value={v} onChange={e => setV(e.target.value)} />
            <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded" onClick={() => { setEditing(false); onSave(v); }}>Save</button>
            <button className="text-xs px-2 py-1" onClick={() => { setEditing(false); setV(value || ''); }}>Cancel</button>
          </>
        ) : (
          <>
            <span>{value || '-'}</span>
            <button className="text-xs text-blue-600 underline" onClick={() => setEditing(true)}>Edit</button>
          </>
        )}
      </div>
    );
  }

  async function onInlineEdit(id, fieldPath, newValue) {
    // fieldPath examples: 'claimantInfo.name', 'location.gramPanchayat', 'claimantInfo.address'
    await updateClaim(id, { updates: { [fieldPath]: newValue } });
  }

  function Badge({ count }) {
    if (!count) return null;
    return <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{count}</span>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Data Collection - Pending Review</h2>

        {/* State pills with pending badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          {filteredStates.map(s => (
            <button key={s.state}
              className={`px-3 py-1 rounded-full border ${stateSel === s.state ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
              onClick={() => setStateSel(s.state)}
            >
              {s.state}
              <Badge count={s.count} />
            </button>
          ))}
        </div>

        {/* District chips */}
        {stateSel && (
          <div className="flex flex-wrap gap-2 mb-3">
            {districts.map(d => (
              <button key={d.district}
                className={`px-3 py-1 rounded-full border ${districtSel === d.district ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'}`}
                onClick={() => setDistrictSel(d.district)}
              >
                {d.district}
                <Badge count={d.count} />
              </button>
            ))}
          </div>
        )}

        {/* Village chips */}
        {districtSel && (
          <div className="flex flex-wrap gap-2 mb-3">
            {villages.map(v => (
              <button key={v.village}
                className={`px-3 py-1 rounded-full border ${villageSel === v.village ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300'}`}
                onClick={() => setVillageSel(v.village)}
              >
                {v.village}
                <Badge count={v.count} />
              </button>
            ))}
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>

      {/* Claims table */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">Unapproved Claims</h3>
          {loading && <div className="text-sm text-gray-500">Loading…</div>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2 pr-4">Applied Date</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Address</th>
                <th className="py-2 pr-4">Form Type</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map(row => (
                <tr key={row.id} className="border-b align-top">
                  <td className="py-2 pr-4">
                    {row.appliedDate ? new Date(row.appliedDate).toLocaleString() : '-'}
                  </td>
                  <td className="py-2 pr-4">
                    <EditableCell value={row.name} onSave={(v) => onInlineEdit(row.id, 'claimantInfo.name', v)} />
                  </td>
                  <td className="py-2 pr-4">
                    <div className="space-y-1">
                      <EditableCell value={row.address.full} onSave={(v) => onInlineEdit(row.id, 'claimantInfo.address', v)} />
                      <div className="text-xs text-gray-600">
                        <EditableCell value={row.address.state} onSave={(v) => onInlineEdit(row.id, 'location.state', v)} />
                        {', '}
                        <EditableCell value={row.address.district} onSave={(v) => onInlineEdit(row.id, 'location.district', v)} />
                        {', '}
                        <EditableCell value={row.address.tehsilTaluka} onSave={(v) => onInlineEdit(row.id, 'location.tehsilTaluka', v)} />
                        {', '}
                        <EditableCell value={row.address.gramPanchayat} onSave={(v) => onInlineEdit(row.id, 'location.gramPanchayat', v)} />
                        {', '}
                        <EditableCell value={row.address.village} onSave={(v) => onInlineEdit(row.id, 'location.villageGramSabha', v)} />
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-4">{row.formType || '-'}</td>
                  <td className="py-2 pr-4 space-x-2 whitespace-nowrap">
                    <button className="px-2 py-1 rounded bg-green-600 text-white" onClick={() => onApprove(row.id)}>Approve</button>
                    <button className="px-2 py-1 rounded bg-red-600 text-white" onClick={() => onReject(row.id)}>Reject</button>
                  </td>
                </tr>
              ))}
              {claims.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">No pending claims for selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
