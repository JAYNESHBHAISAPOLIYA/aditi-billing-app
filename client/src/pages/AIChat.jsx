import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

const QUICK_QUESTIONS = [
  'Project ni current progress ketli che?',
  'Aaj no total kharcho ketlo?',
  'BOQ ma konsi item pending che?',
  'Project finish hase kyare?',
  'Sabse costly item kaun sa hai?',
  'What is the total BOQ amount?',
];

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function AIChat() {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
  }, []);

  useEffect(() => {
    if (siteId) {
      api.get(`/api/ai/chat-history/${siteId}`)
        .then(data => setHistory(data.slice(0, 10).reverse()))
        .catch(console.error);
    }
  }, [siteId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (question) => {
    const q = (question || input).trim();
    if (!q || !siteId) return;
    setInput('');
    const userMsg = { role: 'user', content: q, time: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await api.post(`/api/ai/ask/${siteId}`, { question: q });
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: res.answer,
          tables: res.tables_used,
          time: new Date().toISOString()
        }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'error', content: `Error: ${err.message}`, time: new Date().toISOString() }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert('Speech recognition not supported in this browser.');
    const rec = new SR();
    rec.lang = 'gu-IN';
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
    };
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
  };

  const exportChat = () => {
    const lines = messages.map(m =>
      `[${m.time}] ${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`
    ).join('\n\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-chat-export.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const allMessages = [
    ...history.map(h => [
      { role: 'user', content: h.question, time: h.created_at, fromHistory: true },
      { role: 'assistant', content: h.answer, time: h.created_at, fromHistory: true }
    ]).flat(),
    ...messages
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h1 className="text-2xl font-bold">🤖 AI Construction Assistant</h1>
        <div className="flex gap-2">
          <select
            value={siteId}
            onChange={e => { setSiteId(e.target.value); setMessages([]); }}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select Site *</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
          <button onClick={exportChat} disabled={messages.length === 0}
            className="bg-gray-100 border px-3 py-2 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50">
            📥 Export
          </button>
        </div>
      </div>

      {!siteId && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center text-blue-700">
          <p className="text-lg font-medium">Select a site to start chatting with the AI assistant.</p>
          <p className="text-sm mt-1">You can ask questions in Gujarati, Hindi, or English.</p>
        </div>
      )}

      {siteId && (
        <>
          {/* Quick questions */}
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={loading}
                className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Chat messages */}
          <div className="flex-1 bg-gray-50 rounded-xl border overflow-y-auto p-4 space-y-4 mb-3">
            {allMessages.length === 0 && (
              <div className="text-center text-gray-400 mt-8">
                <p className="text-4xl mb-2">💬</p>
                <p>Ask anything about your project in Gujarati, Hindi, or English.</p>
                <p className="text-sm mt-1">Example: "DI K7 pipe 100mm ketli lagi?" or "Total budget used?"</p>
              </div>
            )}
            {allMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${msg.role === 'user' ? 'bg-blue-600 text-white' : msg.role === 'error' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-white border shadow-sm'} rounded-xl px-4 py-3`}>
                  {msg.role !== 'user' && (
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-xs font-semibold text-gray-500">{msg.fromHistory ? '🕐 Previous Chat' : '🤖 AI'}</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.tables && (
                    <p className="text-xs text-gray-400 mt-1">
                      From: {Array.isArray(msg.tables) ? msg.tables.join(', ') : msg.tables}
                    </p>
                  )}
                  <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                    {formatTime(msg.time)}
                  </p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border shadow-sm rounded-xl px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
            <button
              type="button"
              onClick={startVoice}
              className={`p-3 rounded-xl border ${listening ? 'bg-red-100 text-red-600 border-red-300 animate-pulse' : 'bg-gray-100 hover:bg-gray-200'}`}
              title="Voice input (Gujarati)"
            >
              🎤
            </button>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type in Gujarati, Hindi, or English... (e.g. Project ni progress ketli che?)"
              className="flex-1 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-blue-600 text-white px-5 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
