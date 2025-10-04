import React, { useEffect, useMemo, useState } from 'react';

export default function DataCollection() {
  // Use same-origin in production (Vercel). In dev, use VITE_SERVER_URL or localhost.
  const baseUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_SERVER_URL || 'http://localhost:4000');

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
  const [approvedClaims, setApprovedClaims] = useState([]);
  const [loadingApproved, setLoadingApproved] = useState(false);
  const formTypeOptions = [
    'Claim Form For Rights To Community Forest Resource',
    'Title to Community Forest Rights',
    'Title for forest land under occupation',
    'title to community forest resources',
    'claim form for rights to forest land',
    'claim form for community rights',
  ];

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

  // Load UNAPPROVED claims list when filters change (only after state is selected)
  useEffect(() => {
    setClaims([]);
    if (!stateSel) return; // only render under selected state
    (async () => {
      try {
        setLoading(true);
        setError('');
        const qs = new URLSearchParams({ status: 'UNAPPROVED' });
        if (stateSel) qs.set('state', stateSel);
        const cleanDistrict = districtSel ? String(districtSel).split(',')[0].trim() : '';
        if (cleanDistrict) qs.set('district', cleanDistrict);
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

  // Load APPROVED claims state-wise when a state is selected (ignore district/village filters)
  useEffect(() => {
    setApprovedClaims([]);
    if (!stateSel) return;
    (async () => {
      try {
        setLoadingApproved(true);
        setError('');
        const qs = new URLSearchParams({ status: 'APPROVED' });
        qs.set('state', stateSel);
        // Intentionally do not filter by district/village to show all approved claims in the state
        const { data } = await fetchJSON(`${baseUrl}/api/claims/list?${qs.toString()}`);
        setApprovedClaims(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e?.message || 'Failed to load approved claims');
      } finally {
        setLoadingApproved(false);
      }
    })();
  }, [stateSel, baseUrl]);

  async function updateClaim(id, payload) {
    await fetchJSON(`${baseUrl}/api/claims/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async function updateFormTypeInline(id, value) {
    try {
      await updateClaim(id, { updates: { formType: value || null } });
      // reflect immediately in local state
      setClaims(prev => prev.map(c => c.id === id ? { ...c, formType: value } : c));
    } catch (e) {
      window.alert(e?.message || 'Failed to update form type');
    }
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


  function Badge({ count }) {
    if (!count) return null;
    return <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{count}</span>;
  }

  return (
    <div className="space-y-4 w-full">
      <div className="bg-white rounded-lg border p-4 w-full">
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

      {/* UNAPPROVED Claims table (renders only when state is selected) */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">Unapproved Claims</h3>
          {loading && <div className="text-sm text-gray-500">Loading…</div>}
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full table-fixed text-sm">
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
                    <span>{row.name || '-'}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <span>
                      {[
                        row?.address?.village,
                        row?.address?.district,
                        row?.address?.state,
                      ].filter(Boolean).join(', ') || '-'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 min-w-[260px]">
                    <div className="flex items-center gap-2">
                      <select
                        className="border rounded px-2 py-1 text-sm"
                        value={row.formType || ''}
                        onChange={e => updateFormTypeInline(row.id, e.target.value)}
                      >
                        <option value="">Select form type…</option>
                        {formTypeOptions.map(ft => (
                          <option key={ft} value={ft}>{ft}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="py-2 pr-4 space-x-2 whitespace-nowrap">
                    <button className="px-2 py-1 rounded bg-green-600 text-white" onClick={() => onApprove(row.id)}>Accept</button>
                    <button className="px-2 py-1 rounded bg-red-600 text-white" onClick={() => onReject(row.id)}>Reject</button>
                  </td>
                </tr>
              ))}
              {claims.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">{stateSel ? 'No pending claims for selected filters.' : 'Select a state to view unapproved claims.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* APPROVED Claims table (state-wise) */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">Approved Claims {stateSel ? `(State: ${stateSel})` : ''}</h3>
          {loadingApproved && <div className="text-sm text-gray-500">Loading…</div>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2 pr-4">Approved Date</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Address</th>
                <th className="py-2 pr-4">Form Type</th>
              </tr>
            </thead>
            <tbody>
              {approvedClaims.map(row => (
                <tr key={row.id} className="border-b align-top">
                  <td className="py-2 pr-4">
                    {row.appliedDate ? new Date(row.appliedDate).toLocaleString() : '-'}
                  </td>
                  <td className="py-2 pr-4">
                    <span>{row.name || '-'}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <span>
                      {[
                        row?.address?.village,
                        row?.address?.district,
                        row?.address?.state,
                      ].filter(Boolean).join(', ') || '-'}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{row.formType || '-'}</td>
                </tr>
              ))}
              {approvedClaims.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-gray-500">{stateSel ? 'No approved claims found for this state.' : 'Select a state to view approved claims.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
