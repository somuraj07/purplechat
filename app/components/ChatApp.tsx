"use client";

/* eslint-disable @next/next/no-img-element */
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getSupabaseBrowserClient,
  type ChatMessage,
} from "@/lib/supabase";
import { AppLogo } from "@/app/components/AppLogo";

type PartnerSession = {
  id: "you" | "partner";
  name: string;
};

type ChatAppProps = {
  session: PartnerSession;
};

type SelectedMedia = {
  url: string;
  type: "image" | "video";
  fileName: string;
};

const REACTION_EMOJIS = ["❤️", "😂", "😍", "😮", "🔥", "🥰"];
const CUSTOM_REACTION_STORAGE_KEY = "purplechat_custom_reactions";
const LOCAL_REACTIONS_STORAGE_KEY = "purplechat_local_reactions";

function getMediaType(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  return null;
}

function getSafeUploadId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16)).join("-");
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFilePath(sessionId: PartnerSession["id"], file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${sessionId}/${Date.now()}-${getSafeUploadId()}-${safeName}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown, fallback: string) {
  const message =
    error instanceof Error
      ? error.message
      : error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "";

  if (message.includes("schema cache") || message.includes("column")) {
    return "Chat setup needs the latest database update.";
  }

  if (process.env.NODE_ENV === "production") {
    return fallback;
  }

  if (message) {
    return message;
  }

  return fallback;
}

