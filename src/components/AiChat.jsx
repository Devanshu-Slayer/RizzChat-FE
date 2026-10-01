import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./AiChat.css";

const BOTTOM_THRESHOLD = 80;
const AI_ENDPOINT = "http://localhost:3000/api/ai/chat";
const JUDGE_ENDPOINT = "http://localhost:3000/api/judge/run";
const HISTORY_ENDPOINT = "http://localhost:3000/api/ai/history";

const LANG_ID = {
  js: 63,
  javascript: 63,
  ts: 74,
  typescript: 74,
  python: 71,
  py: 71,
  java: 62,
  c: 50,
  cpp: 54,
  "c++": 54,
  cs: 51,
  csharp: 51,
  go: 60,
  ruby: 72,
  rb: 72,
  rust: 73,
  php: 68,
  swift: 83,
  kotlin: 78,
  bash: 46,
  sh: 46,
  r: 80,
  sql: 82,
};

function getGuestId() {
  let gid = localStorage.getItem("ai_chat_guest_id");
  if (!gid) {
    gid = "guest_" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("ai_chat_guest_id", gid);
  }
  return gid;
}

function CodeBlock({ className, children }) {
  const lang = /language-(\w+)/.exec(className || "")?.[1]?.toLowerCase();
  const langId = lang ? LANG_ID[lang] : null;
  const code = String(children).replace(/\n$/, "");

  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState(null);

  const runCode = async () => {
    setRunning(true);
    setOutput(null);
    try {
      const res = await fetch(JUDGE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_code: code, language_id: langId }),
      });
      const data = await res.json();
      setOutput(data);
    } catch {
      setOutput({ stderr: "Could not reach the code execution service." });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="code-block-wrap">
      <div className="code-block-header">
        {lang && <span className="code-lang-badge">{lang}</span>}
        {langId && (
          <button
            className={`run-btn ${running ? "running" : ""}`}
            onClick={runCode}
            disabled={running}
            title="Run this code via Judge0 CE"
          >
            {running ? (
              <><span className="run-spinner" />Running…</>
            ) : (
              <>▶ Run</>
            )}
          </button>
        )}
      </div>
      <pre className="code-pre">
        <code>{code}</code>
      </pre>
      {output && (
        <div className={`run-output ${output.status?.id === 3 ? "success" : "error"}`}>
          <div className="run-output-header">
            <span className="run-status-badge">{output.status?.description ?? "Result"}</span>
            {output.time && (
              <span className="run-meta">{output.time}s · {output.memory ?? "—"} KB</span>
            )}
            <button className="clear-output-btn" onClick={() => setOutput(null)}>✕</button>
          </div>
          {output.compile_output && (
            <pre className="run-pre compile">{output.compile_output}</pre>
          )}
          {output.stdout && <pre className="run-pre stdout">{output.stdout}</pre>}
          {output.stderr && <pre className="run-pre stderr">{output.stderr}</pre>}
          {!output.stdout && !output.stderr && !output.compile_output && (
            <p className="run-empty">(no output)</p>
          )}
        </div>
      )}
    </div>
  );
}

const markdownComponents = {
  code({ className, children, ...props }) {
    const isBlock = /language-/.test(className || "");
    if (isBlock) {
      return <CodeBlock className={className}>{children}</CodeBlock>;
    }
    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  },
  p: ({ children }) => <p className="md-p">{children}</p>,
  ul: ({ children }) => <ul className="md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="md-ol">{children}</ol>,
  h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="md-a">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="md-table-wrap">
      <table className="md-table">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="md-th">{children}</th>,
  td: ({ children }) => <td className="md-td">{children}</td>,
};

const AssistantMarkdown = memo(function AssistantMarkdown({ text }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {text}
    </ReactMarkdown>
  );
});

