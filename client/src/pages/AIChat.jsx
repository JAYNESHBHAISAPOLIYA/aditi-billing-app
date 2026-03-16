import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

const QUICK_QUESTIONS = [
  { label: 'BOQ Status', text: 'What is the overall BOQ completion status?' },
  { label: 'Pipe Status (Gujarati)', text: 'DI K7 pipe 100mm ketli lagi?' },
  { label: "Today's Cost", text: 'Aaj no total kharcho ketlo thai?' },
  { label: 'Project Progress', text: 'Project ni current progress ketla percent che?' },
  { label: 'Balance Work', text: 'Remaining work and balance amount ketlo che?' },
  { label: 'Completion Date', text: 'Project finish hase kyare?' },
];

function formatTime(date) {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function AIChat() {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      text: 'Namaste! 🙏 I am your Government Construction ERP AI assistant.\n\nYou can ask me anything about your project in Gujarati, Hindi, or English.\n\nPlease select a site above to get started.',
      time: new Date(),
      sources: [],
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef();
  const recognitionRef = useRef(null);

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
  }, []);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = async (text) => {
    const question = (text || input).trim();
    if (!question) return;
    if (!siteId) {
      setMessages(prev => [...prev, {
        id: Date.now(), role: 'assistant',
        text: 'Please select a site first to ask project-specific questions.',
        time: new Date(), sources: [],
      }]);
      return;
    }
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: question, time: new Date() }]);
    setInput('');
    setLoading(true);
    try {
      const data = await api.post('/api/ai/ask/' + siteId, { question });
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        text: data.answer,
        time: new Date(),
        sources: data.sources || [],
        mock: data.mock,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: 'assistant',
        text: 'Sorry, I could not process your question. Error: ' + e.message,
        time: new Date(), sources: [],
      }]);
    } finally {
      setLoading(false);
    }
  };

  const startVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input is not supported in your browser. Please use Chrome.');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'gu-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const exportChat = () => {
    const lines = messages.map(m =>
      '[' + formatTime(new Date(m.time)) + '] ' + (m.role === 'user' ? 'You' : 'AI') + ': ' + m.text
    );
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-chat-export.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-bold">🤖 AI Project Assistant</h1>
          <p className="text-sm text-gray-500">Ask anything in Gujarati, Hindi, or English</p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={siteId}
            onChange={e => setSiteId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select Site</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
          <button onClick={exportChat} className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-200">
            📥 Export
          </button>
        </div>
      </div>

      {/* Quick questions */}
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => sendMessage(q.text)}
            disabled={loading}
            className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-full text-xs hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-y-auto p-4 space-y-4 mb-4" style={{ maxHeight: '55vh' }}>
        {messages.map(msg => (
          <div key={msg.id} className={'flex ' + (msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={'max-w-2xl ' + (msg.role === 'user' ? 'items-end' : 'items-start') + ' flex flex-col'}>
              <div className={'px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ' + (
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              )}>
                {msg.role === 'assistant' && <span className="mr-2">🤖</span>}
                {msg.text}
              </div>
              <div className="flex items-center gap-2 mt-1 px-1">
                <span className="text-xs text-gray-400">{formatTime(new Date(msg.time))}</span>
                {msg.sources && msg.sources.length > 0 && (
                  <span className="text-xs text-blue-400">From: {msg.sources.join(', ')}</span>
                )}
                {msg.mock && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Demo mode</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-500">
              🤖 Thinking...
              <span className="inline-flex gap-1 ml-2">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white rounded-xl shadow p-3 flex gap-2">
        <button
          onClick={startVoiceInput}
          disabled={loading}
          className={'p-2 rounded-lg transition-colors ' + (listening ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
          title="Voice input (Gujarati)"
        >
          🎤
        </button>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Type your question in Gujarati, Hindi, or English... (Press Enter to send)"
          className="flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          disabled={loading}
        />
        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          Send ➤
        </button>
      </div>

      {/* Tip */}
      <p className="text-xs text-gray-400 mt-2 text-center">
        💡 Examples: "DI pipe 100mm ketli lagi?" | "Aaj no total kharcho?" | "Project finish hase kyare?"
      </p>
    </div>
  );
}
