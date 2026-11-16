"use client";

/**
 * A two-sided conversation, laid out the way every messaging app lays one
 * out: what this side sent on the right, the other side's on the left.
 *
 * The alignment carries the information. In a thread between "Rendi" and "a
 * community" nobody reads an author line on every bubble — which edge it
 * hangs from is how you tell, at a glance, who is waiting on whom.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface ChatAttachment {
  id?: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  text: string;
  author: string;
  at: string;
  /** True when this side sent it — the bubble goes right. */
  mine: boolean;
  attachments?: ChatAttachment[];
}

const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const clock = (value: string) =>
  new Date(value).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function ChatThread({
  messages,
  emptyState,
  className,
}: {
  messages: ChatMessage[];
  emptyState?: React.ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length]);

  if (messages.length === 0 && emptyState) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-8", className)}>
        {emptyState}
      </div>
    );
  }

  return (
    <div ref={scroller} className={cn("flex-1 space-y-2 overflow-y-auto px-4 py-4", className)}>
      {messages.map((message, index) => {
        // Named once per run, not on every bubble: six messages back and
        // forth should read as two voices, not twelve labels.
        const startsRun = index === 0 || messages[index - 1].mine !== message.mine;
        return (
          <div
            key={message.id}
            className={cn("flex w-full", message.mine ? "justify-end" : "justify-start")}
          >
            <div className="min-w-0 max-w-[78%]">
              {startsRun && (
                <p
                  className={cn(
                    "mb-1 px-1 text-[11px] font-semibold text-slate-500",
                    message.mine ? "text-right" : "text-left",
                  )}
                >
                  {message.author}
                </p>
              )}

              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                  message.mine
                    ? "rounded-br-md bg-[#2563EB] text-white"
                    : "rounded-bl-md border border-slate-200 bg-white text-slate-900",
                )}
              >
                {message.attachments && message.attachments.length > 0 && (
                  <div className={cn("space-y-2", message.text && "mb-2")}>
                    {message.attachments.map((file) => (
                      <Attachment key={file.id ?? file.fileUrl} file={file} mine={message.mine} />
                    ))}
                  </div>
                )}

                {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}

                <p
                  className={cn(
                    "mt-1 text-[10px]",
                    message.mine ? "text-white/70" : "text-slate-400",
                  )}
                >
                  {clock(message.at)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * An image shows itself; anything else is a row you can click. A PDF rendered
 * as a broken image is worse than a filename, and the filename plus the size
 * is what the decision to open it is actually made from.
 */
function Attachment({ file, mine }: { file: ChatAttachment; mine: boolean }) {
  if (file.mimeType.startsWith("image/")) {
    return (
      <a href={file.fileUrl} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.fileUrl}
          alt={file.fileName}
          className="max-h-60 w-full rounded-xl object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={file.fileUrl}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors",
        mine ? "bg-white/15 hover:bg-white/25" : "bg-slate-100 hover:bg-slate-200",
      )}
    >
      <span className={cn("text-base", mine ? "text-white/80" : "text-slate-500")} aria-hidden>
        ▤
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{file.fileName}</span>
        <span className={cn("block text-[11px]", mine ? "text-white/70" : "text-slate-500")}>
          {fileSize(file.sizeBytes)}
        </span>
      </span>
      <span className={cn("text-sm", mine ? "text-white/80" : "text-slate-400")} aria-hidden>
        ↓
      </span>
    </a>
  );
}
