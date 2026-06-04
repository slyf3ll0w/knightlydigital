"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { PortalShell } from "@/components/PortalShell";

type MessageUser = { id: string; name: string; role: string };
export type Message = {
  id: string;
  body: string;
  from: MessageUser;
  to: MessageUser;
  createdAt: string;
  readAt: string | null;
};

interface Props {
  initialMessages: Message[];
  userId: string;
  userName: string;
}

export function MessagesClient({ initialMessages, userId, userName }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  async function fetchMessages() {
    const res = await fetch("/api/portal/messages");
    if (res.ok) setMessages(await res.json());
  }

  useEffect(() => {
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      bottomRef.current?.scrollIntoView();
      isFirstRender.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    const res = await fetch("/api/portal/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setBody("");
    }
    setSending(false);
  }

  return (
    <PortalShell userName={userName} unreadCount={0}>
      <div className="max-w-3xl flex flex-col h-[calc(100vh-10rem)]">
        <div className="mb-6">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Portal</p>
          <h1 className="text-3xl font-black uppercase">Messages</h1>
        </div>

        <div className="flex-1 bg-white border border-border overflow-auto p-6 flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <p className="text-sm text-muted-foreground mb-1">No messages yet.</p>
                <p className="text-xs text-muted-foreground">Send your first message to your account manager below.</p>
              </div>
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.from.id === userId;
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  <div className={`px-4 py-3 text-sm leading-relaxed ${
                    isMe
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-foreground border border-border"
                  }`}>
                    {msg.body}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-bold">{isMe ? "You" : msg.from.name}</span>
                    <span>·</span>
                    <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <span>{new Date(msg.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="flex gap-0 border-x border-b border-border bg-white">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message to your account manager..."
            className="flex-1 px-5 py-4 text-sm focus:outline-none text-foreground placeholder-muted-foreground"
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="bg-accent text-accent-foreground font-bold px-6 py-4 text-xs tracking-widest uppercase hover:bg-accent/85 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {sending ? "..." : "Send"}
          </button>
        </form>
      </div>
    </PortalShell>
  );
}
