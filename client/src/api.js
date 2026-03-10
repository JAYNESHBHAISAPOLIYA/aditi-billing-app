const getToken = () => localStorage.getItem('token');

const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`
});

const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`
});

async function request(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  get: (url) => request(url, { headers: headers() }),
  post: (url, data) => request(url, { method: 'POST', headers: headers(), body: JSON.stringify(data) }),
  put: (url, data) => request(url, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }),
  del: (url) => request(url, { method: 'DELETE', headers: headers() }),
  upload: (url, formData) => request(url, { method: 'POST', headers: authHeaders(), body: formData }),
};
