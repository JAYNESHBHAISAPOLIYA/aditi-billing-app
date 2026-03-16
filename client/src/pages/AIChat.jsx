import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

const QUICK_QUESTIONS = [
  { label: 'DI Pipe Balance?', q: 'DI K7 pipe 100mm ketli lagi ane ketli baki che?' },
  { label: 'Aaj no Kharcho?', q: 'Aaj no total kharcho ketlo che? (labour + fuel + material)' },
  { label: 'Project Progress?', q: 'Project nu overall progress ketla % che?' },
  { label: 'Budget Status?', q: 'Total budget mathi ketla % vaperai gaya che?' },
  { label: 'Finish Date?', q: 'Current progress mujab project kyare finish thase?' },
  { label: 'BOQ Summary?', q: 'BOQ items ni summary apo - total amount ane used amount.' },
];

export default function AIChat() {
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    api.get('/api/sites').then(data => {
      setSites(data);
      if (data.length > 0) setSelectedSite(String(data[0].id));
    }).catch(console.error);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (question) => {
    const q = question || input.trim();
    if (!q) return;
    if (!selectedSite) { alert('Please select a site first'); return; }

    const userMsg = { role: 'user', text: q, ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post(`/api/ai/ask/${selectedSite}`, { question: q });
      setMessages(prev => [...prev, {
        role: 'ai',
        text: res.answer,
        sources: res.tables_referenced,
        ts: new Date(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: `❌ Error: ${err.message}`,
        ts: new Date(),
      }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const exportChat = () => {
    const text = messages.map(m => `[${m.role.toUpperCase()}] ${m.text}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ai_chat_export.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  const clearChat = () => { if (confirm('Clear chat history?')) setMessages([]); };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = ts instanceof Date ? ts : new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h1 className="text-2xl font-bold">🤖 AI Construction Assistant</h1>
        <div className="flex gap-2 flex-wrap">
          <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">-- Select Site --</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
          <button onClick={exportChat} className="text-sm border px-3 py-2 rounded-lg hover:bg-gray-50" title="Export chat">📤 Export</button>
          <button onClick={clearChat} className="text-sm border px-3 py-2 rounded-lg hover:bg-gray-50 text-red-600" title="Clear chat">🗑️ Clear</button>
        </div>
      </div>

      {/* Quick question chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => sendMessage(q.q)}
            disabled={loading || !selectedSite}
            className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-gray-50 rounded-xl border overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-16">
            <div className="text-5xl mb-4">🏗️</div>
            <div className="text-lg font-medium">Government Construction AI Assistant</div>
            <div className="text-sm mt-2">Ask anything about your project in Gujarati, Hindi, or English.</div>
            <div className="text-sm mt-1 text-blue-500">Select a site and use quick buttons above or type your question.</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user'
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-white border shadow-sm rounded-bl-sm'}`}>
              {msg.role === 'ai' && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-blue-600">🤖 AI Assistant</span>
                </div>
              )}
              <div className={`text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'text-white' : 'text-gray-800'}`}>
                {msg.text}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="text-xs text-gray-400">From:</span>
                  {msg.sources.map((s, j) => (
                    <span key={j} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              )}
              <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                {formatTime(msg.ts)}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-xs text-gray-500">AI is thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="mt-4 flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedSite ? "Type your question (Gujarati/Hindi/English)... Press Enter to send" : "Select a site above to start chatting"}
          disabled={!selectedSite || loading}
          rows={2}
          className="flex-1 border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={() => sendMessage()}
          disabled={!selectedSite || !input.trim() || loading}
          className="bg-blue-600 text-white px-5 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span>Send</span>
          <span>➤</span>
        </button>
      </div>
      <div className="text-xs text-gray-400 mt-1 text-center">
        Press Enter to send • Shift+Enter for new line • Answers use live project data
      </div>
    </div>
  );
}
