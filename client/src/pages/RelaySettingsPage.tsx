import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Network, Save, TestTube2 } from 'lucide-react';
import { apiFetch } from '../services/apiClient';

type RelayConfig = { enabled: boolean; url: string; hasSecret: boolean };

export const RelaySettingsPage: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    apiFetch('/api/vpbank/relay-config')
      .then(async response => {
        if (!response.ok) throw new Error((await response.json()).error || 'Không tải được cấu hình');
        return response.json() as Promise<RelayConfig>;
      })
      .then(config => {
        setEnabled(config.enabled);
        setUrl(config.url);
        setHasSecret(config.hasSecret);
      })
      .catch(error => setResult({ ok: false, message: error.message }))
      .finally(() => setLoading(false));
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const response = await apiFetch('/api/vpbank/relay-config', {
        method: 'PUT',
        body: JSON.stringify({ enabled, url, ...(secret ? { secret } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lưu cấu hình thất bại');
      setHasSecret(data.hasSecret);
      setSecret('');
      setResult({ ok: true, message: 'Đã lưu cấu hình relay. Worker sẽ dùng cấu hình này ở lần đồng bộ tiếp theo.' });
    } catch (error: any) {
      setResult({ ok: false, message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const response = await apiFetch('/api/vpbank/relay-config/test', { method: 'POST', body: '{}' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || data.message || 'Relay chưa truy cập được VPBank');
      setResult({ ok: true, message: `${data.message} (HTTP ${data.status})` });
    } catch (error: any) {
      setResult({ ok: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin" /> Đang tải cấu hình...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3"><Network className="w-7 h-7 text-blue-600" /> VPBank Relay</h1>
        <p className="mt-2 text-gray-600">Đổi IP outbound dùng để gọi VPBank mà không cần chuyển server BillGate.</p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-sm text-amber-900">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>Chỉ dùng relay do bạn quản lý. Nên dùng URL HTTPS vì request chứa Key Share/PIN Share. Secret đã lưu sẽ không được gửi ngược lại trình duyệt.</div>
      </div>

      <form onSubmit={save} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <label className="flex items-center justify-between gap-4">
          <div><div className="font-semibold text-gray-900">Bật VPBank Relay</div><div className="text-sm text-gray-500">Áp dụng cho kiểm tra kết nối và đồng bộ giao dịch của tài khoản bạn.</div></div>
          <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="w-5 h-5 accent-blue-600" />
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Relay URL</label>
          <input required type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://relay.example.com" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Relay secret</label>
          <div className="relative">
            <input type={showSecret ? 'text' : 'password'} value={secret} onChange={event => setSecret(event.target.value)} placeholder={hasSecret ? 'Đã lưu — để trống nếu không đổi' : 'Tối thiểu 24 ký tự'} className="w-full px-3 py-2.5 pr-11 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="button" onClick={() => setShowSecret(value => !value)} className="absolute right-3 top-2.5 text-gray-500">{showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
          </div>
        </div>

        {result && <div className={`rounded-lg p-3 flex gap-2 text-sm ${result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{result.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}<span>{result.message}</span></div>}

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu cấu hình</button>
          <button type="button" onClick={test} disabled={testing || !enabled} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">{testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />} Kiểm tra relay</button>
        </div>
      </form>
    </div>
  );
};
