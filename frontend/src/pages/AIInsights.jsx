import React, { useState, useRef, useEffect } from 'react';
import { callAI } from '../api';
import { aiFeatures } from '../modules';

function parseMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
  // Handle table-like output
  html = html.replace(/\|(.+)\|/g, (match) => {
    const cells = match.split('|').filter(c => c.trim());
    if (cells.every(c => /^[\s-:]+$/.test(c))) return '';
    const tag = cells.length > 0 ? 'td' : 'td';
    return '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
  });
  return html;
}

function AIResult({ text }) {
  if (!text) return null;
  return <div className="ai-result" dangerouslySetInnerHTML={{ __html: parseMarkdown(text) }} />;
}

function ChatInterface({ feature }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (text) => {
    const userMsg = text || input;
    if (!userMsg.trim()) return;
    setInput('');
    const newMsgs = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMsgs);
    setLoading(true);
    try {
      const data = await callAI(feature.key, { messages: newMsgs });
      setMessages([...newMsgs, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setMessages([...newMsgs, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{feature.icon}</div>
            <p>{feature.description}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 16 }}>
              {feature.samples.map(s => (
                <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === 'assistant' ? <AIResult text={m.content} /> : m.content}
          </div>
        ))}
        {loading && <div className="chat-msg assistant"><div className="spinner" style={{ width: 18, height: 18 }} /></div>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder={`Ask the ${feature.name}...`}
          disabled={loading}
        />
        <button className="btn btn-primary" onClick={() => send()} disabled={loading || !input.trim()}>Send</button>
      </div>
    </div>
  );
}

function NLInput({ feature, onResult, setActiveLoading }) {
  const [input, setInput] = useState('');

  const ask = async (text) => {
    const q = text || input;
    if (!q.trim()) return;
    setInput('');
    setActiveLoading(true);
    try {
      const data = await callAI('nl-reporting', { prompt: q });
      onResult(data.response);
    } catch (err) {
      onResult(`Error: ${err.message}`);
    } finally {
      setActiveLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="search-input"
          style={{ flex: 1 }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask()}
          placeholder="Ask anything about your security data..."
        />
        <button className="btn btn-primary" onClick={() => ask()}>Ask</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {feature.samples.map(s => (
          <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}

export default function AIInsights() {
  const [activeFeature, setActiveFeature] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runFeature = async (feature, prompt) => {
    setActiveFeature(feature);
    if (feature.type === 'chat') return;
    if (feature.type === 'input') {
      setResult(null);
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const body = { prompt };
      if (feature.key === 'threat-assessment' && prompt?.includes('One World Trade Center')) {
        body.property = 'One World Trade Center';
      }
      const data = await callAI(feature.key, body);
      setResult(data.response);
    } catch (err) {
      setResult(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setActiveFeature(null);
    setResult(null);
    setLoading(false);
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>AI-Powered Intelligence</h2>
        <p style={{ color: 'var(--text-light)', fontSize: 14 }}>{aiFeatures.length} Gen AI features powered by real security data</p>
      </div>

      <div className="ai-grid">
        {aiFeatures.map(f => (
          <div className="ai-card" key={f.key} onClick={() => runFeature(f, f.samples[0])}>
            <div className="ai-icon">{f.icon}</div>
            <h3>{f.name}</h3>
            <p>{f.description}</p>
            <div className="sample-chips">
              {f.samples.map(s => (
                <button
                  key={s}
                  className="chip"
                  onClick={e => { e.stopPropagation(); runFeature(f, s); }}
                >
                  {s.length > 35 ? s.substring(0, 35) + '...' : s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {activeFeature && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: activeFeature.type === 'chat' ? 800 : 700 }}>
            <div className="modal-header">
              <h3>{activeFeature.icon} {activeFeature.name}</h3>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              {activeFeature.type === 'chat' ? (
                <ChatInterface feature={activeFeature} />
              ) : activeFeature.type === 'input' ? (
                <>
                  <NLInput feature={activeFeature} onResult={setResult} setActiveLoading={setLoading} />
                  {loading && <div className="loading" style={{ marginTop: 20 }}><div className="spinner" />Analyzing...</div>}
                  {result && <div style={{ marginTop: 20 }}><AIResult text={result} /></div>}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                    {activeFeature.samples.map(s => (
                      <button
                        key={s}
                        className="chip"
                        onClick={() => runFeature(activeFeature, s)}
                        disabled={loading}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {loading && <div className="loading"><div className="spinner" />Analyzing data with AI...</div>}
                  {result && <AIResult text={result} />}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
