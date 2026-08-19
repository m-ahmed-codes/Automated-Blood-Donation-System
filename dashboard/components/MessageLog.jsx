'use client';

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-PK', {
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function MessageLog({ messages }) {
  if (!messages || messages.length === 0) {
    return (
      <div className="text-center text-slate-700 text-xs py-6">
        No messages yet
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
      {messages.map(msg => {
        const isOut = msg.direction === 'outbound';
        return (
          <div key={msg.id} className={`flex gap-2 ${isOut ? 'flex-row-reverse' : 'flex-row'}`}>
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed
                ${isOut
                  ? 'bg-blood/20 text-slate-200 rounded-tr-sm'
                  : 'bg-slate-800 text-slate-300 rounded-tl-sm'
                }`}
            >
              <div className="mb-0.5 text-[10px] opacity-60 font-mono">
                {msg.phone?.replace('whatsapp:', '')} · {formatTime(msg.created_at)}
              </div>
              {msg.body}
            </div>
          </div>
        );
      })}
    </div>
  );
}