export default function AiChat() {
  const nav = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [userKey, setUserKey] = useState(() => {
    try {
      const auth = getAuth();
      if (auth.currentUser?.email) return auth.currentUser.email;
      if (auth.currentUser?.uid) return auth.currentUser.uid;
    } catch {
    }
    return getGuestId();
  });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("ready");
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const userKeyRef = useRef(userKey);
  userKeyRef.current = userKey;

  const isBusy = status === "streaming";

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    stickToBottomRef.current = atBottom;
    setShowJump(!atBottom);
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom();
  }, [messages, status, scrollToBottom]);

  useEffect(() => {
    let unsubscribe = () => { };
    try {
      const auth = getAuth();
      unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        const nextKey = user?.email || user?.uid || getGuestId();
        setUserKey(nextKey);
      });
    } catch {
    }
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userKey) return;
    const localKey = "ai_chat_history_" + userKey;
    const cached = localStorage.getItem(localKey);
    if (cached) {
      try {
        setMessages(JSON.parse(cached));
      } catch {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }

    fetch(`${HISTORY_ENDPOINT}/${encodeURIComponent(userKey)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((serverMessages) => {
        if (Array.isArray(serverMessages) && serverMessages.length > 0) {
          setMessages(serverMessages);
          localStorage.setItem(localKey, JSON.stringify(serverMessages));
        }
      })
      .catch((err) => {
        console.error("Failed to load user chat history:", err);
      });
  }, [userKey]);

  const saveHistory = useCallback((key, msgs) => {
    if (!key) return;
    localStorage.setItem("ai_chat_history_" + key, JSON.stringify(msgs));
    fetch(`${HISTORY_ENDPOINT}/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs }),
    }).catch(() => { });
  }, []);

  const handleClearHistory = () => {
    if (!window.confirm("Clear conversation history for this account?")) return;
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setStatus("ready");
    setError(null);
    localStorage.removeItem("ai_chat_history_" + userKey);
    fetch(`${HISTORY_ENDPOINT}/${encodeURIComponent(userKey)}`, {
      method: "DELETE",
    }).catch(() => { });
  };

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isBusy) return;

    const currentKey = userKeyRef.current;
    const userMsg = { id: Date.now().toString(), role: "user", content: text };
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg = { id: assistantId, role: "assistant", content: "" };

    const updatedMessages = [...messages, userMsg];
    setMessages([...updatedMessages, assistantMsg]);
    setStatus("streaming");
    setError(null);
    stickToBottomRef.current = true;
    setShowJump(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages, userId: currentKey }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              accumulatedText += parsed.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + parsed.text } : m
                )
              );
            }
          } catch {
          }
        }
      }

      const finalMessages = [
        ...updatedMessages,
        { id: assistantId, role: "assistant", content: accumulatedText },
      ];
      saveHistory(currentKey, finalMessages);
      setStatus("ready");
    } catch (err) {
      if (err.name === "AbortError") { setStatus("ready"); return; }
      console.error("AI chat error:", err);
      setError(err.message || "Something went wrong. Please try again.");
      setStatus("error");
    }
  }, [messages, isBusy, saveHistory]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    sendMessage(text);
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const stop = () => { abortRef.current?.abort(); setStatus("ready"); };

  const retry = () => {
    setError(null);
    setStatus("ready");
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      setMessages((prev) => prev.filter((m) => m.id !== messages[messages.length - 1].id));
      sendMessage(lastUser.content);
    }
  };

  return (
    <div className="ai-chat-wrapper">
      <header className="ai-chat-header">
        <div className="ai-chat-header-top">
          <button type="button" onClick={() => nav("/home")} className="ai-nav-back-btn">
            ← Back to Home
          </button>
          <div className="ai-header-meta">
            <span className="ai-user-badge">
              👤 {currentUser?.email || "Guest User"}
            </span>
            <button
              type="button"
              onClick={handleClearHistory}
              className="ai-clear-btn"
              title="Clear conversation history for this user"
            >
              Clear Chat
            </button>
          </div>
        </div>
        <h1 className="ai-chat-title">AI Coding Assistant</h1>
        <p className="ai-chat-status" aria-live="polite">
          {isBusy ? "Generating…" : "Private chat history active"}
        </p>
      </header>

      <div className="ai-chat-messages-wrap">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="ai-chat-messages"
          role="log"
          aria-label="Conversation"
        >
          {messages.length === 0 && (
            <p className="ai-chat-empty">
              Ask me to explain code, write a snippet, or debug something.
              <br />
              <span style={{ fontSize: "0.78rem", opacity: 0.6 }}>
              </span>
            </p>
          )}

          {messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`ai-chat-row ${isUser ? "user" : "assistant"}`}>
                <div className={`ai-chat-bubble ${isUser ? "user" : "assistant"}`}>
                  <span className="sr-only">{isUser ? "You: " : "Assistant: "}</span>
                  {isUser ? m.content : <AssistantMarkdown text={m.content} />}
                </div>
              </div>
            );
          })}

          {isBusy && messages[messages.length - 1]?.content === "" && (
            <div className="ai-chat-row assistant">
              <div className="ai-chat-bubble assistant ai-thinking" role="status">
                <span className="ai-spinner" aria-hidden="true" />
                Thinking...
              </div>
            </div>
          )}

          {error && (
            <div className="ai-chat-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={retry} className="ai-retry-btn">Retry</button>
            </div>
          )}
        </div>

        {showJump && (
          <button
            type="button"
            onClick={() => { stickToBottomRef.current = true; setShowJump(false); scrollToBottom(true); }}
            className="ai-jump-btn"
          >
            ↓ Jump to latest
          </button>
        )}
      </div>

      <div className="ai-chat-input-wrap">
        {isBusy && (
          <div className="ai-stop-wrap">
            <button type="button" onClick={stop} className="ai-stop-btn">■ Stop generating</button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="ai-chat-form">
          <label htmlFor="ai-chat-input" className="sr-only">Message</label>
          <textarea
            id="ai-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
            onKeyDown={handleKeyDown}
            disabled={isBusy}
            rows={2}
            placeholder="Ask a coding question…"
            className="ai-chat-textarea"
          />
          <button type="submit" disabled={isBusy || !input.trim()} className="ai-send-btn" title="Send">
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}