async function downloadMedia(url: string, fileName: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Download failed.");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function ChatApp({ session }: ChatAppProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<
    string | null
  >(null);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const [customReaction, setCustomReaction] = useState("");
  const [localReactionOverrides, setLocalReactionOverrides] = useState<
    Record<string, Record<string, string>>
  >(() => {
    if (typeof window === "undefined") {
      return {};
    }

    try {
      const savedReactions = window.localStorage.getItem(
        LOCAL_REACTIONS_STORAGE_KEY,
      );
      return savedReactions
        ? (JSON.parse(savedReactions) as Record<string, Record<string, string>>)
        : {};
    } catch {
      return {};
    }
  });
  const [savedCustomReactions, setSavedCustomReactions] = useState<string[]>(
    () => {
      if (typeof window === "undefined") {
        return [];
      }

      try {
        const savedReactions = window.localStorage.getItem(
          CUSTOM_REACTION_STORAGE_KEY,
        );
        return savedReactions ? (JSON.parse(savedReactions) as string[]) : [];
      } catch {
        return [];
      }
    },
  );
  const [error, setError] = useState("");
  const [, setStatus] = useState("Connecting...");
  const [isSending, setIsSending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [appHeight, setAppHeight] = useState("100dvh");
  const [appTop, setAppTop] = useState("0px");
  const formRef = useRef<HTMLFormElement | null>(null);
  const messagesListRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartXRef = useRef(0);

  const messagesById = useMemo(() => {
    return new Map(messages.map((message) => [message.id, message]));
  }, [messages]);

  const reactionChoices = useMemo(() => {
    return [
      ...REACTION_EMOJIS,
      ...savedCustomReactions.filter(
        (emoji) => !REACTION_EMOJIS.includes(emoji),
      ),
    ];
  }, [savedCustomReactions]);

  useEffect(() => {
    function syncVisibleHeight() {
      const isAndroid = /Android/i.test(window.navigator.userAgent);
      const viewportHeight = isAndroid
        ? window.innerHeight
        : window.visualViewport?.height || window.innerHeight;
      const viewportTop = isAndroid ? 0 : window.visualViewport?.offsetTop || 0;

      setAppHeight(`${viewportHeight}px`);
      setAppTop(`${viewportTop}px`);
      window.requestAnimationFrame(scrollToLatestMessage);
    }

    syncVisibleHeight();
    window.visualViewport?.addEventListener("resize", syncVisibleHeight);
    window.visualViewport?.addEventListener("scroll", syncVisibleHeight);
    window.addEventListener("resize", syncVisibleHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", syncVisibleHeight);
      window.visualViewport?.removeEventListener("scroll", syncVisibleHeight);
      window.removeEventListener("resize", syncVisibleHeight);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let cleanupChannel: (() => void) | undefined;

    async function startChat() {
      try {
        const supabase = getSupabaseBrowserClient();

        const { data, error: loadError } = await supabase
          .from("messages")
          .select("*")
          .order("created_at", { ascending: true })
          .limit(100);

        if (!isMounted) {
          return;
        }

        if (loadError) {
          setError(getErrorMessage(loadError, "Chat is not ready yet."));
          setStatus("Setup needed");
          return;
        }

        setMessages((data || []) as ChatMessage[]);
        setStatus("Realtime ready");

        const channel = supabase
          .channel("purplechat-messages")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "messages" },
            (payload) => {
              const message = payload.new as ChatMessage;

              setMessages((currentMessages) => {
                if (payload.eventType === "UPDATE") {
                  return currentMessages.map((item) =>
                    item.id === message.id ? message : item,
                  );
                }

                if (payload.eventType === "INSERT") {
                  if (currentMessages.some((item) => item.id === message.id)) {
                    return currentMessages;
                  }

                  return [...currentMessages, message];
                }

                return currentMessages;
              });
            },
          )
          .subscribe((nextStatus) => {
            if (nextStatus === "SUBSCRIBED") {
              setStatus("Realtime ready");
            }
          });

        cleanupChannel = () => {
          void supabase.removeChannel(channel);
        };
      } catch (clientError) {
        if (!isMounted) {
          return;
        }

        setStatus("Setup needed");
        setError(getErrorMessage(clientError, "Chat is not ready yet."));
      }
    }

    void startChat();

    return () => {
      isMounted = false;
      cleanupChannel?.();
    };
  }, []);

  useEffect(() => {
    scrollToLatestMessage();
  }, [messages.length]);

  function scrollToLatestMessage() {
    const list = messagesListRef.current;

    if (list) {
      list.scrollTo({
        top: list.scrollHeight,
        behavior: "smooth",
      });
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const text = body.trim();

    if (!text && !selectedFile) {
      return;
    }

    setIsSending(true);

    try {
      const supabase = getSupabaseBrowserClient();
      let mediaUrl: string | null = null;
      let mediaType: "image" | "video" | null = null;
      let fileName: string | null = null;

      if (selectedFile) {
        mediaType = getMediaType(selectedFile);

        if (!mediaType) {
          throw new Error("Please choose an image or video file.");
        }

        if (selectedFile.size > 50 * 1024 * 1024) {
          throw new Error("Please keep media under 50 MB for fast sending.");
        }

        const filePath = getFilePath(session.id, selectedFile);
        const { error: uploadError } = await supabase.storage
          .from("chat-media")
          .upload(filePath, selectedFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("chat-media").getPublicUrl(filePath);

        mediaUrl = publicUrl;
        fileName = selectedFile.name;
      }

      const nextMessage = {
        author_id: session.id,
        author_name: session.name,
        body: text || null,
        media_url: mediaUrl,
        media_type: mediaType,
        file_name: fileName,
        ...(replyTo ? { reply_to_id: replyTo.id } : {}),
      };

      const { data, error: insertError } = await supabase
        .from("messages")
        .insert(nextMessage)
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      if (data) {
        const insertedMessage = data as ChatMessage;
        setMessages((currentMessages) => {
          if (currentMessages.some((item) => item.id === insertedMessage.id)) {
            return currentMessages;
          }

          return [...currentMessages, insertedMessage];
        });
      }

      setBody("");
      setSelectedFile(null);
      setReplyTo(null);
    } catch (sendError) {
      setError(
        getErrorMessage(sendError, "Message could not be sent."),
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.reload();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    formRef.current?.requestSubmit();
  }

  function startEditing(message: ChatMessage) {
    if (!message.body) {
      return;
    }

    setEditingMessageId(message.id);
    setEditingBody(message.body || "");
    setReplyTo(null);
    setReactionPickerMessageId(null);
    setError("");
  }

  function cancelEditing() {
    setEditingMessageId(null);
    setEditingBody("");
  }

  function startReply(message: ChatMessage) {
    setReplyTo(message);
    setEditingMessageId(null);
    setReactionPickerMessageId(null);
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleMessageTouchStart(message: ChatMessage, clientX: number) {
    touchStartXRef.current = clientX;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      setCustomReaction("");
      setReactionPickerMessageId(message.id);
    }, 450);
  }

  function handleMessageTouchEnd(message: ChatMessage, clientX: number) {
    const deltaX = clientX - touchStartXRef.current;

    clearLongPressTimer();

    if (deltaX > 64) {
      startReply(message);
      return;
    }

    if (deltaX < -64 && message.author_id === session.id) {
      startEditing(message);
    }
  }

  async function saveReaction(message: ChatMessage, emoji: string) {
    const nextEmoji = emoji.trim();

    if (!nextEmoji) {
      return;
    }

    if (
      !REACTION_EMOJIS.includes(nextEmoji) &&
      !savedCustomReactions.includes(nextEmoji)
    ) {
      const nextSavedReactions = [nextEmoji, ...savedCustomReactions].slice(0, 6);
      setSavedCustomReactions(nextSavedReactions);
      window.localStorage.setItem(
        CUSTOM_REACTION_STORAGE_KEY,
        JSON.stringify(nextSavedReactions),
      );
    }

    setReactionPickerMessageId(null);
    setCustomReaction("");

    const reactions = {
      ...(message.reactions || {}),
      ...(localReactionOverrides[message.id] || {}),
      [session.id]: nextEmoji,
    };

    function saveLocalReaction() {
      setLocalReactionOverrides((currentReactions) => {
        const nextReactions = {
          ...currentReactions,
          [message.id]: reactions,
        };
        window.localStorage.setItem(
          LOCAL_REACTIONS_STORAGE_KEY,
          JSON.stringify(nextReactions),
        );
        return nextReactions;
      });
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: reactionError } = await supabase
        .from("messages")
        .update({ reactions })
        .eq("id", message.id)
        .select()
        .single();

      if (reactionError) {
        throw reactionError;
      }

      if (data) {
        const updatedMessage = data as ChatMessage;
        setMessages((currentMessages) =>
          currentMessages.map((item) =>
            item.id === updatedMessage.id ? updatedMessage : item,
          ),
        );
      }
    } catch (reactionError) {
      saveLocalReaction();
      setError(getErrorMessage(reactionError, "Reaction saved on this device."));
    }
  }

  async function saveEdit(message: ChatMessage) {
    const nextBody = editingBody.trim();

    if (!nextBody) {
      setError("Message cannot be empty.");
      return;
    }

    setIsEditing(true);
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: updateError } = await supabase
        .from("messages")
        .update({ body: nextBody })
        .eq("id", message.id)
        .eq("author_id", session.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      if (data) {
        const updatedMessage = data as ChatMessage;
        setMessages((currentMessages) =>
          currentMessages.map((item) =>
            item.id === updatedMessage.id ? updatedMessage : item,
          ),
        );
      }

      cancelEditing();
    } catch (editError) {
      setError(
        getErrorMessage(editError, "Message could not be edited."),
      );
    } finally {
      setIsEditing(false);
    }
  }

  return (
    <>
      <main
        style={{ height: appHeight, top: appTop }}
        className="fixed inset-x-0 flex overflow-hidden bg-[radial-gradient(circle_at_top_left,#f0abfc,transparent_22%),linear-gradient(145deg,#2e1065,#6b21a8_48%,#c084fc)] p-0 text-slate-950 sm:p-4"
      >
        <section className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden bg-purple-50 shadow-2xl shadow-purple-950/30 sm:rounded-4xl sm:border sm:border-white/40 sm:bg-white/35 sm:backdrop-blur-xl lg:grid lg:grid-cols-[280px_1fr]">
          <aside className="hidden border-r border-white/50 bg-white/55 p-6 lg:block">
            <div className="rounded-4xl bg-white/70 p-5 shadow-xl shadow-purple-200/40">
              <div className="mb-5 flex items-center gap-3">
                <AppLogo size="lg" />
                <div>
                  <p className="text-lg font-black text-purple-950">PurpleChat</p>
                  <p className="text-xs font-semibold text-purple-500">
                    Private room
                  </p>
                </div>
              </div>
              <p className="text-sm leading-6 text-slate-600">
                Share moments, photos, and videos in your own realtime space.
              </p>
            </div>
          </aside>
          <div className="flex min-h-0 flex-col overflow-hidden bg-purple-50 lg:rounded-r-4xl">
        <header className="shrink-0 flex items-center justify-between gap-3 border-b border-purple-100 bg-white/85 px-3 py-2.5 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <AppLogo />
            <div className="min-w-0">
              <h1 className="truncate text-base font-black tracking-tight text-purple-950 sm:text-xl">
                PurpleChat
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-purple-200 bg-white px-3 py-1.5 text-xs font-bold text-purple-800 shadow-sm transition hover:bg-purple-50"
          >
            Lock
          </button>
        </header>

        {error ? (
          <div className="border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 sm:px-5">
            {error}
          </div>
        ) : null}

        <div
          ref={messagesListRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,#faf5ff,#f5f3ff)] px-3 py-3 sm:px-5"
        >
          {messages.length === 0 ? (
            <div className="mx-auto mt-12 max-w-xs rounded-4xl border border-purple-100 bg-white/80 p-5 text-center shadow-xl shadow-purple-100">
              <h2 className="text-lg font-black text-purple-950">
                Start with a sweet message.
              </h2>
            </div>
          ) : (
            <div className="space-y-1.5">
              {messages.map((message) => {
                const isMine = message.author_id === session.id;
                const isCurrentEdit = editingMessageId === message.id;
                const repliedMessage = message.reply_to_id
                  ? messagesById.get(message.reply_to_id)
                  : null;
                const reactionEntries = Object.entries({
                  ...(message.reactions || {}),
                  ...(localReactionOverrides[message.id] || {}),
                });
                return (
                  <article
                    key={message.id}
                    onTouchStart={(event) =>
                      handleMessageTouchStart(
                        message,
                        event.changedTouches[0]?.clientX || 0,
                      )
                    }
                    onTouchEnd={(event) =>
                      handleMessageTouchEnd(
                        message,
                        event.changedTouches[0]?.clientX || 0,
                      )
                    }
                    onTouchCancel={clearLongPressTimer}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setCustomReaction("");
                      setReactionPickerMessageId(message.id);
                    }}
                    className={`group relative flex px-1 ${
                      isMine ? "justify-end" : "justify-start"
                    }`}
                  >
                    {reactionPickerMessageId === message.id ? (
                      <div
                        className={`absolute -top-11 z-10 flex items-center gap-1 rounded-full border border-purple-100 bg-white/95 p-1 shadow-xl shadow-purple-200 ${
                          isMine ? "right-0" : "left-0"
                        }`}
                      >
                        {reactionChoices.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => saveReaction(message, emoji)}
                            className="grid size-7 place-items-center rounded-full text-sm transition hover:bg-purple-50"
                          >
                            {emoji}
                          </button>
                        ))}
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            saveReaction(message, customReaction);
                          }}
                          className="flex items-center gap-1"
                        >
                          <input
                            value={customReaction}
                            onChange={(event) =>
                              setCustomReaction(event.currentTarget.value)
                            }
                            placeholder="emoji"
                            aria-label="Custom emoji"
                            className="h-7 w-14 rounded-full border border-purple-100 bg-purple-50 text-center text-sm outline-none focus:border-purple-300"
                          />
                          <button
                            type="submit"
                            className="grid size-7 place-items-center rounded-full bg-purple-600 text-xs font-black text-white transition hover:bg-purple-700"
                          >
                            ✓
                          </button>
                        </form>
                      </div>
                    ) : null}

                    <div
                      className={`hidden items-center gap-1 opacity-0 transition group-hover:opacity-100 sm:flex ${
                        isMine ? "order-first mr-1" : "order-last ml-1"
                      }`}
                    >
                      <button
                        type="button"
                        title="Reply"
                        onClick={() => startReply(message)}
                        className="grid size-7 place-items-center rounded-full bg-white/85 text-xs text-purple-700 shadow-sm hover:bg-purple-100"
                      >
                        ↩
                      </button>
                      {isMine && message.body ? (
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => startEditing(message)}
                          className="grid size-7 place-items-center rounded-full bg-white/85 text-xs text-purple-700 shadow-sm hover:bg-purple-100"
                        >
                          ✎
                        </button>
                      ) : null}
                    </div>

                    <div
                      className={`relative max-w-[76%] rounded-2xl px-2.5 py-1.5 shadow-sm sm:max-w-[58%] ${
                        isMine
                          ? "rounded-br bg-purple-700 text-white"
                          : "rounded-bl bg-white text-slate-900"
                      }`}
                    >
                      {repliedMessage ? (
                        <button
                          type="button"
                          onClick={() => startReply(repliedMessage)}
                          className={`mb-1.5 w-full rounded-xl border-l-2 px-2 py-1 text-left text-[11px] ${
                            isMine
                              ? "border-white/60 bg-white/15 text-purple-50"
                              : "border-purple-300 bg-purple-50 text-purple-950"
                          }`}
                        >
                          <span className="block font-black">
                            {repliedMessage.author_name}
                          </span>
                          <span className="line-clamp-1 opacity-80">
                            {repliedMessage.body ||
                              repliedMessage.file_name ||
                              "Media"}
                          </span>
                        </button>
                      ) : null}

                      {message.media_url && message.media_type === "image" ? (
                        <div className="relative mb-1.5 overflow-hidden rounded-xl">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedMedia({
                                url: message.media_url || "",
                                type: "image",
                                fileName: message.file_name || "purplechat-photo",
                              })
                            }
                            className="block w-full"
                          >
                            <img
                              src={message.media_url}
                              alt={message.file_name || "Shared photo"}
                              className="max-h-56 w-full object-cover transition duration-200 hover:scale-[1.01]"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={async (event) => {
                              event.stopPropagation();
                              try {
                                await downloadMedia(
                                  message.media_url || "",
                                  message.file_name || "purplechat-photo",
                                );
                              } catch (downloadError) {
                                setError(
                                  getErrorMessage(
                                    downloadError,
                                    "Download could not be saved.",
                                  ),
                                );
                              }
                            }}
                            title="Download photo"
                            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/55 text-sm font-black text-white shadow-lg backdrop-blur transition hover:bg-black/70"
                          >
                            ↓
                          </button>
                        </div>
                      ) : null}

                      {message.media_url && message.media_type === "video" ? (
                        <div className="relative mb-1.5 overflow-hidden rounded-xl bg-black">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedMedia({
                                url: message.media_url || "",
                                type: "video",
                                fileName: message.file_name || "purplechat-video",
                              })
                            }
                            className="block w-full"
                          >
                            <video
                              src={message.media_url}
                              muted
                              playsInline
                              className="max-h-56 w-full"
                            />
                            <span className="absolute inset-0 grid place-items-center bg-black/10 text-3xl text-white">
                              ▶
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={async (event) => {
                              event.stopPropagation();
                              try {
                                await downloadMedia(
                                  message.media_url || "",
                                  message.file_name || "purplechat-video",
                                );
                              } catch (downloadError) {
                                setError(
                                  getErrorMessage(
                                    downloadError,
                                    "Download could not be saved.",
                                  ),
                                );
                              }
                            }}
                            title="Download video"
                            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/55 text-sm font-black text-white shadow-lg backdrop-blur transition hover:bg-black/70"
                          >
                            ↓
                          </button>
                        </div>
                      ) : null}

                      {isCurrentEdit ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={editingBody}
                            onChange={(event) =>
                              setEditingBody(event.currentTarget.value)
                            }
                            className="min-h-16 w-full resize-none rounded-xl border border-white/30 bg-white/95 px-2 py-1.5 text-[13px] text-purple-950 outline-none ring-purple-200 transition focus:ring-4"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isEditing}
                              onClick={() => saveEdit(message)}
                              className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-purple-700 disabled:opacity-60"
                            >
                              {isEditing ? "Saving" : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : message.body ? (
                        <p className="whitespace-pre-wrap wrap-break-word text-[13px] leading-[18px]">
                          {message.body}
                        </p>
                      ) : null}

                      {!isCurrentEdit ? (
                        <div
                          className={`mt-0.5 text-right text-[9px] leading-none ${
                            isMine ? "text-purple-100/75" : "text-slate-400"
                          }`}
                        >
                          {formatTime(message.created_at)}
                        </div>
                      ) : null}

                      {reactionEntries.length ? (
                        <div
                          className={`absolute -bottom-2.5 rounded-full border border-purple-100 bg-white px-1.5 py-0.5 text-[10px] leading-none shadow-sm ${
                            isMine ? "right-2" : "left-2"
                          }`}
                        >
                          {reactionEntries.map(([authorId, emoji]) => (
                            <span key={authorId}>{emoji}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <form
          ref={formRef}
          onSubmit={handleSend}
          className="shrink-0 border-t border-purple-100 bg-white/90 px-3 py-3 backdrop-blur sm:px-5"
        >
          {replyTo ? (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border-l-4 border-purple-400 bg-purple-50 px-3 py-2 text-xs text-purple-950">
              <div className="min-w-0">
                <p className="font-black">Replying to {replyTo.author_name}</p>
                <p className="truncate opacity-75">
                  {replyTo.body || replyTo.file_name || "Media"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-purple-700"
              >
                Close
              </button>
            </div>
          ) : null}

          {selectedFile ? (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-900">
              <span className="truncate">{selectedFile.name}</span>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] text-purple-700"
              >
                Remove
              </button>
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-2xl bg-purple-100 text-lg font-black text-purple-700 transition hover:bg-purple-200">
              +
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] || null)
                }
              />
            </label>

            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              onFocus={() => {
                window.setTimeout(scrollToLatestMessage, 250);
              }}
              placeholder="Write something lovely..."
              rows={1}
              className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-purple-100 bg-white px-3 py-2.5 text-sm outline-none ring-purple-300 transition focus:border-purple-300 focus:ring-4"
            />

            <button
              type="submit"
              disabled={isSending || (!body.trim() && !selectedFile)}
              className="h-10 shrink-0 rounded-2xl bg-purple-700 px-4 text-xs font-black text-white shadow-lg shadow-purple-200 transition hover:bg-purple-800 disabled:cursor-not-allowed disabled:bg-purple-300"
            >
              {isSending ? "..." : "Send"}
            </button>
          </div>
          </form>
          </div>
        </section>
      </main>

      {selectedMedia ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="truncate text-sm font-semibold">
              {selectedMedia.fileName}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await downloadMedia(selectedMedia.url, selectedMedia.fileName);
                  } catch (downloadError) {
                    setError(
                      getErrorMessage(
                        downloadError,
                        "Download could not be saved.",
                      ),
                    );
                  }
                }}
                className="rounded-full bg-white/15 px-4 py-2 text-xs font-bold backdrop-blur transition hover:bg-white/25"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => setSelectedMedia(null)}
                className="grid size-9 place-items-center rounded-full bg-white/15 text-lg font-black backdrop-blur transition hover:bg-white/25"
              >
                ×
              </button>
            </div>
          </div>
          <div className="grid min-h-0 flex-1 place-items-center p-3">
            {selectedMedia.type === "image" ? (
              <img
                src={selectedMedia.url}
                alt={selectedMedia.fileName}
                className="max-h-full max-w-full rounded-2xl object-contain"
              />
            ) : (
              <video
                src={selectedMedia.url}
                controls
                autoPlay
                className="max-h-full max-w-full rounded-2xl"
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
