import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

const QUICK_QUESTIONS = [
  { label: 'BOQ progress?', q: 'Show overall BOQ completion percentage and balance quantities for all items.' },
  { label: 'Aaj no kharcho?', q: 'Aaj no total kharcho batavo - labour, fuel, material badhu.' },
  { label: 'Total budget used?', q: 'How much of the total budget has been spent so far? Show percentage remaining.' },
  { label: 'Pipe ketti lagi?', q: 'DI pipe ketli lagi che? Tender quantity vs used quantity batavo.' },
  { label: 'Project finish date?', q: 'Current progress jota project kyare complete thashe? Estimate batavo.' },
  { label: 'Labour this month?', q: 'This month ni total labour cost ketli che?' },
];

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function AIChat() {
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState('');
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!selectedSite) return;
    setLoadingHistory(true);
    api.get(`/api/ai/chat-history/${selectedSite}`)
      .then(rows => {
        const hist = [...rows].reverse().flatMap(r => ([
          { role: 'user', text: r.question, ts: r.created_at },
          { role: 'ai', text: r.answer, tables: r.tables_referenced, ts: r.created_at },
        ]));
        setMessages(hist);
      })
      .catch(console.error)
      .finally(() => setLoadingHistory(false));
  }, [selectedSite]);

  const sendMessage = async (question) => {
    if (!question.trim() || !selectedSite) return;
    const userMsg = { role: 'user', text: question, ts: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');
    try {
      const data = await api.post(`/api/ai/ask/${selectedSite}`, { question });
      setMessages(prev => [...prev, {
        role: 'ai', text: data.answer,
        tables: data.tables_referenced?.join(', '),
        ts: new Date().toISOString(),
      }]);
    } catch (err) {
      const errMsg = err.message || 'AI request failed';
      setError(errMsg);
      setMessages(prev => [...prev, { role: 'error', text: errMsg, ts: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input not supported in this browser.');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'gu-IN';
    recognition.interimResults = false;
    recognition.onresult = (e) => setInput(e.results[0][0].transcript);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const exportChat = () => {
    const lines = messages.map(m => `[${m.role.toUpperCase()}] ${m.text}`).join('\n\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ai-chat-${selectedSite}-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 100px)' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h1 className="text-2xl font-bold">🤖 AI Construction Assistant</h1>
        <div className="flex gap-2 flex-wrap">
          <select
            value={selectedSite}
            onChange={e => setSelectedSite(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select Project / Site</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
          {messages.length > 0 && (
            <button onClick={exportChat} className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-sm">
              📥 Export Chat
            </button>
          )}
        </div>
      </div>

      {!selectedSite ? (
        <div className="flex-1 flex items-center justify-center bg-white rounded-xl shadow">
          <div className="text-center text-gray-400 p-8">
            <div className="text-6xl mb-4">🏗️</div>
            <p className="text-lg font-medium">Select a project to start chatting</p>
            <p className="text-sm mt-2">Ask anything in Gujarati, Hindi, or English</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 bg-white rounded-xl shadow overflow-hidden">
          {/* Quick questions */}
          <div className="p-3 border-b bg-blue-50 flex gap-2 flex-wrap">
            <span className="text-xs text-blue-600 font-medium self-center">Quick:</span>
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q.label}
                onClick={() => sendMessage(q.q)}
                disabled={loading}
                className="text-xs bg-white border border-blue-300 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-100 disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loadingHistory && (
              <div className="text-center text-gray-400 text-sm py-4">Loading history…</div>
            )}
            {!loadingHistory && messages.length === 0 && (
              <div className="text-center text-gray-400 py-8">
                <div className="text-4xl mb-2">💬</div>
                <p>Ask anything about your project!</p>
                <p className="text-sm mt-1 text-gray-300">Examples: "BOQ progress?", "Aaj no kharcho?", "Project status?"</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-2xl ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : msg.role === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}>
                    {msg.role === 'ai' && <span className="text-blue-600 font-bold mr-1">🤖</span>}
                    {msg.text}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{formatTime(msg.ts)}</span>
                    {msg.role === 'ai' && msg.tables && (
                      <span className="text-xs text-blue-400 bg-blue-50 px-2 py-0.5 rounded-full">
                        From: {msg.tables}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-sm text-sm text-gray-500">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>•</span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>•</span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>•</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t bg-gray-50">
            {error && <p className="text-red-500 text-xs mb-2 px-1">{error}</p>}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask in Gujarati, Hindi, or English…"
                className="flex-1 border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                disabled={loading}
              />
              <button
                type="button"
                onClick={startVoice}
                className={`px-3 py-2 rounded-xl border text-sm ${isListening ? 'bg-red-500 text-white border-red-500' : 'bg-white hover:bg-gray-100'}`}
                title="Voice input (Gujarati)"
              >
                🎤
              </button>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
