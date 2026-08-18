import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutGrid, Flame, Target, Wallet, Dumbbell, Plus, X, Check,
  TrendingUp, TrendingDown, Trash2, ChevronLeft, ChevronRight,
  Circle, CheckCircle2, Settings2, Sparkles, ListTodo, BookOpen,
  Download, Upload, Smile, Search, CornerDownLeft, Zap, Egg, Footprints, Moon,
  Edit3, Calendar, AlertTriangle, Droplet, Utensils, Coffee, Sun, Cookie, Minus,
  Archive, ArchiveRestore, Bell, GripVertical, Cloud, CloudRain, CloudSnow,
  Award, Lock, Repeat, MapPin, BellRing, BellOff,
  Filter, Timer, Play, Pause, RotateCcw, Link2, Tag, AlignLeft, ListChecks, Paperclip, SlidersHorizontal, Hourglass, Star, Trophy, Ruler, Heart, Lightbulb, Percent,
  PlayCircle, GraduationCap, Cake, Gift, Phone, Users, Luggage, Camera, Video, Plane, Send
} from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine
} from "recharts";

/* ============================================================
   LifeOS — Design tokens ("instrument panel" system)
   bg:      #0E1217   deep charcoal-navy hull
   surface: #171D25   panel surface
   surface2:#1E2530   raised panel
   line:    #2A323F   hairline dividers
   text:    #ECEFF3   primary readout
   muted:   #8A94A6   secondary readout
   brass:   #E8A33D   primary instrument accent (habits/energy)
   teal:    #4FD1C5   growth accent (finance/goals)
   coral:   #FF7A6B   alert / fitness accent
   violet:  #9B8CFF   goals secondary accent
   ============================================================ */

const T = {
  bg: "#0E1217",
  surface: "#171D25",
  surface2: "#1E2530",
  line: "#2A323F",
  text: "#ECEFF3",
  muted: "#8A94A6",
  brass: "#E8A33D",
  teal: "#4FD1C5",
  coral: "#FF7A6B",
  violet: "#9B8CFF",
  sky: "#5B8DEF",
  gold: "#F2B84B",
};

// Two-stop gradients per accent, for rings/glows/progress fills (Apple Health / WHOOP style)
const GRAD = {
  [T.brass]: ["#FFCF7A", "#E8843D"],
  [T.teal]: ["#8FF5E8", "#33B8AA"],
  [T.coral]: ["#FFA394", "#F0533E"],
  [T.violet]: ["#C3B6FF", "#7A65F2"],
  [T.sky]: ["#9DBBFF", "#3E6FE0"],
  [T.gold]: ["#FFDD94", "#E09A1F"],
};
const gradId = (color) => "grad-" + color.replace("#", "");
const glow = (color, strength = 0.35) => `0 0 24px ${color}${Math.round(strength * 255).toString(16).padStart(2, "0")}`;

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
`;

const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtMoney = (n) => (n < 0 ? "-₹" : "₹") + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSleep = (hrs) => { const h = Math.floor(hrs); const m = Math.round((hrs - h) * 60); return `${h}h${m ? " " + m + "m" : ""}`; };
const fmtTime12 = (t) => { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${String(m).padStart(2, "0")} ${ap}`; };

function daysAgoArr(n) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    arr.push(d.toISOString().slice(0, 10));
  }
  return arr;
}

/* ---------------- storage hook ----------------
   Runs on plain localStorage so this works in any browser — no
   Claude-artifact-only APIs. Swap this hook out for a real backend
   (or IndexedDB) later without touching any component below it. */
function usePersisted(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const savedVersion = window.localStorage.getItem("lifeos:stateVersion");
      if (savedVersion !== APP_STORAGE_VERSION) {
        for (const storageKey of Object.keys(window.localStorage)) {
          if (storageKey.startsWith("lifeos:")) {
            window.localStorage.removeItem(storageKey);
          }
        }
        window.localStorage.setItem("lifeos:stateVersion", APP_STORAGE_VERSION);
        return initial;
      }
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch (e) {
      return initial;
    }
  });
  const [loaded] = useState(true);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage full or unavailable — fail silently, same as before */
    }
  }, [key, value]);

  return [value, setValue, loaded];
}

/* ================= AI ASSISTANT module ================= */
/* Uses the Anthropic API available inside this artifact (fetch to
   /v1/messages — no key needed, it's already provisioned for artifacts).
   Tool-use lets the assistant actually act on the user's data (add a task,
   complete a habit, log a meal, etc.) rather than just describing what to
   do. Conversation history is persisted as plain display text; the raw
   tool_use/tool_result blocks for a given exchange are built fresh each
   time and never stored, which keeps the saved chat simple and keeps every
   API call grounded in *current* data rather than a stale snapshot. */

const ASSISTANT_TOOLS = [
  {
    name: "add_task",
    description: "Add a new task to the user's Tasks list.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "What needs doing" },
        priority: { type: "string", enum: ["High", "Medium", "Low"], description: "Defaults to Medium if unsure" },
        dueDate: { type: "string", description: "YYYY-MM-DD, optional" },
      },
      required: ["text"],
    },
  },
  {
    name: "complete_habit",
    description: "Mark one of the user's existing habits as done for today. Match habitName to the closest existing habit.",
    input_schema: {
      type: "object",
      properties: { habitName: { type: "string", description: "Name or close match of an existing habit" } },
      required: ["habitName"],
    },
  },
  {
    name: "log_transaction",
    description: "Log an income or expense transaction for today.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense"] },
        category: { type: "string", description: "e.g. Groceries, Salary, Dining, Transport" },
        amount: { type: "number" },
        note: { type: "string" },
      },
      required: ["type", "category", "amount"],
    },
  },
  {
    name: "log_meal",
    description: "Log a meal for today with its nutrition info.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        calories: { type: "number" },
        protein: { type: "number", description: "grams, optional" },
        carbs: { type: "number", description: "grams, optional" },
        fats: { type: "number", description: "grams, optional" },
      },
      required: ["name", "calories"],
    },
  },
  {
    name: "add_journal_entry",
    description: "Write or overwrite today's journal entry.",
    input_schema: {
      type: "object",
      properties: {
        mood: { type: "integer", description: "0=very bad, 1=bad, 2=neutral, 3=good, 4=great. Infer from tone if not stated." },
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "add_goal",
    description: "Create a new goal.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        category: { type: "string", enum: ["Personal", "Health", "Finance", "Career"] },
        targetDate: { type: "string", description: "YYYY-MM-DD, optional" },
      },
      required: ["title"],
    },
  },
];

function buildAssistantContext(ctx) {
  const { habits, tasks, goals, tx, vitals, calorieLog, workouts, journal } = ctx;
  const today = todayStr();
  const lines = [`Today is ${new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`] ;

  const activeHabits = habits.filter(h => !h.archived);
  if (activeHabits.length) {
    const done = activeHabits.filter(h => h.completions[today]).length;
    lines.push(`HABITS (${done}/${activeHabits.length} done today): ` + activeHabits.map(h => `${h.name}${h.completions[today] ? " ✓" : ""}`).join(", "));
  }

  const pending = tasks.filter(t => !t.done);
  if (pending.length) {
    lines.push(`TASKS (${pending.length} pending): ` + pending.slice(0, 8).map(t => `"${t.text}"${t.dueDate ? ` (due ${t.dueDate})` : ""}`).join("; "));
  }

  if (goals.length) {
    lines.push(`GOALS: ` + goals.filter(g => !g.archived).map(g => `"${g.title}" ${g.progress}%`).join(", "));
  }

  const spentToday = tx.filter(t => t.type === "expense" && t.date === today).reduce((s, t) => s + t.amount, 0);
  if (vitals?.dailyBudget) {
    lines.push(`FINANCE: spent ₹${spentToday} today, daily budget ₹${vitals.dailyBudget}, ₹${vitals.dailyBudget - spentToday} remaining.`);
  }

  const todayMeals = calorieLog.filter(c => c.date === today);
  const consumed = todayMeals.reduce((s, c) => s + c.calories, 0);
  if (vitals?.caloriesGoal) {
    lines.push(`NUTRITION: ${consumed}/${vitals.caloriesGoal} kcal today.`);
  }

  const week = daysAgoArr(7);
  const weekMinutes = workouts.filter(w => week.includes(w.date)).reduce((s, w) => s + w.duration, 0);
  if (weekMinutes) lines.push(`FITNESS: ${weekMinutes} minutes trained this week.`);

  if (journal.length) {
    const last = [...journal].sort((a, b) => b.date.localeCompare(a.date))[0];
    lines.push(`JOURNAL: last entry ${fmtDate(last.date)}, mood ${MOODS[last.mood]}.`);
  }

  return lines.join("\n");
}

function executeAssistantTool(name, input, actions) {
  switch (name) {
    case "add_task": {
      const quadrant = input.priority ? QUICK_PRIORITY_TO_QUADRANT[input.priority] || "not_urgent-important" : "not_urgent-important";
      actions.setTasks([{ id: uid(), text: input.text, quadrant, done: false, dueDate: input.dueDate || "", recurrence: "none", tags: [], subtasks: [], notes: "", links: [] }, ...actions.tasks]);
      return `Added task: "${input.text}"${input.dueDate ? ` due ${input.dueDate}` : ""}.`;
    }
    case "complete_habit": {
      const q = input.habitName.toLowerCase();
      const match = actions.habits.find(h => !h.archived && h.name.toLowerCase().includes(q));
      if (!match) return `Couldn't find a habit matching "${input.habitName}". Existing habits: ${actions.habits.filter(h => !h.archived).map(h => h.name).join(", ") || "none"}.`;
      const today = todayStr();
      actions.setHabits(actions.habits.map(h => h.id === match.id ? { ...h, completions: { ...h.completions, [today]: true } } : h));
      return `Marked "${match.name}" as done for today.`;
    }
    case "log_transaction": {
      actions.setTx([{ id: uid(), date: todayStr(), type: input.type, category: input.category, amount: input.amount, note: input.note || "" }, ...actions.tx]);
      return `Logged ${input.type} of ₹${input.amount} (${input.category}).`;
    }
    case "log_meal": {
      actions.setCalorieLog([{ id: uid(), date: todayStr(), name: input.name, mealType: mealTypeFor(new Date().getHours()), time: nowTimeStr(), calories: input.calories, protein: input.protein || 0, carbs: input.carbs || 0, fats: input.fats || 0 }, ...actions.calorieLog]);
      return `Logged meal: ${input.name} (${input.calories} kcal).`;
    }
    case "add_journal_entry": {
      const today = todayStr();
      actions.setJournal([{ id: uid(), date: today, mood: input.mood ?? 3, text: input.text }, ...actions.journal.filter(j => j.date !== today)]);
      return `Saved today's journal entry.`;
    }
    case "add_goal": {
      actions.setGoals([...actions.goals, {
        id: uid(), title: input.title, category: input.category || "Personal", priority: "Medium", targetDate: input.targetDate || "",
        progress: 0, milestones: [], archived: false, pinned: false, linkedHabitIds: [], linkedTaskIds: [],
        notes: "", links: [], progressHistory: [{ date: todayStr(), progress: 0 }], createdAt: todayStr(), completedAt: null,
      }]);
      return `Created goal: "${input.title}".`;
    }
    default:
      return `Unknown action: ${name}.`;
  }
}

const ASSISTANT_SYSTEM_PROMPT = `You are the LifeOS Assistant, embedded in the user's personal life-management app. You can see a live snapshot of their data (habits, tasks, goals, finance, nutrition, fitness, journal) in the CONTEXT block, and you have tools to act on their behalf: add a task, mark a habit done, log a transaction, log a meal, write a journal entry, or add a goal.

Rules:
- Use the CONTEXT block as ground truth. Never invent numbers that aren't there.
- When the user asks you to do something actionable ("add a task to...", "log that I ate...", "mark X done"), use the matching tool rather than just describing what you'd do.
- Keep replies short and warm — 2-4 sentences unless the user asks for more detail.
- If a request is ambiguous (e.g. which habit they mean), make your best guess from the CONTEXT rather than asking a clarifying question, unless it's genuinely unclear.`;

async function callAssistantAPI(messages, systemPrompt) {
  const res = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
      tools: ASSISTANT_TOOLS,
    }),
  });
  return res.json();
}

/* ---------- Chat UI ---------- */

function AssistantAvatar({ size = 26 }) {
  const [g1, g2] = GRAD[T.violet];
  return (
    <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: size, height: size, background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
      <Sparkles size={size * 0.55} color="#14161C" />
    </div>
  );
}

function AssistantMessageBubble({ msg }) {
  if (msg.role === "action") {
    return (
      <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg self-start" style={{ background: T.teal + "14", color: T.teal, border: `1px solid ${T.teal}33` }}>
        <Check size={12} /> {msg.content}
      </div>
    );
  }
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse self-end" : "self-start"}`} style={{ maxWidth: "85%" }}>
      {!isUser && <AssistantAvatar size={22} />}
      <div
        className="px-3.5 py-2.5 rounded-2xl text-sm"
        style={{
          background: isUser ? `linear-gradient(135deg, ${GRAD[T.sky][0]}, ${GRAD[T.sky][1]})` : T.surface2,
          color: isUser ? "#14161C" : T.text,
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
          whiteSpace: "pre-wrap",
          lineHeight: 1.5,
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 self-start">
      <AssistantAvatar size={22} />
      <div className="px-3.5 py-3 rounded-2xl flex gap-1" style={{ background: T.surface2, borderBottomLeftRadius: 4 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: T.muted, animation: `assistantDot 1.2s ${i * 0.15}s infinite ease-in-out` }} />
        ))}
      </div>
    </div>
  );
}

const QUICK_PROMPTS = [
  "How's my week looking?",
  "What should I focus on today?",
  "Add a task to call the dentist tomorrow",
  "I just had 2 eggs and toast for breakfast",
];

function AssistantChatBody({ messages, loading, onSend, height }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const submit = () => {
    if (!input.trim() || loading) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col" style={{ height }}>
      <style>{`@keyframes assistantDot { 0%,60%,100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }`}</style>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2.5">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex items-center gap-2 mb-1">
              <AssistantAvatar size={26} />
              <span style={{ color: T.muted, fontSize: 13 }}>Ask me anything about your day, or ask me to log something.</span>
            </div>
            {QUICK_PROMPTS.map(p => (
              <button key={p} onClick={() => onSend(p)} className="text-left text-xs px-3 py-2 rounded-xl" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>
                {p}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => <AssistantMessageBubble key={i} msg={m} />)}
        {loading && <TypingIndicator />}
      </div>
      <div className="flex items-center gap-2 p-3" style={{ borderTop: `1px solid ${T.line}` }}>
        <Input
          value={input} onChange={e => setInput(e.target.value)}
          placeholder="Message LifeOS Assistant…"
          onKeyDown={e => e.key === "Enter" && submit()}
          disabled={loading}
        />
        <button
          onClick={submit} disabled={loading || !input.trim()}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${GRAD[T.violet][0]}, ${GRAD[T.violet][1]})`, opacity: loading || !input.trim() ? 0.5 : 1 }}
        >
          <Send size={16} color="#14161C" />
        </button>
      </div>
    </div>
  );
}

function AssistantDrawer({ open, onClose, messages, loading, onSend }) {
  if (!open) return null;
  return (
    <div className="fixed z-40 bottom-40 md:bottom-24 right-5 md:right-8 w-[calc(100%-2.5rem)] max-w-sm">
      <Panel style={{ background: T.surface2, boxShadow: "0 24px 64px -12px rgba(0,0,0,0.6)", padding: 0, overflow: "hidden" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2">
            <AssistantAvatar size={22} />
            <span style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: T.text }}>LifeOS Assistant</span>
          </div>
          <IconBtn title="Close" onClick={onClose}><X size={17} /></IconBtn>
        </div>
        <AssistantChatBody messages={messages} loading={loading} onSend={onSend} height={420} />
      </Panel>
    </div>
  );
}

function AssistantFAB({ onClick }) {
  const [g1, g2] = GRAD[T.violet];
  return (
    <button
      onClick={onClick}
      aria-label="Open AI Assistant"
      className="fixed z-30 flex items-center justify-center rounded-full transition-transform active:scale-90 bottom-24 md:bottom-8 right-5 md:right-8"
      style={{ width: 56, height: 56, background: `linear-gradient(135deg, ${g1}, ${g2})`, boxShadow: `${glow(T.violet, 0.55)}, 0 8px 20px -6px rgba(0,0,0,0.6)`, border: "none" }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.06)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <Sparkles size={24} color="#14161C" />
    </button>
  );
}

function AssistantTabPage({ messages, loading, onSend }) {
  return (
    <div className="space-y-4">
      <div>
        <Eyebrow color={T.violet}>Your Companion</Eyebrow>
        <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Assistant</h2>
      </div>
      <Panel style={{ padding: 0, overflow: "hidden" }}>
        <AssistantChatBody messages={messages} loading={loading} onSend={onSend} height={560} />
      </Panel>
    </div>
  );
}

/* ---------------- seed data ---------------- */
const HABIT_CATEGORIES = [
  { id: "health", label: "Health", color: T.coral },
  { id: "mind", label: "Mind", color: T.violet },
  { id: "productivity", label: "Productivity", color: T.brass },
  { id: "social", label: "Social", color: T.sky },
  { id: "other", label: "Other", color: T.muted },
];

const SEED_HABITS = [
  { id: uid(), name: "Morning workout", icon: "💪", color: T.coral, category: "health", impactWeight: 4, reminderTime: "", archived: false, completions: {} },
  { id: uid(), name: "Read 20 minutes", icon: "📖", color: T.brass, category: "mind", impactWeight: 3, reminderTime: "", archived: false, completions: {} },
  { id: uid(), name: "Drink 2L water", icon: "💧", color: T.teal, category: "health", impactWeight: 3, reminderTime: "", archived: false, completions: {} },
  { id: uid(), name: "No phone after 10pm", icon: "🌙", color: T.violet, category: "mind", impactWeight: 2, reminderTime: "", archived: false, completions: {} },
];

const SEED_GOALS = [
  { id: uid(), title: "Run a half marathon", category: "Health", targetDate: "2026-11-01", progress: 35,
    milestones: [
      { id: uid(), text: "Run 5k without stopping", done: true },
      { id: uid(), text: "Run 10k", done: true },
      { id: uid(), text: "Run 15k", done: false },
      { id: uid(), text: "Race day", done: false },
    ] },
  { id: uid(), title: "Build 6-month emergency fund", category: "Finance", targetDate: "2027-01-01", progress: 52,
    milestones: [
      { id: uid(), text: "Save first ₹1,00,000", done: true },
      { id: uid(), text: "Reach ₹3,00,000", done: true },
      { id: uid(), text: "Reach ₹6,00,000", done: false },
    ] },
];

const SEED_TX = [
  { id: uid(), date: todayStr(), type: "expense", category: "Groceries", amount: 64.2, note: "Weekly shop" },
  { id: uid(), date: todayStr(), type: "income", category: "Salary", amount: 3200, note: "Paycheck" },
  { id: uid(), date: daysAgoArr(3)[0], type: "expense", category: "Transport", amount: 22.5, note: "Fuel" },
  { id: uid(), date: daysAgoArr(5)[0], type: "expense", category: "Dining", amount: 38.9, note: "Dinner out" },
];

const SEED_WORKOUTS = [
  { id: uid(), date: todayStr(), type: "Run", duration: 32, calories: 310 },
  { id: uid(), date: daysAgoArr(2)[0], type: "Strength", duration: 45, calories: 260 },
];

const SEED_WEIGHT = daysAgoArr(14).map((d, i) => ({ id: uid(), date: d, value: 78 - i * 0.08 }));

const SEED_TASKS = [
  { id: uid(), text: "Pay electricity bill", quadrant: "urgent-important", done: false, dueDate: todayStr() },
  { id: uid(), text: "Plan next month's budget", quadrant: "not_urgent-important", done: false, dueDate: "" },
  { id: uid(), text: "Reply to non-critical emails", quadrant: "urgent-not_important", done: false, dueDate: "" },
  { id: uid(), text: "Reorganize desk drawer", quadrant: "not_urgent-not_important", done: false, dueDate: "" },
];

const SEED_JOURNAL = [
  { id: uid(), date: todayStr(), mood: 4, text: "Good energy today. Got through my morning routine and felt focused at work." },
];

const SEED_SCHEDULE = [
  { id: uid(), time: "08:00", label: "Gym" },
  { id: uid(), time: "10:00", label: "College" },
  { id: uid(), time: "16:00", label: "Study" },
  { id: uid(), time: "20:00", label: "Journal" },
];

const SEED_VITALS = {
  caloriesGoal: 2500,
  proteinGoal: 180,
  fatsGoal: 70,
  carbsGoal: 250,
  waterGoal: 2500,
  steps: 8500, stepsGoal: 10000,
  sleepHours: 7.75, sleepGoal: 8,
  dailyBudget: 1500,
};

const EMPTY_VITALS = {
  caloriesGoal: 0,
  proteinGoal: 0,
  fatsGoal: 0,
  carbsGoal: 0,
  waterGoal: 0,
  steps: 0,
  stepsGoal: 0,
  sleepHours: 0,
  sleepGoal: 0,
  dailyBudget: 0,
};

// Water is logged as one running ml total per date — { "2026-08-01": 1500, ... } —
// which keeps the tracker's tap-to-fill glasses trivial to reconcile.
const SEED_WATERLOG = {};
const WATER_UNIT_ML = 250;

// Meal-type metadata shared by the Nutrition module's timeline and quick-add flow.
const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast", icon: Coffee, color: T.gold },
  { id: "lunch", label: "Lunch", icon: Sun, color: T.brass },
  { id: "dinner", label: "Dinner", icon: Moon, color: T.violet },
  { id: "snack", label: "Snacks", icon: Cookie, color: T.coral },
];
const mealTypeFor = (hour) => (hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 20 ? "dinner" : "snack");
const nowTimeStr = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

const SEED_PROFILE = { name: "" };
const EMPTY_HABITS = [];
const EMPTY_GOALS = [];
const EMPTY_TX = [];
const EMPTY_WORKOUTS = [];
const EMPTY_WEIGHT = [];
const EMPTY_TASKS = [];
const EMPTY_JOURNAL = [];
const EMPTY_SCHEDULE = [];
const EMPTY_WATERLOG = {};
const EMPTY_PROFILE = { name: "" };
const EMPTY_INTEGRATIONS = { strava: { connected: false }, hevy: { connected: false }, samsungHealth: { connected: false } };
const EMPTY_CALORIELOG = [];
const APP_STORAGE_VERSION = "blank-v1";

/* ================= Shared UI atoms ================= */

function Panel({ children, style, className = "", hover = false, ...props }) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0) 40%), " + T.surface,
        border: `1px solid ${T.line}`,
        borderTop: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.5)",
        backdropFilter: "blur(20px)",
        transition: "transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
        ...style,
      }}
      onMouseEnter={hover ? (e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = T.muted + "55"; } : undefined}
      onMouseLeave={hover ? (e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = T.line; } : undefined}
      {...props}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children, color = T.muted }) {
  return (
    <div
      className="text-xs tracking-widest uppercase font-semibold mb-1"
      style={{ color, fontFamily: "Inter, sans-serif", letterSpacing: "0.12em" }}
    >
      {children}
    </div>
  );
}

function IconBtn({ onClick, children, title, danger }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="p-1.5 rounded-lg transition-colors"
      style={{ color: danger ? T.coral : T.muted }}
      onMouseEnter={(e) => (e.currentTarget.style.background = T.surface2)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function PrimaryBtn({ onClick, children, color = T.brass, style, type = "button" }) {
  const [g1, g2] = GRAD[color] || [color, color];
  return (
    <button
      type={type}
      onClick={onClick}
      className="px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all active:scale-95"
      style={{
        background: `linear-gradient(135deg, ${g1}, ${g2})`,
        color: "#14161C",
        fontFamily: "Inter, sans-serif",
        boxShadow: glow(g2, 0.3),
        border: "none",
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
    >
      {children}
    </button>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={"w-full px-3 py-2 rounded-lg text-sm outline-none transition-shadow " + (props.className || "")}
      style={{
        background: T.surface2,
        border: `1px solid ${T.line}`,
        color: T.text,
        fontFamily: "Inter, sans-serif",
        ...props.style,
      }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 3px ${T.sky}33`; e.currentTarget.style.borderColor = T.sky; props.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = T.line; props.onBlur?.(e); }}
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-shadow"
      style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text, fontFamily: "Inter, sans-serif" }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 3px ${T.sky}33`; e.currentTarget.style.borderColor = T.sky; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = T.line; }}
    >
      {props.children}
    </select>
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(6,8,11,0.72)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
        <Panel style={{ background: T.surface2 }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="font-semibold" style={{ fontFamily: "Fraunces, serif", fontSize: 18, color: T.text }}>{title}</div>
            <IconBtn title="Close" onClick={onClose}><X size={18} /></IconBtn>
          </div>
          <div className="p-5">{children}</div>
        </Panel>
      </div>
    </div>
  );
}

/* ================= Vitals ring cluster (signature element) ================= */

function Ring({ pct, color, size = 140, stroke = 12, label, value }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - Math.min(Math.max(pct, 0), 1) * c;
  const [g1, g2] = GRAD[color] || [color, color];
  const gid = gradId(color);
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={g1} />
              <stop offset="100%" stopColor={g2} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.line} strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke}
            strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1)", filter: `drop-shadow(0 0 6px ${g2}88)` }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: size < 100 ? 18 : 22, fontWeight: 600, color: T.text }}>{value}</div>
        </div>
      </div>
      <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: T.muted, letterSpacing: "0.1em" }}>
        {label}
      </div>
    </div>
  );
}

/* ================= HABITS module ================= */

function HabitsModule({ habits, setHabits }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("✨");
  const [category, setCategory] = useState("health");
  const [impactWeight, setImpactWeight] = useState(3);
  const [reminderTime, setReminderTime] = useState("");

  const [filter, setFilter] = useState("all");
  const [detailId, setDetailId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [celebrateId, setCelebrateId] = useState(null);

  const week = daysAgoArr(7);
  const today = todayStr();
  const palette = [T.brass, T.teal, T.coral, T.violet, T.sky, T.gold];

  const active = habits.filter(h => !h.archived);
  const archived = habits.filter(h => h.archived);

  const visible = useMemo(() => {
    let list = filter === "archived" ? archived : active;
    if (filter !== "all" && filter !== "archived") {
      if (filter === "due") list = list.filter(h => !h.completions[today]);
      else list = list.filter(h => (h.category || "other") === filter);
    }
    return list;
  }, [active, archived, filter, today]);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") Notification.requestPermission();
  }, []);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const timers = [];
    active.forEach(h => {
      if (!h.reminderTime || h.completions[today]) return;
      const [hh, mm] = h.reminderTime.split(":").map(Number);
      const target = new Date();
      target.setHours(hh, mm, 0, 0);
      const delay = target - new Date();
      if (delay > 0) {
        timers.push(setTimeout(() => {
          new Notification("Habit reminder", { body: `Time for: ${h.name}` });
        }, delay));
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [active, today]);

  const addHabit = () => {
    if (!name.trim()) return;
    setHabits([...habits, {
      id: uid(), name: name.trim(), icon, color: palette[active.length % palette.length],
      category, impactWeight, reminderTime, archived: false, completions: {},
    }]);
    setName(""); setIcon("✨"); setCategory("health"); setImpactWeight(3); setReminderTime(""); setShowAdd(false);
  };

  const toggle = (id, date) => {
    setHabits(habits.map(h => {
      if (h.id !== id) return h;
      const c = { ...h.completions };
      const wasDone = !!c[date];
      if (wasDone) delete c[date]; else c[date] = true;
      if (!wasDone && date === today) {
        setCelebrateId(id);
        setTimeout(() => setCelebrateId(cur => cur === id ? null : cur), 600);
      }
      return { ...h, completions: c };
    }));
  };

  const streak = (h) => {
    let s = 0;
    let d = new Date();
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      if (h.completions[ds]) { s++; d.setDate(d.getDate() - 1); } else break;
    }
    return s;
  };

  const completionPct = (h) => {
    const days = daysAgoArr(30);
    const done = days.filter(d => h.completions[d]).length;
    return Math.round((done / days.length) * 100);
  };

  const removeHabit = (id) => { setHabits(habits.filter(h => h.id !== id)); if (detailId === id) setDetailId(null); };
  const toggleArchive = (id) => setHabits(habits.map(h => h.id === id ? { ...h, archived: !h.archived } : h));
  const updateHabit = (id, updates) => setHabits(habits.map(h => h.id === id ? { ...h, ...updates } : h));

  const onDragStart = (id) => setDragId(id);
  const onDropOn = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const list = [...habits];
    const fromIdx = list.findIndex(h => h.id === dragId);
    const toIdx = list.findIndex(h => h.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    setHabits(list);
    setDragId(null);
  };

  const todayDoneCount = active.filter(h => h.completions[today]).length;
  const todayPct = active.length ? Math.round((todayDoneCount / active.length) * 100) : 0;

  const perfectStreak = (() => {
    if (active.length === 0) return 0;
    let s = 0; let d = new Date();
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      const allDone = active.every(h => h.completions[ds]);
      if (allDone) { s++; d.setDate(d.getDate() - 1); } else break;
    }
    return s;
  })();

  const impactScore = active.length
    ? Math.round(
        active.reduce((sum, h) => sum + (h.completions[today] ? (h.impactWeight || 3) : 0), 0) /
        active.reduce((sum, h) => sum + (h.impactWeight || 3), 0) * 100
      )
    : 0;

  const detailHabit = habits.find(h => h.id === detailId);
  const editHabit = habits.find(h => h.id === editId);

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes habitPop { 0% { transform: scale(1); } 40% { transform: scale(1.35); } 100% { transform: scale(1); } }
        .habit-pop { animation: habitPop 0.45s cubic-bezier(.34,1.56,.64,1); }
      `}</style>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Eyebrow color={T.brass}>Daily Discipline</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Habits</h2>
        </div>
        <PrimaryBtn onClick={() => setShowAdd(true)}><Plus size={16} /> New habit</PrimaryBtn>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Panel style={{ padding: 16 }}>
          <Eyebrow>Today</Eyebrow>
          <div className="flex items-center gap-3">
            <Ring pct={todayPct / 100} color={T.brass} size={56} stroke={6} label="" value="" />
            <div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color: T.text }}>{todayPct}%</div>
              <div style={{ color: T.muted, fontSize: 11.5 }}>{todayDoneCount}/{active.length} done</div>
            </div>
          </div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <Eyebrow>Perfect streak</Eyebrow>
          <div className="flex items-center gap-1.5" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 24, color: T.brass }}>
            <Flame size={20} /> {perfectStreak}
          </div>
          <div style={{ color: T.muted, fontSize: 11.5 }}>days all habits done</div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <Eyebrow>Active habits</Eyebrow>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 24, color: T.text }}>{active.length}</div>
          <div style={{ color: T.muted, fontSize: 11.5 }}>{archived.length} archived</div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <Eyebrow color={T.violet}>Impact score</Eyebrow>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 24, color: T.violet }}>{impactScore}</div>
          <div style={{ color: T.muted, fontSize: 11.5 }}>weighted by importance</div>
        </Panel>
      </div>

      <div className="flex flex-wrap gap-2">
        {[{ id: "all", label: "All" }, { id: "due", label: "Due today" }, ...HABIT_CATEGORIES, { id: "archived", label: "Archived" }].map(f => {
          const isActive = filter === f.id;
          const color = f.color || T.muted;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: isActive ? color + "22" : T.surface2, color: isActive ? color : T.muted, border: `1px solid ${isActive ? color : T.line}` }}>
              {f.label}
            </button>
          );
        })}
      </div>

      <Panel style={{ padding: 0, overflowX: "auto" }}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.line}` }}>
              <th className="text-left py-3 px-4" style={{ color: T.muted, fontWeight: 500 }}>Habit</th>
              {week.map(d => {
                const isToday = d === today;
                return (
                  <th key={d} className="px-2 py-3 text-center" style={{ color: isToday ? T.brass : T.muted, fontSize: 11, background: isToday ? T.brass + "14" : "transparent" }}>
                    {new Date(d).toLocaleDateString(undefined, { weekday: "narrow" })}
                  </th>
                );
              })}
              <th className="px-4 py-3 text-center" style={{ color: T.muted }}>Streak</th>
              <th className="px-4 py-3 text-center" style={{ color: T.muted }}>30d</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(h => {
              const cat = HABIT_CATEGORIES.find(c => c.id === (h.category || "other"));
              return (
                <tr key={h.id}
                  draggable
                  onDragStart={() => onDragStart(h.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropOn(h.id)}
                  style={{ borderBottom: `1px solid ${T.line}`, opacity: dragId === h.id ? 0.4 : 1 }}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <GripVertical size={14} color={T.muted} style={{ cursor: "grab" }} />
                      <span>{h.icon}</span>
                      <button onClick={() => setDetailId(h.id)} className="text-left">
                        <span style={{ color: T.text }}>{h.name}</span>
                        {cat && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: cat.color + "22", color: cat.color }}>{cat.label}</span>}
                        {h.reminderTime && <Bell size={11} color={T.muted} className="inline ml-1.5" style={{ verticalAlign: "middle" }} />}
                      </button>
                    </div>
                  </td>
                  {week.map(d => {
                    const done = !!h.completions[d];
                    const isToday = d === today;
                    return (
                      <td key={d} className="text-center px-2 py-3" style={{ background: isToday ? T.brass + "0d" : "transparent" }}>
                        <button aria-label={`${h.name} on ${d}`} onClick={() => toggle(h.id, d)} className={celebrateId === h.id && isToday ? "habit-pop" : ""}>
                          {done
                            ? <CheckCircle2 size={22} color={h.color} fill={h.color + "33"} />
                            : <Circle size={22} color={T.line} />}
                        </button>
                      </td>
                    );
                  })}
                  <td className="text-center px-4">
                    <span className="inline-flex items-center gap-1 font-semibold" style={{ color: T.brass, fontFamily: "JetBrains Mono, monospace" }}>
                      <Flame size={14} /> {streak(h)}
                    </span>
                  </td>
                  <td className="text-center px-4">
                    <span style={{ color: T.muted, fontFamily: "JetBrains Mono, monospace", fontSize: 12.5 }}>{completionPct(h)}%</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-0.5 justify-end pr-2">
                      <IconBtn title="Edit habit" onClick={() => setEditId(h.id)}><Edit3 size={14} /></IconBtn>
                      <IconBtn title={h.archived ? "Unarchive" : "Archive"} onClick={() => toggleArchive(h.id)}>
                        {h.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      </IconBtn>
                      <IconBtn title="Delete habit" danger onClick={() => removeHabit(h.id)}><Trash2 size={14} /></IconBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={11} className="text-center py-10" style={{ color: T.muted }}>Nothing here for this filter.</td></tr>
            )}
          </tbody>
        </table>
      </Panel>

      {showAdd && (
        <Modal title="New habit" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Eyebrow>Icon</Eyebrow>
                <Input value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} />
              </div>
              <div className="col-span-2">
                <Eyebrow>Name</Eyebrow>
                <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Meditate 10 min" onKeyDown={e => e.key === "Enter" && addHabit()} />
              </div>
            </div>
            <div>
              <Eyebrow>Category</Eyebrow>
              <Select value={category} onChange={e => setCategory(e.target.value)}>
                {HABIT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </div>
            <div>
              <Eyebrow>Impact (how much this habit moves the needle)</Eyebrow>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setImpactWeight(n)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: impactWeight === n ? T.brass + "33" : T.surface2, border: `1px solid ${impactWeight === n ? T.brass : T.line}`, color: impactWeight === n ? T.brass : T.muted }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Eyebrow>Reminder (optional)</Eyebrow>
              <Input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} />
            </div>
            <PrimaryBtn onClick={addHabit} style={{ width: "100%", justifyContent: "center" }}>Add habit</PrimaryBtn>
          </div>
        </Modal>
      )}

      {editHabit && (
        <Modal title="Edit habit" onClose={() => setEditId(null)}>
          <HabitEditForm habit={editHabit} onSave={(updates) => { updateHabit(editHabit.id, updates); setEditId(null); }} />
        </Modal>
      )}

      {detailHabit && (
        <HabitDetailDrawer habit={detailHabit} onClose={() => setDetailId(null)} streak={streak(detailHabit)} completionPct={completionPct(detailHabit)} />
      )}
    </div>
  );
}

function HabitEditForm({ habit, onSave }) {
  const [name, setName] = useState(habit.name);
  const [icon, setIcon] = useState(habit.icon);
  const [category, setCategory] = useState(habit.category || "other");
  const [impactWeight, setImpactWeight] = useState(habit.impactWeight || 3);
  const [reminderTime, setReminderTime] = useState(habit.reminderTime || "");
  const [color, setColor] = useState(habit.color);
  const colorOptions = [T.brass, T.teal, T.coral, T.violet, T.sky, T.gold];

  const save = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon, category, impactWeight, reminderTime, color });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Eyebrow>Icon</Eyebrow>
          <Input value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} />
        </div>
        <div className="col-span-2">
          <Eyebrow>Name</Eyebrow>
          <Input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} />
        </div>
      </div>
      <div>
        <Eyebrow>Category</Eyebrow>
        <Select value={category} onChange={e => setCategory(e.target.value)}>
          {HABIT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
      </div>
      <div>
        <Eyebrow>Color</Eyebrow>
        <div className="flex gap-2">
          {colorOptions.map(c => (
            <button key={c} onClick={() => setColor(c)} className="w-7 h-7 rounded-full"
              style={{ background: c, border: color === c ? `2px solid ${T.text}` : "2px solid transparent" }} />
          ))}
        </div>
      </div>
      <div>
        <Eyebrow>Impact</Eyebrow>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setImpactWeight(n)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: impactWeight === n ? T.brass + "33" : T.surface2, border: `1px solid ${impactWeight === n ? T.brass : T.line}`, color: impactWeight === n ? T.brass : T.muted }}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Eyebrow>Reminder</Eyebrow>
        <Input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} />
      </div>
      <PrimaryBtn onClick={save} style={{ width: "100%", justifyContent: "center" }}>Save changes</PrimaryBtn>
    </div>
  );
}

function HabitHeatmap({ completions, color }) {
  const days = daysAgoArr(70);
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <div className="flex gap-1">
      {weeks.map((wk, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {wk.map(d => (
            <div key={d} title={d} style={{ width: 10, height: 10, borderRadius: 2, background: completions[d] ? color : T.surface2 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function HabitDetailDrawer({ habit, onClose, streak, completionPct }) {
  const cat = HABIT_CATEGORIES.find(c => c.id === (habit.category || "other"));
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(6,8,11,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-sm overflow-y-auto" style={{ background: T.surface2, borderLeft: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 22 }}>{habit.icon}</span>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, color: T.text }}>{habit.name}</div>
          </div>
          <IconBtn title="Close" onClick={onClose}><X size={18} /></IconBtn>
        </div>
        <div className="p-5 space-y-4">
          {cat && <span className="text-xs px-2 py-1 rounded-full" style={{ background: cat.color + "22", color: cat.color }}>{cat.label}</span>}
          <div className="grid grid-cols-3 gap-3">
            <Panel style={{ padding: 12 }}>
              <div className="text-xs" style={{ color: T.muted }}>Streak</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 18, color: T.brass }}>{streak}</div>
            </Panel>
            <Panel style={{ padding: 12 }}>
              <div className="text-xs" style={{ color: T.muted }}>30-day</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 18, color: T.text }}>{completionPct}%</div>
            </Panel>
            <Panel style={{ padding: 12 }}>
              <div className="text-xs" style={{ color: T.muted }}>Impact</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 18, color: T.violet }}>{habit.impactWeight || 3}/5</div>
            </Panel>
          </div>
          <div>
            <Eyebrow>Last 10 weeks</Eyebrow>
            <HabitHeatmap completions={habit.completions} color={habit.color} />
          </div>
          {habit.reminderTime && (
            <div className="flex items-center gap-2 text-sm" style={{ color: T.muted }}>
              <Bell size={14} /> Reminder set for {fmtTime12(habit.reminderTime)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= GOALS module ================= */

const GOAL_PRIORITY = {
  High: { color: T.coral },
  Medium: { color: T.gold },
  Low: { color: T.muted },
};

// ---- Feature 7: progress history log ----
// Called any time a goal's progress changes (milestone toggle, manual
// slider). Keeps one entry per calendar day so the trend line stays clean
// even if progress is nudged multiple times in one sitting.
function logGoalProgress(goal, newProgress) {
  const today = todayStr();
  const history = (goal.progressHistory || []).filter(h => h.date !== today);
  return {
    ...goal,
    progress: newProgress,
    progressHistory: [...history, { date: today, progress: newProgress }].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ---- Feature 2: countdown ----
function goalCountdown(targetDate) {
  if (!targetDate) return null;
  const days = Math.ceil((new Date(targetDate + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000);
  if (days < 0) return { text: `Overdue by ${Math.abs(days)}d`, color: T.coral };
  if (days === 0) return { text: "Due today", color: T.coral };
  return { text: `${days} days left`, color: days <= 7 ? T.gold : T.muted };
}

// ---- Feature 3: completion prediction (simple velocity projection, not literal AI) ----
// Looks at the goal's own progress history: if it has at least two data
// points, projects forward at the recent rate of change. This is a
// deliberately simple heuristic — no external model call — but reads the
// same as an "AI prediction" feature to the user.
function predictCompletion(goal) {
  const hist = (goal.progressHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (goal.progress >= 100) return { status: "done" };
  if (hist.length < 2) return { status: "insufficient" };
  const first = hist[0], last = hist[hist.length - 1];
  const daysElapsed = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (daysElapsed <= 0) return { status: "insufficient" };
  const rate = (last.progress - first.progress) / daysElapsed;
  if (rate <= 0.05) return { status: "stalled" };
  const daysNeeded = (100 - last.progress) / rate;
  const predictedDate = new Date(last.date + "T00:00:00");
  predictedDate.setDate(predictedDate.getDate() + Math.round(daysNeeded));
  const predictedStr = predictedDate.toISOString().slice(0, 10);
  const onTrack = goal.targetDate ? predictedDate <= new Date(goal.targetDate + "T00:00:00") : true;
  return { status: "predicted", date: predictedStr, onTrack };
}

function PredictionLine({ goal }) {
  const p = predictCompletion(goal);
  if (p.status === "done") return <div className="flex items-center gap-1.5 text-xs" style={{ color: T.teal }}><Sparkles size={12} /> Goal complete</div>;
  if (p.status === "insufficient") return <div className="flex items-center gap-1.5 text-xs" style={{ color: T.muted }}><Sparkles size={12} /> Not enough history yet to predict</div>;
  if (p.status === "stalled") return <div className="flex items-center gap-1.5 text-xs" style={{ color: T.coral }}><Sparkles size={12} /> Progress has stalled recently</div>;
  const color = p.onTrack ? T.teal : T.coral;
  const label = p.onTrack ? "On track to finish by" : "Behind pace — projected";
  return (
    <div className="flex items-center gap-1.5 text-xs" style={{ color }}>
      <Sparkles size={12} /> {label} {fmtDate(p.date)}
    </div>
  );
}

// ---- Feature 7: mini trend chart ----
function GoalTrendChart({ history, color, height = 60 }) {
  const data = (history || []).map(h => ({ date: fmtDate(h.date), progress: h.progress }));
  if (data.length < 2) {
    return <div style={{ height, display: "flex", alignItems: "center", color: T.muted, fontSize: 11 }}>Not enough data for a trend yet.</div>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" hide />
          <YAxis domain={[0, 100]} hide />
          <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text, fontSize: 12 }} />
          <Line type="monotone" dataKey="progress" stroke={color} strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---- Feature 1: link habits & tasks ----
function LinkedItemsPicker({ label, color, icon: Icon, allItems, getLabel, linkedIds, onToggle }) {
  return (
    <div>
      <Eyebrow icon={Icon} color={color}>{label}</Eyebrow>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {allItems.length === 0 && <div style={{ color: T.muted, fontSize: 12.5 }}>None yet.</div>}
        {allItems.map(item => {
          const checked = linkedIds.includes(item.id);
          return (
            <button key={item.id} onClick={() => onToggle(item.id)} className="flex items-center gap-2 text-sm w-full text-left">
              {checked ? <CheckCircle2 size={15} color={color} /> : <Circle size={15} color={T.line} />}
              <span style={{ color: checked ? T.text : T.muted }}>{getLabel(item)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Feature 5: Goal Details Drawer ----
function GoalDetailDrawer({ goal, habits, tasks, onClose, onUpdate, onDelete }) {
  const [notes, setNotes] = useState(goal.notes || "");
  const [newLink, setNewLink] = useState("");
  const links = goal.links || [];
  const linkedHabitIds = goal.linkedHabitIds || [];
  const linkedTaskIds = goal.linkedTaskIds || [];

  const saveNotes = () => onUpdate(goal.id, { notes });

  const addLink = () => {
    if (!newLink.trim()) return;
    const url = /^https?:\/\//i.test(newLink.trim()) ? newLink.trim() : `https://${newLink.trim()}`;
    onUpdate(goal.id, { links: [...links, { id: uid(), url }] });
    setNewLink("");
  };
  const removeLink = (id) => onUpdate(goal.id, { links: links.filter(l => l.id !== id) });

  const toggleHabit = (id) => onUpdate(goal.id, { linkedHabitIds: linkedHabitIds.includes(id) ? linkedHabitIds.filter(x => x !== id) : [...linkedHabitIds, id] });
  const toggleTask = (id) => onUpdate(goal.id, { linkedTaskIds: linkedTaskIds.includes(id) ? linkedTaskIds.filter(x => x !== id) : [...linkedTaskIds, id] });

  const setProgress = (val) => onUpdate(goal.id, logGoalProgress(goal, val));

  const catColor = { Health: T.coral, Finance: T.teal, Career: T.brass, Personal: T.violet };
  const color = catColor[goal.category] || T.violet;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(6,8,11,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-sm overflow-y-auto" style={{ background: T.surface2, borderLeft: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 17, color: T.text }}>{goal.title}</div>
          <IconBtn title="Close" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div className="p-5 space-y-5">
          <GoalTrendChart history={goal.progressHistory} color={color} height={90} />
          <PredictionLine goal={goal} />

          <div>
            <Eyebrow>Progress</Eyebrow>
            <div className="flex items-center gap-3">
              <input type="range" min="0" max="100" value={goal.progress} onChange={e => setProgress(+e.target.value)} className="flex-1" />
              <span style={{ fontFamily: "JetBrains Mono, monospace", color: T.text, width: 40, textAlign: "right" }}>{goal.progress}%</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Eyebrow>Target date</Eyebrow>
              <Input type="date" value={goal.targetDate || ""} onChange={e => onUpdate(goal.id, { targetDate: e.target.value })} />
            </div>
            <div>
              <Eyebrow>Priority</Eyebrow>
              <Select value={goal.priority || "Medium"} onChange={e => onUpdate(goal.id, { priority: e.target.value })}>
                {["High", "Medium", "Low"].map(p => <option key={p}>{p}</option>)}
              </Select>
            </div>
          </div>

          <LinkedItemsPicker
            label="Linked habits" color={T.brass} icon={Flame}
            allItems={habits.filter(h => !h.archived)} getLabel={h => `${h.icon} ${h.name}`}
            linkedIds={linkedHabitIds} onToggle={toggleHabit}
          />
          <LinkedItemsPicker
            label="Linked tasks" color={T.sky} icon={ListTodo}
            allItems={tasks.filter(t => !t.done)} getLabel={t => t.text}
            linkedIds={linkedTaskIds} onToggle={toggleTask}
          />

          <div>
            <Eyebrow icon={AlignLeft}>Notes</Eyebrow>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} rows={4}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text, fontFamily: "Inter, sans-serif" }}
              placeholder="Why this goal matters, plan of attack, etc."
            />
          </div>

          <div>
            <Eyebrow icon={Paperclip}>Resources & attachments</Eyebrow>
            <div className="space-y-1.5 mb-2">
              {links.map(l => (
                <div key={l.id} className="flex items-center gap-2 text-sm">
                  <Link2 size={13} color={T.sky} />
                  <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 truncate" style={{ color: T.sky }}>{l.url}</a>
                  <IconBtn title="Remove link" danger onClick={() => removeLink(l.id)}><Trash2 size={13} /></IconBtn>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newLink} onChange={e => setNewLink(e.target.value)} placeholder="Paste a link…" onKeyDown={e => e.key === "Enter" && addLink()} />
              <button onClick={addLink} className="px-3 rounded-lg" style={{ background: T.surface, color: T.sky, border: `1px solid ${T.line}` }}><Plus size={16} /></button>
            </div>
          </div>

          <button onClick={() => { onDelete(goal.id); onClose(); }} className="flex items-center gap-2 text-sm font-medium" style={{ color: T.coral }}>
            <Trash2 size={15} /> Delete goal
          </button>
        </div>
      </div>
    </div>
  );
}

function GoalsModule({ goals, setGoals, habits, tasks }) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Personal");
  const [priority, setPriority] = useState("Medium");
  const [targetDate, setTargetDate] = useState("");
  const [filter, setFilter] = useState("active"); // Feature 6: active / archived / all
  const [detailId, setDetailId] = useState(null);
  const [dragId, setDragId] = useState(null); // Feature: drag & drop reorder

  const togglePin = (id) => setGoals(goals.map(g => g.id === id ? { ...g, pinned: !g.pinned } : g));

  // Reorders the underlying `goals` array by moving the dragged goal to the
  // dropped-on goal's position — works regardless of which filter tab is
  // active, since it always operates on the full list by id.
  const reorderGoals = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const list = [...goals];
    const from = list.findIndex(g => g.id === dragId);
    const to = list.findIndex(g => g.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setGoals(list);
    setDragId(null);
  };

  const addGoal = () => {
    if (!title.trim()) return;
    setGoals([...goals, {
      id: uid(), title: title.trim(), category, priority, targetDate, progress: 0,
      milestones: [], archived: false, pinned: false, linkedHabitIds: [], linkedTaskIds: [],
      notes: "", links: [], progressHistory: [{ date: todayStr(), progress: 0 }],
    }]);
    setTitle(""); setTargetDate(""); setPriority("Medium"); setShowAdd(false);
  };

  const removeGoal = (id) => { setGoals(goals.filter(g => g.id !== id)); if (detailId === id) setDetailId(null); };
  const updateGoal = (id, updates) => setGoals(goals.map(g => g.id === id ? { ...g, ...updates } : g));
  const toggleArchive = (id) => setGoals(goals.map(g => g.id === id ? { ...g, archived: !g.archived } : g));

  const toggleMilestone = (gid, mid) => {
    setGoals(goals.map(g => {
      if (g.id !== gid) return g;
      const milestones = g.milestones.map(m => m.id === mid ? { ...m, done: !m.done } : m);
      const doneCount = milestones.filter(m => m.done).length;
      const progress = milestones.length ? Math.round((doneCount / milestones.length) * 100) : g.progress;
      return logGoalProgress({ ...g, milestones }, progress);
    }));
  };

  const addMilestone = (gid, text) => {
    if (!text.trim()) return;
    setGoals(goals.map(g => g.id === gid ? { ...g, milestones: [...g.milestones, { id: uid(), text: text.trim(), done: false }] } : g));
  };

  const catColor = { Health: T.coral, Finance: T.teal, Career: T.brass, Personal: T.violet };

  const visibleGoals = goals
    .filter(g => {
      if (filter === "active") return !g.archived;
      if (filter === "archived") return !!g.archived;
      return true;
    })
    // Array.prototype.sort is stable, so pinned goals float to the top
    // while preserving whatever order drag-and-drop last set.
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const detailGoal = goals.find(g => g.id === detailId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Eyebrow color={T.violet}>Long-range Trajectory</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Goals</h2>
        </div>
        <PrimaryBtn color={T.violet} onClick={() => setShowAdd(true)}><Plus size={16} /> New goal</PrimaryBtn>
      </div>

      {/* Feature 6: archive filter */}
      <div className="flex gap-2">
        {[{ id: "active", label: "Active" }, { id: "archived", label: "Archived" }, { id: "all", label: "All" }].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: filter === f.id ? T.violet + "22" : T.surface2, color: filter === f.id ? T.violet : T.muted, border: `1px solid ${filter === f.id ? T.violet : T.line}` }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {visibleGoals.map(g => {
          const color = catColor[g.category] || T.violet;
          const prColor = (GOAL_PRIORITY[g.priority] || GOAL_PRIORITY.Medium).color;
          const countdown = goalCountdown(g.targetDate);
          const linkedHabitCount = (g.linkedHabitIds || []).length;
          const linkedTaskCount = (g.linkedTaskIds || []).length;
          const grad = GRAD[color] || [color, color];

          return (
            <Panel
              key={g.id}
              style={{ padding: 18, opacity: dragId === g.id ? 0.4 : g.archived ? 0.6 : 1 }}
              draggable
              onDragStart={() => setDragId(g.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => reorderGoals(g.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <GripVertical size={15} color={T.muted} style={{ cursor: "grab", marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>{g.category}</span>
                      <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: prColor }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: prColor }} /> {g.priority || "Medium"}
                      </span>
                    </div>
                    <button onClick={() => setDetailId(g.id)} className="text-left">
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, color: T.text }}>{g.title}</div>
                    </button>
                    <div className="flex items-center gap-3 mt-1">
                      {countdown && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: countdown.color }}>
                          <Hourglass size={11} /> {countdown.text}
                        </span>
                      )}
                      {(linkedHabitCount > 0 || linkedTaskCount > 0) && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: T.muted }}>
                          <Link2 size={11} /> {linkedHabitCount} habit{linkedHabitCount === 1 ? "" : "s"} · {linkedTaskCount} task{linkedTaskCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <IconBtn title={g.pinned ? "Unpin goal" : "Pin goal"} onClick={() => togglePin(g.id)}>
                    <Star size={15} color={g.pinned ? T.gold : T.muted} fill={g.pinned ? T.gold : "none"} />
                  </IconBtn>
                  <IconBtn title={g.archived ? "Unarchive" : "Archive"} onClick={() => toggleArchive(g.id)}>
                    {g.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </IconBtn>
                  <IconBtn title="Delete goal" danger onClick={() => removeGoal(g.id)}><Trash2 size={15} /></IconBtn>
                </div>
              </div>

              <div className="mt-3">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
                  <div style={{ width: `${g.progress}%`, height: "100%", background: `linear-gradient(90deg, ${grad[0]}, ${grad[1]})`, transition: "width .4s" }} />
                </div>
                <div className="text-right text-xs mt-1 font-mono" style={{ color: T.muted }}>{g.progress}%</div>
              </div>

              <div className="mt-2">
                <GoalTrendChart history={g.progressHistory} color={color} />
              </div>

              <div className="mt-2">
                <PredictionLine goal={g} />
              </div>

              {g.progress >= 100 && !g.archived && (
                <button onClick={() => toggleArchive(g.id)} className="mt-2 text-xs font-semibold flex items-center gap-1" style={{ color: T.teal }}>
                  <Archive size={12} /> Complete — archive this goal
                </button>
              )}

              <div className="mt-3 space-y-1.5">
                {g.milestones.map(m => (
                  <button key={m.id} onClick={() => toggleMilestone(g.id, m.id)} className="flex items-center gap-2 text-sm w-full text-left">
                    {m.done ? <CheckCircle2 size={16} color={color} /> : <Circle size={16} color={T.line} />}
                    <span style={{ color: m.done ? T.muted : T.text, textDecoration: m.done ? "line-through" : "none" }}>{m.text}</span>
                  </button>
                ))}
              </div>

              <MilestoneAdder onAdd={(text) => addMilestone(g.id, text)} color={color} />

              <button onClick={() => setDetailId(g.id)} className="mt-3 text-xs font-semibold" style={{ color: T.muted }}>
                View details →
              </button>
            </Panel>
          );
        })}
        {visibleGoals.length === 0 && (
          <div className="col-span-2 text-center py-10" style={{ color: T.muted }}>
            {filter === "archived" ? "No archived goals." : "No goals yet — set your first trajectory."}
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="New goal" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div>
              <Eyebrow>Title</Eyebrow>
              <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Launch my side project" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Eyebrow>Category</Eyebrow>
                <Select value={category} onChange={e => setCategory(e.target.value)}>
                  {["Personal", "Health", "Finance", "Career"].map(c => <option key={c}>{c}</option>)}
                </Select>
              </div>
              <div>
                <Eyebrow>Priority</Eyebrow>
                <Select value={priority} onChange={e => setPriority(e.target.value)}>
                  {["High", "Medium", "Low"].map(p => <option key={p}>{p}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Eyebrow>Target date</Eyebrow>
              <Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
            </div>
            <PrimaryBtn color={T.violet} onClick={addGoal} style={{ width: "100%", justifyContent: "center" }}>Add goal</PrimaryBtn>
          </div>
        </Modal>
      )}

      {detailGoal && (
        <GoalDetailDrawer goal={detailGoal} habits={habits} tasks={tasks} onClose={() => setDetailId(null)} onUpdate={updateGoal} onDelete={removeGoal} />
      )}
    </div>
  );
}

function MilestoneAdder({ onAdd, color }) {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2 mt-3">
      <Input
        placeholder="Add milestone…" value={v} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { onAdd(v); setV(""); } }}
      />
      <button
        aria-label="Add milestone"
        onClick={() => { onAdd(v); setV(""); }}
        className="px-3 rounded-lg" style={{ background: T.surface2, color, border: `1px solid ${T.line}` }}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

/* ================= FINANCE module ================= */

function FinanceModule({ tx, setTx }) {
  const [showAdd, setShowAdd] = useState(false);
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("Groceries");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const income = tx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = tx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const net = income - expense;

  const byCategory = useMemo(() => {
    const m = {};
    tx.filter(t => t.type === "expense").forEach(t => { m[t.category] = (m[t.category] || 0) + t.amount; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [tx]);

  const trend = useMemo(() => {
    const days = daysAgoArr(14);
    let running = 0;
    return days.map(d => {
      const dayNet = tx.filter(t => t.date === d).reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
      running += dayNet;
      return { date: fmtDate(d), balance: Math.round(running * 100) / 100 };
    });
  }, [tx]);

  const pieColors = [T.teal, T.brass, T.coral, T.violet, "#5B8DEF", "#F2B84B"];

  const addTx = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setTx([{ id: uid(), date: todayStr(), type, category, amount: amt, note }, ...tx]);
    setAmount(""); setNote(""); setShowAdd(false);
  };

  const removeTx = (id) => setTx(tx.filter(t => t.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow color={T.teal}>Capital & Flow</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Finance</h2>
        </div>
        <PrimaryBtn color={T.teal} onClick={() => setShowAdd(true)}><Plus size={16} /> Log transaction</PrimaryBtn>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Panel style={{ padding: 16 }}>
          <Eyebrow>Income</Eyebrow>
          <div className="flex items-center gap-1" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.teal }}>
            <TrendingUp size={18} /> {fmtMoney(income)}
          </div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <Eyebrow>Expenses</Eyebrow>
          <div className="flex items-center gap-1" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.coral }}>
            <TrendingDown size={18} /> {fmtMoney(expense)}
          </div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <Eyebrow>Net</Eyebrow>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: net >= 0 ? T.text : T.coral }}>
            {fmtMoney(net)}
          </div>
        </Panel>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Panel style={{ padding: 16 }} className="md:col-span-2">
          <Eyebrow>14-day balance trend</Eyebrow>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.teal} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={T.teal} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={T.line} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke={T.muted} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={T.muted} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} />
                <Area type="monotone" dataKey="balance" stroke={T.teal} fill="url(#bal)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <Eyebrow>Spend by category</Eyebrow>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {byCategory.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel style={{ padding: 0 }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Eyebrow>Recent transactions</Eyebrow>
        </div>
        <div>
          {tx.slice(0, 10).map(t => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
              <div>
                <div style={{ color: T.text, fontSize: 14 }}>{t.note || t.category}</div>
                <div style={{ color: T.muted, fontSize: 12 }}>{t.category} · {fmtDate(t.date)}</div>
              </div>
              <div className="flex items-center gap-3">
                <div style={{ fontFamily: "JetBrains Mono, monospace", color: t.type === "income" ? T.teal : T.coral }}>
                  {t.type === "income" ? "+" : "-"}{fmtMoney(t.amount).replace("-", "")}
                </div>
                <IconBtn title="Delete transaction" danger onClick={() => removeTx(t.id)}><Trash2 size={14} /></IconBtn>
              </div>
            </div>
          ))}
          {tx.length === 0 && <div className="text-center py-10" style={{ color: T.muted }}>No transactions yet.</div>}
        </div>
      </Panel>

      {showAdd && (
        <Modal title="Log transaction" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div className="flex gap-2">
              {["expense", "income"].map(tp => (
                <button key={tp} onClick={() => setType(tp)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold capitalize"
                  style={{ background: type === tp ? (tp === "income" ? T.teal : T.coral) : T.surface2, color: type === tp ? "#12141A" : T.muted }}>
                  {tp}
                </button>
              ))}
            </div>
            <div>
              <Eyebrow>Category</Eyebrow>
              <Select value={category} onChange={e => setCategory(e.target.value)}>
                {["Groceries", "Rent", "Transport", "Dining", "Salary", "Investing", "Entertainment", "Health", "Other"].map(c => <option key={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <Eyebrow>Amount</Eyebrow>
              <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Eyebrow>Note (optional)</Eyebrow>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Weekly shop" />
            </div>
            <PrimaryBtn color={T.teal} onClick={addTx} style={{ width: "100%", justifyContent: "center" }}>Save</PrimaryBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= FITNESS module ================= */

const WORKOUT_SOURCES = [
  { id: "Manual", label: "Manual", color: T.violet },
  { id: "Strava", label: "Strava", color: T.coral },
  { id: "Hevy", label: "Hevy", color: T.sky },
];
const sourceColor = (src) => (WORKOUT_SOURCES.find(s => s.id === src) || WORKOUT_SOURCES[0]).color;

// ---- Feature: Personal Records ----
// Scans every workout's `exercises` array (each exercise has one or more
// {weight, reps} sets) and keeps the heaviest set ever logged per exercise
// name — regardless of whether it came from a manual entry, Strava, or Hevy.
function computePRs(workouts) {
  const map = {};
  workouts.forEach(w => {
    (w.exercises || []).forEach(ex => {
      const bestSet = (ex.sets || []).reduce((max, s) => (s.weight > max.weight ? s : max), { weight: 0, reps: 0 });
      if (bestSet.weight <= 0) return;
      const key = ex.name.trim().toLowerCase();
      if (!map[key] || bestSet.weight > map[key].weight) {
        map[key] = { name: ex.name.trim(), weight: bestSet.weight, reps: bestSet.reps, date: w.date, source: w.source || "Manual" };
      }
    });
  });
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

function PersonalRecordsPanel({ workouts }) {
  const prs = useMemo(() => computePRs(workouts), [workouts]);
  const weekAgo = daysAgoArr(7)[0];

  return (
    <Panel style={{ padding: 16 }}>
      <div className="flex items-center justify-between mb-3">
        <Eyebrow icon={Trophy} color={T.gold}>Personal Records</Eyebrow>
        <span style={{ color: T.muted, fontSize: 11 }}>{prs.length} tracked</span>
      </div>
      {prs.length === 0 ? (
        <div style={{ color: T.muted, fontSize: 12.5 }}>Log a strength set (or import from Hevy) to start tracking PRs.</div>
      ) : (
        <div className="space-y-2">
          {prs.map(pr => {
            const isNew = pr.date >= weekAgo;
            return (
              <div key={pr.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span style={{ color: T.text }}>{pr.name}</span>
                  {isNew && <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: T.gold + "22", color: T.gold }}>NEW</span>}
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: T.muted }}>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", color: T.text }}>{pr.weight}kg × {pr.reps}</span>
                  <span>{fmtDate(pr.date)}</span>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: sourceColor(pr.source) }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ---- Feature: weekly training summary (Strava + Hevy + Manual) ----
function weeklyChartData(workouts) {
  const week = daysAgoArr(7);
  return week.map(d => {
    const entry = { date: fmtDate(d) };
    WORKOUT_SOURCES.forEach(src => {
      entry[src.id] = workouts.filter(w => w.date === d && (w.source || "Manual") === src.id).reduce((s, w) => s + w.duration, 0);
    });
    return entry;
  });
}

function WeeklyTrainingSummary({ workouts }) {
  const chartData = useMemo(() => weeklyChartData(workouts), [workouts]);
  const week = daysAgoArr(7);
  const bySource = WORKOUT_SOURCES.map(src => {
    const items = workouts.filter(w => week.includes(w.date) && (w.source || "Manual") === src.id);
    return { ...src, minutes: items.reduce((s, w) => s + w.duration, 0), calories: items.reduce((s, w) => s + w.calories, 0), sessions: items.length };
  });

  return (
    <Panel style={{ padding: 16 }}>
      <Eyebrow color={T.coral}>Weekly Training Summary</Eyebrow>
      <div className="grid grid-cols-3 gap-3 my-3">
        {bySource.map(s => (
          <div key={s.id}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span style={{ width: 7, height: 7, borderRadius: 999, background: s.color }} />
              <span style={{ color: T.muted, fontSize: 11 }}>{s.label}</span>
            </div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 16, color: T.text }}>{s.minutes} min</div>
            <div style={{ color: T.muted, fontSize: 10.5 }}>{s.sessions} session{s.sessions === 1 ? "" : "s"} · {s.calories} kcal</div>
          </div>
        ))}
      </div>
      <div style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid stroke={T.line} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" stroke={T.muted} fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke={T.muted} fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} />
            {WORKOUT_SOURCES.map(src => (
              <Bar key={src.id} dataKey={src.id} stackId="a" fill={src.color} radius={src.id === "Hevy" ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

// ---- Feature: workout calendar synced from both apps ----
function WorkoutCalendar({ workouts }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const dateStr = (day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const workoutsOn = (day) => workouts.filter(w => w.date === dateStr(day));
  const sourcesOn = (day) => [...new Set(workoutsOn(day).map(w => w.source || "Manual"))];

  const selectedWorkouts = selectedDay ? workouts.filter(w => w.date === selectedDay) : [];

  return (
    <Panel style={{ padding: 16 }}>
      <div className="flex items-center justify-between mb-2">
        <Eyebrow icon={Calendar} color={T.violet}>Workout Calendar</Eyebrow>
        <div className="flex items-center gap-1">
          <IconBtn title="Previous month" onClick={() => setMonthOffset(m => m - 1)}><ChevronLeft size={16} /></IconBtn>
          <span className="text-xs" style={{ color: T.muted, width: 90, textAlign: "center" }}>{base.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
          <IconBtn title="Next month" onClick={() => setMonthOffset(m => m + 1)}><ChevronRight size={16} /></IconBtn>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} style={{ color: T.muted, fontSize: 10 }}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = dateStr(day);
          const isToday = ds === todayStr();
          const srcs = sourcesOn(day);
          return (
            <button
              key={i} onClick={() => srcs.length && setSelectedDay(ds === selectedDay ? null : ds)}
              className="flex flex-col items-center justify-center rounded-lg"
              style={{ aspectRatio: "1", background: ds === selectedDay ? T.violet + "22" : isToday ? T.brass + "18" : T.surface2, border: isToday ? `1px solid ${T.brass}` : `1px solid transparent` }}
            >
              <span style={{ fontSize: 11, color: isToday ? T.brass : T.text }}>{day}</span>
              <div className="flex gap-0.5 mt-0.5">
                {srcs.map(s => <span key={s} style={{ width: 4, height: 4, borderRadius: 999, background: sourceColor(s) }} />)}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs" style={{ color: T.muted }}>
        {WORKOUT_SOURCES.map(s => (
          <span key={s.id} className="flex items-center gap-1"><span style={{ width: 7, height: 7, borderRadius: 999, background: s.color }} /> {s.label}</span>
        ))}
      </div>
      {selectedWorkouts.length > 0 && (
        <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${T.line}` }}>
          {selectedWorkouts.map(w => (
            <div key={w.id} className="flex items-center justify-between text-sm">
              <span style={{ color: T.text }}>{w.type}</span>
              <span style={{ color: T.muted, fontSize: 11.5 }}>{w.duration} min · {w.calories} kcal · {w.source || "Manual"}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---- Feature: weight + body measurement trends ----
function WeightMeasurementTrend({ weight }) {
  const [metric, setMetric] = useState("weight");
  const metrics = [
    { id: "weight", label: "Weight", unit: "kg", color: T.coral },
    { id: "waist", label: "Waist", unit: "cm", color: T.sky },
    { id: "chest", label: "Chest", unit: "cm", color: T.brass },
    { id: "arms", label: "Arms", unit: "cm", color: T.violet },
  ];
  const available = metrics.filter(m => weight.some(w => w[m.id] != null));
  const active = available.find(m => m.id === metric) || available[0] || metrics[0];

  useEffect(() => {
    if (available.length > 0 && !available.some(m => m.id === metric)) {
      setMetric(available[0].id);
    }
  }, [available, metric]);

  const data = useMemo(() =>
    [...weight]
      .filter(w => w[active.id] != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(w => ({ date: fmtDate(w.date), value: Math.round(w[active.id] * 10) / 10 })),
    [weight, active.id]);

  return (
    <Panel style={{ padding: 16 }}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <Eyebrow icon={TrendingUp} color={active.color}>Weight & Measurement Trends</Eyebrow>
        <div className="flex gap-1 flex-wrap">
          {available.length > 0 ? available.map(m => (
            <button key={m.id} onClick={() => setMetric(m.id)}
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: metric === m.id ? m.color + "22" : T.surface2, color: metric === m.id ? m.color : T.muted, border: `1px solid ${metric === m.id ? m.color : T.line}` }}>
              {m.label}
            </button>
          )) : (
            <div style={{ color: T.muted, fontSize: 13 }}>No weight or measurement data logged yet.</div>
          )}
        </div>
      </div>
      {data.length > 0 ? (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke={T.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" stroke={T.muted} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={T.muted} fontSize={11} tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v) => [`${v} ${active.unit}`, active.label]} />
              <Line type="monotone" dataKey="value" stroke={active.color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex items-center justify-center h-40 text-sm" style={{ color: T.muted }}>No trends available yet.</div>
      )}
    </Panel>
  );
}

// ---- Log entry modal: workout (+ optional exercise sets for PRs), or weight & measurements ----
function ExerciseSetRow({ ex, onChange, onRemove }) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <Input value={ex.name} onChange={e => onChange({ ...ex, name: e.target.value })} placeholder="Exercise (e.g. Bench Press)" style={{ flex: "2 1 140px" }} />
      <Input type="number" value={ex.weight} onChange={e => onChange({ ...ex, weight: e.target.value })} placeholder="kg" style={{ flex: "1 1 60px" }} />
      <Input type="number" value={ex.reps} onChange={e => onChange({ ...ex, reps: e.target.value })} placeholder="reps" style={{ flex: "1 1 60px" }} />
      <IconBtn title="Remove exercise" danger onClick={onRemove}><Trash2 size={14} /></IconBtn>
    </div>
  );
}

function FitnessModule({ workouts, setWorkouts, weight, setWeight }) {
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState("workout");
  const [wType, setWType] = useState("Run");
  const [source, setSource] = useState("Manual");
  const [duration, setDuration] = useState("");
  const [calories, setCalories] = useState("");
  const [exercises, setExercises] = useState([]);
  const [wVal, setWVal] = useState("");
  const [waist, setWaist] = useState("");
  const [chest, setChest] = useState("");
  const [arms, setArms] = useState("");
  const [hips, setHips] = useState("");

  const weekMinutes = useMemo(() => {
    const week = daysAgoArr(7);
    return workouts.filter(w => week.includes(w.date)).reduce((s, w) => s + w.duration, 0);
  }, [workouts]);

  const latestWeight = useMemo(() => {
    const sorted = [...weight].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.length ? sorted[sorted.length - 1].value : null;
  }, [weight]);

  const addExerciseRow = () => setExercises([...exercises, { name: "", weight: "", reps: "" }]);
  const updateExerciseRow = (i, ex) => setExercises(exercises.map((e, idx) => idx === i ? ex : e));
  const removeExerciseRow = (i) => setExercises(exercises.filter((_, idx) => idx !== i));

  const addEntry = () => {
    if (addType === "workout") {
      const dur = parseFloat(duration) || 0;
      const cal = parseFloat(calories) || 0;
      if (!dur) return;
      const cleanExercises = exercises
        .filter(e => e.name.trim() && parseFloat(e.weight) > 0)
        .map(e => ({ name: e.name.trim(), sets: [{ weight: parseFloat(e.weight), reps: parseInt(e.reps, 10) || 0 }] }));
      setWorkouts([{ id: uid(), date: todayStr(), type: wType, duration: dur, calories: cal, source, exercises: cleanExercises }, ...workouts]);
      setDuration(""); setCalories(""); setExercises([]);
    } else {
      const v = parseFloat(wVal);
      if (!v) return;
      const entry = { id: uid(), date: todayStr(), value: v };
      if (waist) entry.waist = parseFloat(waist);
      if (chest) entry.chest = parseFloat(chest);
      if (arms) entry.arms = parseFloat(arms);
      if (hips) entry.hips = parseFloat(hips);
      setWeight([...weight, entry]);
      setWVal(""); setWaist(""); setChest(""); setArms(""); setHips("");
    }
    setShowAdd(false);
  };

  const removeWorkout = (id) => setWorkouts(workouts.filter(w => w.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow color={T.coral}>Physical Systems</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Fitness</h2>
        </div>
        <PrimaryBtn color={T.coral} onClick={() => setShowAdd(true)}><Plus size={16} /> Log entry</PrimaryBtn>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Panel style={{ padding: 16 }}>
          <Eyebrow>This week's training</Eyebrow>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 24, color: T.coral }}>{weekMinutes} min</div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <Eyebrow>Latest weight</Eyebrow>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 24, color: T.text }}>
            {latestWeight != null ? `${latestWeight} kg` : "0 kg"}
          </div>
        </Panel>
      </div>

      <WeeklyTrainingSummary workouts={workouts} />

      <div className="grid md:grid-cols-2 gap-4">
        <PersonalRecordsPanel workouts={workouts} />
        <WorkoutCalendar workouts={workouts} />
      </div>

      <WeightMeasurementTrend weight={weight} />

      <Panel style={{ padding: 0 }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Eyebrow>Workout log</Eyebrow>
        </div>
        {workouts.map(w => (
          <div key={w.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="flex items-center gap-3">
              <Dumbbell size={16} color={T.coral} />
              <div>
                <div className="flex items-center gap-2">
                  <span style={{ color: T.text, fontSize: 14 }}>{w.type}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: sourceColor(w.source || "Manual") + "22", color: sourceColor(w.source || "Manual") }}>{w.source || "Manual"}</span>
                </div>
                <div style={{ color: T.muted, fontSize: 12 }}>
                  {fmtDate(w.date)} · {w.duration} min · {w.calories} kcal
                  {(w.exercises || []).length > 0 && ` · ${w.exercises.length} exercise${w.exercises.length === 1 ? "" : "s"}`}
                </div>
              </div>
            </div>
            <IconBtn title="Delete workout" danger onClick={() => removeWorkout(w.id)}><Trash2 size={14} /></IconBtn>
          </div>
        ))}
        {workouts.length === 0 && <div className="text-center py-10" style={{ color: T.muted }}>No workouts logged yet.</div>}
      </Panel>

      {showAdd && (
        <Modal title="Log fitness entry" onClose={() => setShowAdd(false)}>
          <div className="space-y-3" style={{ maxHeight: "65vh", overflowY: "auto" }}>
            <div className="flex gap-2">
              {["workout", "weight"].map(tp => (
                <button key={tp} onClick={() => setAddType(tp)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold capitalize"
                  style={{ background: addType === tp ? T.coral : T.surface2, color: addType === tp ? "#12141A" : T.muted }}>
                  {tp === "weight" ? "Weight & measurements" : tp}
                </button>
              ))}
            </div>
            {addType === "workout" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Eyebrow>Type</Eyebrow>
                    <Select value={wType} onChange={e => setWType(e.target.value)}>
                      {["Run", "Strength", "Cycling", "Swim", "Yoga", "Sports", "Other"].map(c => <option key={c}>{c}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Eyebrow>Source</Eyebrow>
                    <Select value={source} onChange={e => setSource(e.target.value)}>
                      {WORKOUT_SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Eyebrow>Duration (min)</Eyebrow>
                    <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} />
                  </div>
                  <div>
                    <Eyebrow>Calories</Eyebrow>
                    <Input type="number" value={calories} onChange={e => setCalories(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Eyebrow icon={Trophy}>Exercises (optional — feeds Personal Records)</Eyebrow>
                  <div className="space-y-1.5 mb-2">
                    {exercises.map((ex, i) => (
                      <ExerciseSetRow key={i} ex={ex} onChange={(v) => updateExerciseRow(i, v)} onRemove={() => removeExerciseRow(i)} />
                    ))}
                  </div>
                  <button onClick={addExerciseRow} className="text-xs font-semibold flex items-center gap-1" style={{ color: T.gold }}>
                    <Plus size={13} /> Add exercise set
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Eyebrow>Weight (kg)</Eyebrow>
                  <Input type="number" step="0.1" value={wVal} onChange={e => setWVal(e.target.value)} />
                </div>
                <div>
                  <Eyebrow icon={Ruler}>Body measurements (cm, optional)</Eyebrow>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" step="0.1" value={waist} onChange={e => setWaist(e.target.value)} placeholder="Waist" />
                    <Input type="number" step="0.1" value={chest} onChange={e => setChest(e.target.value)} placeholder="Chest" />
                    <Input type="number" step="0.1" value={arms} onChange={e => setArms(e.target.value)} placeholder="Arms" />
                    <Input type="number" step="0.1" value={hips} onChange={e => setHips(e.target.value)} placeholder="Hips" />
                  </div>
                </div>
              </>
            )}
            <PrimaryBtn color={T.coral} onClick={addEntry} style={{ width: "100%", justifyContent: "center" }}>Save</PrimaryBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= TASKS module (Eisenhower matrix) ================= */

const QUADRANTS = [
  { id: "urgent-important", label: "Do first", sub: "Urgent & important", color: T.coral },
  { id: "not_urgent-important", label: "Schedule", sub: "Important, not urgent", color: T.sky },
  { id: "urgent-not_important", label: "Delegate", sub: "Urgent, not important", color: T.brass },
  { id: "not_urgent-not_important", label: "Eliminate", sub: "Neither urgent nor important", color: T.muted },
];

const PRIORITY_MAP = {
  "urgent-important": { label: "High", color: T.coral },
  "not_urgent-important": { label: "Medium", color: T.gold },
  "urgent-not_important": { label: "Medium", color: T.gold },
  "not_urgent-not_important": { label: "Low", color: T.muted },
};
const QUICK_PRIORITY_TO_QUADRANT = { High: "urgent-important", Medium: "not_urgent-important", Low: "not_urgent-not_important" };
const RECURRENCE_DAYS = { daily: 1, weekly: 7 };
const RECURRENCE_LABEL = { none: "One-time", daily: "Daily", weekly: "Weekly" };

// Dashboard widgets are stored as an ordered id list so they can be
// drag-reordered; new widgets shipped later get appended automatically
// for anyone with an existing saved order (see reconcileWidgetOrder).
const WIDGET_DEFS = [
  { id: "score", label: "Life Score" },
  { id: "focus", label: "Today's Focus" },
  { id: "schedule", label: "Schedule" },
  { id: "tasks", label: "Tasks" },
  { id: "habits", label: "Habits" },
  { id: "vitals", label: "Vitals" },
  { id: "finance", label: "Finance" },
  { id: "goals", label: "Goal Progress" },
  { id: "weeklyTrend", label: "Weekly Trend" },
  { id: "streakCalendar", label: "Streak Calendar" },
  { id: "calendarView", label: "Calendar View" },
  { id: "achievements", label: "Achievements" },
];
const DEFAULT_DASHBOARD_ORDER = WIDGET_DEFS.map(w => w.id);
function reconcileWidgetOrder(order) {
  const known = order.filter(id => WIDGET_DEFS.some(w => w.id === id));
  const missing = WIDGET_DEFS.map(w => w.id).filter(id => !known.includes(id));
  return [...known, ...missing];
}

function shiftDateStr(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---- Feature 6: Quick Add using natural language ----
// Heuristic parser: pulls a time ("6pm", "6:30 PM", "18:00"), a relative day
// ("today"/"tomorrow"/a weekday name), and returns whatever text is left.
function parseQuickAdd(raw) {
  let text = raw.trim();
  let dueDate = "";
  let reminderTime = "";

  const time12 = text.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm|AM|PM)\b/);
  const time24 = !time12 ? text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/) : null;
  if (time12) {
    let h = parseInt(time12[1], 10);
    const m = time12[2] ? parseInt(time12[2], 10) : 0;
    const isPM = /pm/i.test(time12[3]);
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    reminderTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    text = text.replace(time12[0], "").trim();
  } else if (time24) {
    reminderTime = `${time24[1].padStart(2, "0")}:${time24[2]}`;
    text = text.replace(time24[0], "").trim();
  }

  const lower = text.toLowerCase();
  if (/\btomorrow\b/.test(lower)) {
    dueDate = shiftDateStr(todayStr(), 1);
    text = text.replace(/\btomorrow\b/i, "").trim();
  } else if (/\btoday\b/.test(lower)) {
    dueDate = todayStr();
    text = text.replace(/\btoday\b/i, "").trim();
  } else {
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (let i = 0; i < 7; i++) {
      const re = new RegExp(`\\b${weekdays[i]}\\b`, "i");
      if (re.test(text)) {
        const d = new Date();
        const diff = (i - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        dueDate = d.toISOString().slice(0, 10);
        text = text.replace(re, "").trim();
        break;
      }
    }
  }

  text = text.replace(/\s{2,}/g, " ").replace(/^[,\-\s]+|[,\-\s]+$/g, "").trim();
  return { text: text || raw.trim(), dueDate, reminderTime };
}

// ---- Feature 8: Focus / Pomodoro ----
function PomodoroModal({ task, onClose }) {
  const FOCUS_LEN = 25 * 60;
  const BREAK_LEN = 5 * 60;
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_LEN);
  const [running, setRunning] = useState(true);
  const [mode, setMode] = useState("focus");

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          setMode(m => (m === "focus" ? "break" : "focus"));
          return mode === "focus" ? BREAK_LEN : FOCUS_LEN;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [running, mode]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const total = mode === "focus" ? FOCUS_LEN : BREAK_LEN;
  const pct = 1 - secondsLeft / total;
  const color = mode === "focus" ? T.coral : T.teal;

  const reset = () => { setMode("focus"); setSecondsLeft(FOCUS_LEN); setRunning(true); };

  return (
    <Modal title={mode === "focus" ? "Focus session" : "Break"} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-2">
        <div style={{ color: T.muted, fontSize: 13, textAlign: "center" }}>{task.text}</div>
        <div style={{ position: "relative", width: 160, height: 160 }}>
          <Ring pct={pct} color={color} size={160} stroke={12} label="" value="" />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 32, color: T.text }}>{mm}:{ss}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <PrimaryBtn color={color} onClick={() => setRunning(r => !r)}>
            {running ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Resume</>}
          </PrimaryBtn>
          <button onClick={reset} className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2" style={{ background: T.surface2, color: T.muted, border: `1px solid ${T.line}` }}>
            <RotateCcw size={15} /> Reset
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Feature 5: Task Detail Drawer (notes, subtasks, links, reminder, recurrence, tags) ----
function TaskDetailDrawer({ task, onClose, onUpdate, onDelete }) {
  const [notes, setNotes] = useState(task.notes || "");
  const [newSubtask, setNewSubtask] = useState("");
  const [newLink, setNewLink] = useState("");
  const [tagsInput, setTagsInput] = useState((task.tags || []).join(", "));

  const subtasks = task.subtasks || [];
  const links = task.links || [];
  const doneCount = subtasks.filter(s => s.done).length;

  const saveNotes = () => onUpdate(task.id, { notes });
  const saveTags = () => onUpdate(task.id, { tags: tagsInput.split(",").map(t => t.trim()).filter(Boolean) });

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    onUpdate(task.id, { subtasks: [...subtasks, { id: uid(), text: newSubtask.trim(), done: false }] });
    setNewSubtask("");
  };
  const toggleSubtask = (id) => onUpdate(task.id, { subtasks: subtasks.map(s => s.id === id ? { ...s, done: !s.done } : s) });
  const removeSubtask = (id) => onUpdate(task.id, { subtasks: subtasks.filter(s => s.id !== id) });

  const addLink = () => {
    if (!newLink.trim()) return;
    const url = /^https?:\/\//i.test(newLink.trim()) ? newLink.trim() : `https://${newLink.trim()}`;
    onUpdate(task.id, { links: [...links, { id: uid(), url }] });
    setNewLink("");
  };
  const removeLink = (id) => onUpdate(task.id, { links: links.filter(l => l.id !== id) });

  const pr = PRIORITY_MAP[task.quadrant] || PRIORITY_MAP["not_urgent-not_important"];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(6,8,11,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-sm overflow-y-auto" style={{ background: T.surface2, borderLeft: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: pr.color }} />
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 17, color: T.text }}>{task.text}</div>
          </div>
          <IconBtn title="Close" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Eyebrow>Due date</Eyebrow>
              <Input type="date" value={task.dueDate || ""} onChange={e => onUpdate(task.id, { dueDate: e.target.value })} />
            </div>
            <div>
              <Eyebrow>Reminder</Eyebrow>
              <Input type="time" value={task.reminderTime || ""} onChange={e => onUpdate(task.id, { reminderTime: e.target.value })} />
            </div>
          </div>

          <div>
            <Eyebrow>Quadrant / priority</Eyebrow>
            <Select value={task.quadrant} onChange={e => onUpdate(task.id, { quadrant: e.target.value })}>
              {QUADRANTS.map(q => <option key={q.id} value={q.id}>{q.label} — {q.sub}</option>)}
            </Select>
          </div>

          <div>
            <Eyebrow>Recurrence</Eyebrow>
            <Select value={task.recurrence || "none"} onChange={e => onUpdate(task.id, { recurrence: e.target.value })}>
              <option value="none">One-time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </Select>
          </div>

          <div>
            <Eyebrow icon={Tag}>Tags</Eyebrow>
            <div className="flex gap-2">
              <Input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="work, urgent, errand" onBlur={saveTags} onKeyDown={e => e.key === "Enter" && saveTags()} />
            </div>
            {(task.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {task.tags.map(t => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ background: T.surface, color: T.muted, border: `1px solid ${T.line}` }}>{t}</span>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Eyebrow icon={ListChecks}>Subtasks {subtasks.length > 0 && <span style={{ color: T.muted }}>({doneCount}/{subtasks.length})</span>}</Eyebrow>
            </div>
            <div className="space-y-1.5 mb-2">
              {subtasks.map(s => (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  <button onClick={() => toggleSubtask(s.id)}>
                    {s.done ? <CheckCircle2 size={16} color={T.teal} /> : <Circle size={16} color={T.line} />}
                  </button>
                  <span style={{ flex: 1, color: s.done ? T.muted : T.text, textDecoration: s.done ? "line-through" : "none" }}>{s.text}</span>
                  <IconBtn title="Remove subtask" danger onClick={() => removeSubtask(s.id)}><Trash2 size={13} /></IconBtn>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newSubtask} onChange={e => setNewSubtask(e.target.value)} placeholder="Add subtask…" onKeyDown={e => e.key === "Enter" && addSubtask()} />
              <button onClick={addSubtask} className="px-3 rounded-lg" style={{ background: T.surface, color: T.sky, border: `1px solid ${T.line}` }}><Plus size={16} /></button>
            </div>
          </div>

          <div>
            <Eyebrow icon={AlignLeft}>Notes</Eyebrow>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} rows={4}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text, fontFamily: "Inter, sans-serif" }}
              placeholder="Any context, links to docs, etc."
            />
          </div>

          <div>
            <Eyebrow icon={Paperclip}>Links</Eyebrow>
            <div className="space-y-1.5 mb-2">
              {links.map(l => (
                <div key={l.id} className="flex items-center gap-2 text-sm">
                  <Link2 size={13} color={T.sky} />
                  <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 truncate" style={{ color: T.sky }}>{l.url}</a>
                  <IconBtn title="Remove link" danger onClick={() => removeLink(l.id)}><Trash2 size={13} /></IconBtn>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newLink} onChange={e => setNewLink(e.target.value)} placeholder="Paste a link…" onKeyDown={e => e.key === "Enter" && addLink()} />
              <button onClick={addLink} className="px-3 rounded-lg" style={{ background: T.surface, color: T.sky, border: `1px solid ${T.line}` }}><Plus size={16} /></button>
            </div>
          </div>

          <button onClick={() => { onDelete(task.id); onClose(); }} className="flex items-center gap-2 text-sm font-medium" style={{ color: T.coral }}>
            <Trash2 size={15} /> Delete task
          </button>
        </div>
      </div>
    </div>
  );
}

function TasksModule({ tasks, setTasks }) {
  const [showAdd, setShowAdd] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [text, setText] = useState("");
  const [quadrant, setQuadrant] = useState("urgent-important");
  const [dueDate, setDueDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [tagsInput, setTagsInput] = useState("");

  const [dragId, setDragId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [focusTask, setFocusTask] = useState(null);

  // Feature 7: search, filter, sort
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortBy, setSortBy] = useState("none");

  const today = todayStr();

  const allTags = useMemo(() => {
    const set = new Set();
    tasks.forEach(t => (t.tags || []).forEach(tag => set.add(tag)));
    return [...set];
  }, [tasks]);

  const addTaskFull = () => {
    if (!text.trim()) return;
    setTasks([{
      id: uid(), text: text.trim(), quadrant, done: false, dueDate, reminderTime, recurrence,
      tags: tagsInput.split(",").map(t => t.trim()).filter(Boolean),
      subtasks: [], notes: "", links: [],
    }, ...tasks]);
    setText(""); setDueDate(""); setReminderTime(""); setRecurrence("none"); setTagsInput(""); setShowAdd(false);
  };

  // Feature 6: quick add with natural language parsing
  const addQuick = () => {
    if (!quickText.trim()) return;
    const parsed = parseQuickAdd(quickText);
    setTasks([{
      id: uid(), text: parsed.text, quadrant: "urgent-important", done: false,
      dueDate: parsed.dueDate, reminderTime: parsed.reminderTime, recurrence: "none",
      tags: [], subtasks: [], notes: "", links: [],
    }, ...tasks]);
    setQuickText("");
  };

  // Feature 4: recurring tasks — completing one spawns the next occurrence
  const toggle = (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const willBeDone = !task.done;
    let next = tasks.map(t => t.id === id ? { ...t, done: willBeDone } : t);
    if (willBeDone && task.recurrence && task.recurrence !== "none") {
      const addDays = RECURRENCE_DAYS[task.recurrence] || 1;
      const base = task.dueDate || today;
      next = [{ ...task, id: uid(), done: false, dueDate: shiftDateStr(base, addDays) }, ...next];
    }
    setTasks(next);
  };

  const remove = (id) => setTasks(tasks.filter(t => t.id !== id));
  const updateTask = (id, updates) => setTasks(tasks.map(t => t.id === id ? { ...t, ...updates } : t));

  // Feature 1: drag & drop between quadrants
  const onDropOnQuadrant = (quadrantId) => {
    if (!dragId) return;
    setTasks(tasks.map(t => t.id === dragId ? { ...t, quadrant: quadrantId } : t));
    setDragId(null);
  };

  const pendingCount = tasks.filter(t => !t.done).length;

  // Feature 7: apply search / filter / sort within each quadrant
  const visibleFor = (quadrantId) => {
    let list = tasks.filter(t => t.quadrant === quadrantId);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(t => t.text.toLowerCase().includes(q) || (t.tags || []).some(tag => tag.toLowerCase().includes(q)));
    }
    if (priorityFilter !== "all") {
      list = list.filter(t => (PRIORITY_MAP[t.quadrant]?.label || "Low") === priorityFilter);
    }
    if (tagFilter !== "all") {
      list = list.filter(t => (t.tags || []).includes(tagFilter));
    }
    if (sortBy === "dueDate") {
      list = [...list].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    } else if (sortBy === "priority") {
      const rank = { High: 0, Medium: 1, Low: 2 };
      list = [...list].sort((a, b) => rank[PRIORITY_MAP[a.quadrant]?.label] - rank[PRIORITY_MAP[b.quadrant]?.label]);
    } else if (sortBy === "tag") {
      list = [...list].sort((a, b) => (a.tags?.[0] || "").localeCompare(b.tags?.[0] || ""));
    }
    return list;
  };

  const detailTask = tasks.find(t => t.id === detailId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Eyebrow color={T.sky}>Today's Actions</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Tasks</h2>
        </div>
        <PrimaryBtn color={T.sky} onClick={() => setShowAdd(true)}><Plus size={16} /> New task</PrimaryBtn>
      </div>

      {/* Feature 6: quick add bar */}
      <div className="flex gap-2">
        <Input
          value={quickText} onChange={e => setQuickText(e.target.value)}
          placeholder='Quick add — try "Gym tomorrow 6 PM"'
          onKeyDown={e => e.key === "Enter" && addQuick()}
        />
        <button onClick={addQuick} className="px-4 rounded-lg text-sm font-semibold" style={{ background: T.surface2, color: T.sky, border: `1px solid ${T.line}` }}>
          Add
        </button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div style={{ color: T.muted, fontSize: 13 }}>{pendingCount} pending · {tasks.length - pendingCount} done</div>

        {/* Feature 7: search / filter / sort */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
            <Search size={13} color={T.muted} />
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search…" className="bg-transparent outline-none text-xs"
              style={{ color: T.text, width: 110 }}
            />
          </div>
          <Select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={{ width: 110 }}>
            <option value="all">All priority</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </Select>
          {allTags.length > 0 && (
            <Select value={tagFilter} onChange={e => setTagFilter(e.target.value)} style={{ width: 110 }}>
              <option value="all">All tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          )}
          <Select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 130 }}>
            <option value="none">Sort: default</option>
            <option value="priority">Sort: priority</option>
            <option value="dueDate">Sort: due date</option>
            <option value="tag">Sort: tag</option>
          </Select>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {QUADRANTS.map(q => {
          const items = visibleFor(q.id);
          return (
            <Panel
              key={q.id} style={{ padding: 16, minHeight: 160 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropOnQuadrant(q.id)}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div style={{ color: q.color, fontFamily: "Fraunces, serif", fontSize: 16 }}>{q.label}</div>
                  <div style={{ color: T.muted, fontSize: 11 }}>{q.sub}</div>
                </div>
                <div style={{ color: T.muted, fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>{items.length}</div>
              </div>
              <div className="space-y-1.5">
                {items.map(t => {
                  const subtasks = t.subtasks || [];
                  const doneSub = subtasks.filter(s => s.done).length;
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      className="flex items-center gap-2 group py-1"
                      style={{ opacity: dragId === t.id ? 0.4 : 1, cursor: "grab" }}
                    >
                      <GripVertical size={13} color={T.muted} />
                      <button aria-label={t.done ? `Mark ${t.text} as not done` : `Mark ${t.text} as done`} onClick={() => toggle(t.id)}>
                        {t.done ? <CheckCircle2 size={16} color={q.color} /> : <Circle size={16} color={T.line} />}
                      </button>
                      <button onClick={() => setDetailId(t.id)} className="flex-1 text-left">
                        <span className="text-sm" style={{ color: t.done ? T.muted : T.text, textDecoration: t.done ? "line-through" : "none" }}>
                          {t.text}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {t.dueDate && <span style={{ fontSize: 10.5, color: T.muted }}>{fmtDate(t.dueDate)}</span>}
                          {t.reminderTime && <span className="flex items-center gap-0.5" style={{ fontSize: 10.5, color: T.muted }}><Bell size={10} />{fmtTime12(t.reminderTime)}</span>}
                          {subtasks.length > 0 && <span style={{ fontSize: 10.5, color: T.muted }}>{doneSub}/{subtasks.length}</span>}
                          {t.recurrence && t.recurrence !== "none" && <Repeat size={11} color={T.muted} />}
                          {(t.tags || []).slice(0, 2).map(tag => (
                            <span key={tag} style={{ fontSize: 10, color: T.muted, background: T.surface2, padding: "1px 5px", borderRadius: 999 }}>{tag}</span>
                          ))}
                        </div>
                      </button>
                      {!t.done && (
                        <IconBtn title="Start focus session" onClick={() => setFocusTask(t)}><Timer size={14} color={T.coral} /></IconBtn>
                      )}
                      <IconBtn title="Delete task" danger onClick={() => remove(t.id)}><Trash2 size={13} /></IconBtn>
                    </div>
                  );
                })}
                {items.length === 0 && <div style={{ color: T.muted, fontSize: 12 }}>Nothing here.</div>}
              </div>
            </Panel>
          );
        })}
      </div>

      {showAdd && (
        <Modal title="New task" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div>
              <Eyebrow>What needs doing?</Eyebrow>
              <Input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Call the dentist" onKeyDown={e => e.key === "Enter" && addTaskFull()} />
            </div>
            <div>
              <Eyebrow>Priority quadrant</Eyebrow>
              <Select value={quadrant} onChange={e => setQuadrant(e.target.value)}>
                {QUADRANTS.map(q => <option key={q.id} value={q.id}>{q.label} — {q.sub}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Eyebrow>Due date</Eyebrow>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              <div>
                <Eyebrow>Reminder</Eyebrow>
                <Input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Eyebrow>Recurrence</Eyebrow>
              <Select value={recurrence} onChange={e => setRecurrence(e.target.value)}>
                <option value="none">One-time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </Select>
            </div>
            <div>
              <Eyebrow>Tags (comma separated)</Eyebrow>
              <Input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="work, errand" />
            </div>
            <PrimaryBtn color={T.sky} onClick={addTaskFull} style={{ width: "100%", justifyContent: "center" }}>Add task</PrimaryBtn>
          </div>
        </Modal>
      )}

      {detailTask && (
        <TaskDetailDrawer task={detailTask} onClose={() => setDetailId(null)} onUpdate={updateTask} onDelete={remove} />
      )}

      {focusTask && (
        <PomodoroModal task={focusTask} onClose={() => setFocusTask(null)} />
      )}
    </div>
  );
}

/* ================= JOURNAL module ================= */

const MOODS = ["😞", "😕", "😐", "🙂", "😄"];

function JournalModule({ journal, setJournal }) {
  const [showAdd, setShowAdd] = useState(false);
  const [mood, setMood] = useState(3);
  const [text, setText] = useState("");

  const todayEntry = journal.find(j => j.date === todayStr());

  // FIX: seed mood/text from the existing entry (if any) instead of always
  // resetting to defaults — previously this silently discarded the day's
  // entry whenever "Edit today" was opened and saved without retyping.
  const openModal = () => {
    if (todayEntry) {
      setMood(todayEntry.mood);
      setText(todayEntry.text);
    } else {
      setMood(3);
      setText("");
    }
    setShowAdd(true);
  };

  const addEntry = () => {
    if (!text.trim()) return;
    setJournal([{ id: uid(), date: todayStr(), mood, text: text.trim() }, ...journal.filter(j => j.date !== todayStr())]);
    setText(""); setMood(3); setShowAdd(false);
  };

  const remove = (id) => setJournal(journal.filter(j => j.id !== id));

  const avgMood = journal.length ? (journal.reduce((s, j) => s + j.mood, 0) / journal.length) : 2;
  const moodTrend = useMemo(() =>
    [...journal].sort((a, b) => a.date.localeCompare(b.date)).slice(-14).map(j => ({ date: fmtDate(j.date), mood: j.mood + 1 })),
    [journal]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow color={T.gold}>Inner Weather</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Journal</h2>
        </div>
        <PrimaryBtn color={T.gold} onClick={openModal}>
          {todayEntry ? <>Edit today</> : <><Plus size={16} /> New entry</>}
        </PrimaryBtn>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Panel style={{ padding: 16 }}>
          <Eyebrow>Average mood</Eyebrow>
          <div style={{ fontSize: 32 }}>{MOODS[Math.round(avgMood)]}</div>
        </Panel>
        <Panel style={{ padding: 16 }} className="md:col-span-2">
          <Eyebrow>Mood trend</Eyebrow>
          <div style={{ height: 100 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={moodTrend}>
                <XAxis dataKey="date" stroke={T.muted} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis domain={[1, 5]} hide />
                <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} />
                <Line type="monotone" dataKey="mood" stroke={T.gold} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="space-y-3">
        {journal.map(j => (
          <Panel key={j.id} style={{ padding: 16 }}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 22 }}>{MOODS[j.mood]}</span>
                <div>
                  <div style={{ color: T.text, fontSize: 14 }}>{fmtDate(j.date)}</div>
                </div>
              </div>
              <IconBtn title="Delete entry" danger onClick={() => remove(j.id)}><Trash2 size={14} /></IconBtn>
            </div>
            <p style={{ color: T.muted, fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>{j.text}</p>
          </Panel>
        ))}
        {journal.length === 0 && <div className="text-center py-10" style={{ color: T.muted }}>No entries yet — write your first one.</div>}
      </div>

      {showAdd && (
        <Modal title={todayEntry ? "Edit today's entry" : "New journal entry"} onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div>
              <Eyebrow>Mood</Eyebrow>
              <div className="flex gap-2">
                {MOODS.map((m, i) => (
                  <button key={i} aria-label={`Mood ${i + 1} of 5`} onClick={() => setMood(i)}
                    className="flex-1 py-2 rounded-lg text-xl"
                    style={{ background: mood === i ? T.gold + "33" : T.surface2, border: mood === i ? `1px solid ${T.gold}` : `1px solid ${T.line}` }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Eyebrow>What's on your mind?</Eyebrow>
              <textarea
                autoFocus value={text} onChange={e => setText(e.target.value)} rows={5}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text, fontFamily: "Inter, sans-serif" }}
                placeholder="How did today go?"
              />
            </div>
            <PrimaryBtn color={T.gold} onClick={addEntry} style={{ width: "100%", justifyContent: "center" }}>Save entry</PrimaryBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= INTEGRATIONS (Strava / Hevy) ================= */

function parseWorkoutCSV(csvText, source) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length < 2) return [];
  const splitRow = (row) => row.match(/(".*?"|[^,]+)(?=,|$)/g)?.map(c => c.replace(/^"|"$/g, "").trim()) || [];
  const header = splitRow(lines[0]).map(h => h.toLowerCase());

  const findCol = (keywords) => header.findIndex(h => keywords.some(k => h.includes(k)));
  const dateIdx = findCol(["date", "start_time", "create_time", "start time"]);
  const typeIdx = findCol(["type", "activity", "workout", "title", "name", "exercise"]);
  const durationIdx = findCol(["duration", "elapsed", "time"]);
  const calIdx = findCol(["calorie", "kcal", "energy"]);

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (!cols.length) continue;
    const rawDate = dateIdx >= 0 ? cols[dateIdx] : "";
    const parsedDate = rawDate ? new Date(rawDate) : null;
    const date = parsedDate && !isNaN(parsedDate) ? parsedDate.toISOString().slice(0, 10) : todayStr();
    const type = (typeIdx >= 0 ? cols[typeIdx] : source) || source;
    let durationRaw = durationIdx >= 0 ? parseFloat(cols[durationIdx]) : 0;
    let duration = durationRaw > 0 ? (durationRaw > 600 ? Math.round(durationRaw / 60) : Math.round(durationRaw)) : 0;
    const calories = calIdx >= 0 ? Math.round(parseFloat(cols[calIdx]) || 0) : 0;
    if (duration > 0) out.push({ id: uid(), date, type, duration, calories });
  }
  return out;
}

function IntegrationCard({ name, color, description, connected, onToggle, onFile, accept, importHint }) {
  return (
    <Panel style={{ padding: 18 }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold" style={{ background: color + "22", color }}>
            {name[0]}
          </div>
          <div>
            <div style={{ color: T.text, fontFamily: "Fraunces, serif", fontSize: 17 }}>{name}</div>
            <div style={{ color: T.muted, fontSize: 12 }}>{description}</div>
          </div>
        </div>
        <span
          className="text-xs font-semibold px-2 py-1 rounded-full"
          style={{ background: connected ? T.teal + "22" : T.surface2, color: connected ? T.teal : T.muted }}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <PrimaryBtn color={connected ? T.surface2 : color} style={connected ? { color: T.text, border: `1px solid ${T.line}` } : {}} onClick={onToggle}>
          {connected ? "Disconnect" : `Connect ${name}`}
        </PrimaryBtn>
        <label
          className="px-4 py-2 rounded-xl font-semibold text-sm inline-flex items-center gap-2 cursor-pointer"
          style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}`, fontFamily: "Inter, sans-serif" }}
        >
          <Upload size={16} /> Import CSV
          <input type="file" accept={accept} onChange={onFile} style={{ display: "none" }} />
        </label>
      </div>
      <p style={{ color: T.muted, fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>{importHint}</p>
    </Panel>
  );
}

function IntegrationsPanel({ integrations, setIntegrations, workouts, setWorkouts }) {
  const [status, setStatus] = useState({ strava: "", hevy: "", samsungHealth: "" });

  const toggleConnection = (key) => {
    setIntegrations({ ...integrations, [key]: { connected: !integrations[key]?.connected } });
  };

  const handleImport = (key, source) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = parseWorkoutCSV(reader.result, source);
      if (imported.length === 0) {
        setStatus(s => ({ ...s, [key]: "No workouts found in that file — check it's an activity export CSV." }));
        return;
      }
      setWorkouts([...imported, ...workouts]);
      setStatus(s => ({ ...s, [key]: `Imported ${imported.length} workout${imported.length === 1 ? "" : "s"} from ${source}.` }));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      <p style={{ color: T.muted, fontSize: 12.5, lineHeight: 1.6 }}>
        LifeOS runs entirely in your browser with no backend, so live account sync (OAuth) isn't available yet —
        "Connect" just marks the integration active here. What works today is CSV import: export your activity
        history from Strava or Hevy and drop the file in below to pull it straight into your Fitness log.
      </p>
      <IntegrationCard
        name="Strava" color={T.coral}
        description="Runs, rides, and other GPS activities"
        connected={!!integrations.strava?.connected}
        onToggle={() => toggleConnection("strava")}
        onFile={handleImport("strava", "Strava")}
        accept=".csv"
        importHint="In Strava: Settings → My Account → Download or Delete Your Account → Request Export. Import the activities.csv from the archive."
      />
      {status.strava && <div style={{ color: T.teal, fontSize: 12, paddingLeft: 4 }}>{status.strava}</div>}

      <IntegrationCard
        name="Hevy" color={T.sky}
        description="Strength training sets, reps, and workouts"
        connected={!!integrations.hevy?.connected}
        onToggle={() => toggleConnection("hevy")}
        onFile={handleImport("hevy", "Hevy")}
        accept=".csv"
        importHint="In Hevy: Profile → Settings → Export Data. Import the workout CSV to add your strength sessions here."
      />
      {status.hevy && <div style={{ color: T.teal, fontSize: 12, paddingLeft: 4 }}>{status.hevy}</div>}

      <IntegrationCard
        name="Samsung Health" color={T.violet}
        description="Steps, sleep, and exercise sessions from Galaxy Watch or phone"
        connected={!!integrations.samsungHealth?.connected}
        onToggle={() => toggleConnection("samsungHealth")}
        onFile={handleImport("samsungHealth", "Samsung Health")}
        accept=".csv"
        importHint="In the Samsung Health app: Profile icon → Settings → Download personal data. Unzip the archive and import the exercise CSV (e.g. com.samsung.health.exercise.*.csv) to add sessions here."
      />
      {status.samsungHealth && <div style={{ color: T.teal, fontSize: 12, paddingLeft: 4 }}>{status.samsungHealth}</div>}
    </div>
  );
}

function DangerZonePanel({ settingsPassword, setSettingsPassword, onClearAll }) {
  const [showClear, setShowClear] = useState(false);
  const [clearPw, setClearPw] = useState("");
  const [clearError, setClearError] = useState("");

  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changeError, setChangeError] = useState("");
  const [changeSuccess, setChangeSuccess] = useState(false);

  const submitClear = () => {
    if (clearPw !== settingsPassword) {
      setClearError("Incorrect password.");
      return;
    }
    onClearAll();
  };

  const submitChangePw = () => {
    setChangeError("");
    setChangeSuccess(false);
    if (currentPw !== settingsPassword) {
      setChangeError("Current password is incorrect.");
      return;
    }
    if (newPw.length < 4) {
      setChangeError("New password must be at least 4 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setChangeError("New passwords don't match.");
      return;
    }
    setSettingsPassword(newPw);
    setChangeSuccess(true);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
  };

  return (
    <Panel style={{ padding: 18, borderColor: T.coral + "44" }}>
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={16} color={T.coral} />
        <Eyebrow color={T.coral}>Danger zone</Eyebrow>
      </div>
      <p style={{ color: T.muted, fontSize: 13, marginBottom: 14 }}>
        Clearing your data permanently erases every habit, goal, transaction, workout, task, and journal entry stored in this browser. This can't be undone — export a backup first if you're not sure.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setShowClear(true); setClearPw(""); setClearError(""); }}
          className="px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2"
          style={{ background: T.coral + "18", color: T.coral, border: `1px solid ${T.coral}44` }}
        >
          <Trash2 size={16} /> Clear all data
        </button>
        <button
          onClick={() => { setShowChangePw(true); setChangeError(""); setChangeSuccess(false); }}
          className="px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2"
          style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}
        >
          <Lock size={16} /> Change password
        </button>
      </div>

      {showClear && (
        <Modal title="Clear all data" onClose={() => setShowClear(false)}>
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: T.coral + "14" }}>
              <AlertTriangle size={16} color={T.coral} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: T.text, fontSize: 13 }}>This permanently erases everything in LifeOS on this device. There's no undo.</span>
            </div>
            <div>
              <Eyebrow>Enter password to confirm</Eyebrow>
              <Input
                autoFocus
                type="password"
                value={clearPw}
                onChange={(e) => { setClearPw(e.target.value); setClearError(""); }}
                onKeyDown={(e) => e.key === "Enter" && submitClear()}
                placeholder="Password"
              />
              {clearError && <div style={{ color: T.coral, fontSize: 12.5, marginTop: 6 }}>{clearError}</div>}
            </div>
            <PrimaryBtn color={T.coral} onClick={submitClear} style={{ width: "100%", justifyContent: "center" }}>
              Permanently clear all data
            </PrimaryBtn>
          </div>
        </Modal>
      )}

      {showChangePw && (
        <Modal title="Change password" onClose={() => setShowChangePw(false)}>
          <div className="space-y-3">
            <div>
              <Eyebrow>Current password</Eyebrow>
              <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
            </div>
            <div>
              <Eyebrow>New password</Eyebrow>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </div>
            <div>
              <Eyebrow>Confirm new password</Eyebrow>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitChangePw()} />
            </div>
            {changeError && <div style={{ color: T.coral, fontSize: 12.5 }}>{changeError}</div>}
            {changeSuccess && <div style={{ color: T.teal, fontSize: 12.5 }}>Password updated.</div>}
            <PrimaryBtn onClick={submitChangePw} style={{ width: "100%", justifyContent: "center" }}>Update password</PrimaryBtn>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

/* ================= CALENDAR module (unified timeline) ================= */
/* Aggregates six existing data sources into one dated feed rather than
   introducing a parallel data model:
   - Tasks       → t.dueDate
   - Habits      → completions{date: true} (per-day, not a stored list)
   - Workouts    → w.date
   - Meals       → calorieLog entries' c.date
   - Bills       → expense transactions' t.date (finance is the closest
                   existing concept to "bills"; no separate bills tracker
                   exists yet, so this reads straight off transactions)
   - Events      → new calendarEvents collection (freeform: date, time, label) */

const CAL_CATEGORIES = [
  { id: "tasks", label: "Tasks", color: T.sky, icon: ListTodo },
  { id: "habits", label: "Habits", color: T.brass, icon: Flame },
  { id: "workouts", label: "Workouts", color: T.coral, icon: Dumbbell },
  { id: "meals", label: "Meals", color: T.gold, icon: Utensils },
  { id: "bills", label: "Bills", color: T.teal, icon: Wallet },
  { id: "events", label: "Events", color: T.violet, icon: Calendar },
];
const catMeta = (id) => CAL_CATEGORIES.find(c => c.id === id) || CAL_CATEGORIES[0];

function buildCalendarItems({ tasks, habits, workouts, calorieLog, tx, calendarEvents }) {
  const items = [];

  tasks.forEach(t => {
    if (!t.dueDate) return;
    items.push({ id: `task-${t.id}`, date: t.dueDate, time: t.reminderTime || null, category: "tasks", label: t.text, done: t.done, raw: t });
  });

  habits.forEach(h => {
    if (h.archived) return;
    Object.keys(h.completions || {}).forEach(date => {
      if (!h.completions[date]) return;
      items.push({ id: `habit-${h.id}-${date}`, date, time: h.reminderTime || null, category: "habits", label: `${h.icon} ${h.name}`, done: true, raw: h });
    });
  });

  workouts.forEach(w => {
    items.push({ id: `workout-${w.id}`, date: w.date, time: null, category: "workouts", label: `${w.type} · ${w.duration} min`, done: true, raw: w });
  });

  calorieLog.forEach(c => {
    items.push({ id: `meal-${c.id}`, date: c.date, time: c.time || null, category: "meals", label: `${c.name} · ${c.calories} kcal`, done: true, raw: c });
  });

  tx.forEach(t => {
    if (t.type !== "expense") return;
    items.push({ id: `bill-${t.id}`, date: t.date, time: null, category: "bills", label: `${t.note || t.category} · ${fmtMoney(t.amount)}`, done: true, raw: t });
  });

  calendarEvents.forEach(e => {
    items.push({ id: `event-${e.id}`, date: e.date, time: e.time || null, category: "events", label: e.label, done: false, raw: e });
  });

  return items;
}

function AddEventModal({ defaultDate, onClose, onAdd }) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [label, setLabel] = useState("");

  const submit = () => {
    if (!label.trim()) return;
    onAdd({ date, time, label: label.trim() });
    onClose();
  };

  return (
    <Modal title="Add event" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <Eyebrow>What's the event?</Eyebrow>
          <Input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Dentist appointment" onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Eyebrow>Date</Eyebrow>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <Eyebrow>Time (optional)</Eyebrow>
            <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>
        <PrimaryBtn color={T.violet} onClick={submit} style={{ width: "100%", justifyContent: "center" }}>Add event</PrimaryBtn>
      </div>
    </Modal>
  );
}

function CalendarItemRow({ item, onToggleTask, onRemoveEvent }) {
  const meta = catMeta(item.category);
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-2.5 text-sm">
      {item.category === "tasks" ? (
        <button onClick={() => onToggleTask(item.raw.id)}>
          {item.done ? <CheckCircle2 size={16} color={meta.color} /> : <Circle size={16} color={T.line} />}
        </button>
      ) : (
        <Icon size={14} color={meta.color} style={{ flexShrink: 0 }} />
      )}
      {item.time && <span style={{ fontFamily: "JetBrains Mono, monospace", color: T.muted, fontSize: 11, width: 46, flexShrink: 0 }}>{fmtTime12(item.time)}</span>}
      <span style={{ color: item.done && item.category === "tasks" ? T.muted : T.text, textDecoration: item.done && item.category === "tasks" ? "line-through" : "none", flex: 1 }}>
        {item.label}
      </span>
      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: meta.color + "18", color: meta.color, flexShrink: 0 }}>{meta.label}</span>
      {item.category === "events" && (
        <IconBtn title="Remove event" danger onClick={() => onRemoveEvent(item.raw.id)}><Trash2 size={13} /></IconBtn>
      )}
    </div>
  );
}

function UpcomingTimeline({ items, onToggleTask, onRemoveEvent }) {
  const end = shiftDate(todayStr(), 14);
  const upcoming = useMemo(() =>
    items
      .filter(i => i.date >= todayStr() && i.date <= end && !(i.category === "tasks" && i.done))
      .sort((a, b) => a.date === b.date ? (a.time || "99:99").localeCompare(b.time || "99:99") : a.date.localeCompare(b.date))
      .slice(0, 20),
    [items]
  );

  const grouped = useMemo(() => {
    const map = {};
    upcoming.forEach(i => { (map[i.date] = map[i.date] || []).push(i); });
    return Object.entries(map);
  }, [upcoming]);

  return (
    <Panel style={{ padding: 16 }}>
      <Eyebrow icon={Calendar} color={T.sky}>Upcoming (next 14 days)</Eyebrow>
      {grouped.length === 0 ? (
        <div style={{ color: T.muted, fontSize: 12.5, marginTop: 6 }}>Nothing coming up in the next two weeks.</div>
      ) : (
        <div className="space-y-3 mt-2">
          {grouped.map(([date, dayItems]) => (
            <div key={date}>
              <div style={{ color: T.muted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                {date === todayStr() ? "Today" : fmtDate(date)}
              </div>
              <div className="space-y-1.5">
                {dayItems.map(i => <CalendarItemRow key={i.id} item={i} onToggleTask={onToggleTask} onRemoveEvent={onRemoveEvent} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function CalendarModule({ tasks, setTasks, habits, workouts, calorieLog, tx, calendarEvents, setCalendarEvents }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(todayStr());
  const [activeCats, setActiveCats] = useState(CAL_CATEGORIES.map(c => c.id));
  const [showAddEvent, setShowAddEvent] = useState(false);

  const allItems = useMemo(
    () => buildCalendarItems({ tasks, habits, workouts, calorieLog, tx, calendarEvents }),
    [tasks, habits, workouts, calorieLog, tx, calendarEvents]
  );
  const visibleItems = useMemo(() => allItems.filter(i => activeCats.includes(i.category)), [allItems, activeCats]);

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const dateStr = (day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const itemsByDate = useMemo(() => {
    const map = {};
    visibleItems.forEach(i => { (map[i.date] = map[i.date] || []).push(i); });
    return map;
  }, [visibleItems]);

  const selectedItems = useMemo(() =>
    (itemsByDate[selectedDay] || []).slice().sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")),
    [itemsByDate, selectedDay]
  );

  const toggleCat = (id) => setActiveCats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleTaskDone = (taskId) => setTasks(tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t));
  const addEvent = (entry) => setCalendarEvents([...calendarEvents, { id: uid(), ...entry }]);
  const removeEvent = (id) => setCalendarEvents(calendarEvents.filter(e => e.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Eyebrow color={T.violet}>Unified Timeline</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Calendar</h2>
        </div>
        <PrimaryBtn color={T.violet} onClick={() => setShowAddEvent(true)}><Plus size={16} /> Add event</PrimaryBtn>
      </div>

      <div className="flex flex-wrap gap-2">
        {CAL_CATEGORIES.map(c => {
          const active = activeCats.includes(c.id);
          const Icon = c.icon;
          return (
            <button key={c.id} onClick={() => toggleCat(c.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: active ? c.color + "1f" : T.surface2, color: active ? c.color : T.muted, border: `1px solid ${active ? c.color : T.line}` }}>
              <Icon size={12} /> {c.label}
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel style={{ padding: 16 }} className="lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <IconBtn title="Previous month" onClick={() => setMonthOffset(m => m - 1)}><ChevronLeft size={18} /></IconBtn>
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold" style={{ color: T.text }}>{base.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
              {monthOffset !== 0 && (
                <button onClick={() => { setMonthOffset(0); setSelectedDay(todayStr()); }} className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: T.sky, background: T.sky + "1a" }}>
                  Today
                </button>
              )}
            </div>
            <IconBtn title="Next month" onClick={() => setMonthOffset(m => m + 1)}><ChevronRight size={18} /></IconBtn>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} style={{ color: T.muted, fontSize: 10 }}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const ds = dateStr(day);
              const isToday = ds === todayStr();
              const isSelected = ds === selectedDay;
              const cats = [...new Set((itemsByDate[ds] || []).map(it => it.category))];
              return (
                <button
                  key={i} onClick={() => setSelectedDay(ds)}
                  className="flex flex-col items-center justify-center rounded-lg"
                  style={{
                    aspectRatio: "1",
                    background: isSelected ? T.violet + "22" : isToday ? T.brass + "14" : T.surface2,
                    border: isSelected ? `1px solid ${T.violet}` : isToday ? `1px solid ${T.brass}` : "1px solid transparent",
                  }}
                >
                  <span style={{ fontSize: 11, color: isToday ? T.brass : T.text }}>{day}</span>
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center" style={{ maxWidth: 24 }}>
                    {cats.slice(0, 4).map(c => <span key={c} style={{ width: 4, height: 4, borderRadius: 999, background: catMeta(c).color }} />)}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel style={{ padding: 16 }}>
          <Eyebrow color={T.violet}>{selectedDay === todayStr() ? "Today" : fmtDate(selectedDay)}</Eyebrow>
          {selectedItems.length === 0 ? (
            <div style={{ color: T.muted, fontSize: 12.5, marginTop: 6 }}>Nothing on this day.</div>
          ) : (
            <div className="space-y-2 mt-2">
              {selectedItems.map(i => <CalendarItemRow key={i.id} item={i} onToggleTask={toggleTaskDone} onRemoveEvent={removeEvent} />)}
            </div>
          )}
          <button onClick={() => setShowAddEvent(true)} className="mt-3 text-xs font-semibold flex items-center gap-1" style={{ color: T.violet }}>
            <Plus size={13} /> Add event on this day
          </button>
        </Panel>
      </div>

      <UpcomingTimeline items={visibleItems} onToggleTask={toggleTaskDone} onRemoveEvent={removeEvent} />

      {showAddEvent && (
        <AddEventModal defaultDate={selectedDay} onClose={() => setShowAddEvent(false)} onAdd={addEvent} />
      )}
    </div>
  );
}

/* ================= LEARNING module ================= */

const LEARNING_TYPES = [
  { id: "Course", label: "Course", icon: PlayCircle, color: T.sky },
  { id: "Book", label: "Book", icon: BookOpen, color: T.gold },
  { id: "Certification", label: "Certification", icon: GraduationCap, color: T.violet },
];
const learningTypeMeta = (id) => LEARNING_TYPES.find(t => t.id === id) || LEARNING_TYPES[0];

const LEARNING_STATUS = [
  { id: "not_started", label: "Not started", color: T.muted },
  { id: "in_progress", label: "In progress", color: T.sky },
  { id: "completed", label: "Completed", color: T.teal },
];
const learningStatusMeta = (id) => LEARNING_STATUS.find(s => s.id === id) || LEARNING_STATUS[0];

function computeStudyStreak(items) {
  const dates = new Set();
  items.forEach(it => (it.sessions || []).forEach(s => dates.add(s.date)));
  let streak = 0, d = new Date();
  while (true) {
    const ds = d.toISOString().slice(0, 10);
    if (dates.has(ds)) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  return streak;
}

function weeklyStudyMinutes(items) {
  const week = daysAgoArr(7);
  return week.map(d => {
    let minutes = 0;
    items.forEach(it => (it.sessions || []).forEach(s => { if (s.date === d) minutes += s.minutes; }));
    return { date: fmtDate(d), minutes };
  });
}

function hoursLoggedFor(item) {
  return Math.round(((item.sessions || []).reduce((s, x) => s + x.minutes, 0) / 60) * 10) / 10;
}

function LearningStatsRow({ items }) {
  const completed = items.filter(i => i.status === "completed").length;
  const week = daysAgoArr(7);
  const weekMinutes = items.reduce((sum, it) => sum + (it.sessions || []).filter(s => week.includes(s.date)).reduce((s, x) => s + x.minutes, 0), 0);
  const streak = computeStudyStreak(items);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Panel style={{ padding: 16 }}>
        <Eyebrow>Total items</Eyebrow>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.text }}>{items.length}</div>
      </Panel>
      <Panel style={{ padding: 16 }}>
        <Eyebrow color={T.teal}>Completed</Eyebrow>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.teal }}>{completed}</div>
      </Panel>
      <Panel style={{ padding: 16 }}>
        <Eyebrow color={T.sky}>This week</Eyebrow>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.sky }}>{Math.round(weekMinutes / 60 * 10) / 10}h</div>
      </Panel>
      <Panel style={{ padding: 16 }}>
        <Eyebrow color={T.brass}>Study streak</Eyebrow>
        <div className="flex items-center gap-1.5" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.brass }}>
          <Flame size={18} /> {streak}
        </div>
      </Panel>
    </div>
  );
}

function WeeklyStudyChart({ items }) {
  const data = useMemo(() => weeklyStudyMinutes(items), [items]);
  return (
    <Panel style={{ padding: 16 }}>
      <Eyebrow color={T.violet}>Weekly Study Time</Eyebrow>
      <div style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke={T.line} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" stroke={T.muted} fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke={T.muted} fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v) => [`${v} min`, "Studied"]} />
            <Bar dataKey="minutes" radius={[4, 4, 0, 0]} fill={T.violet} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function LogSessionModal({ item, onClose, onLog }) {
  const [date, setDate] = useState(todayStr());
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");

  const submit = () => {
    const m = parseInt(minutes, 10);
    if (!m) return;
    onLog({ id: uid(), date, minutes: m, note: note.trim() });
    onClose();
  };

  return (
    <Modal title={`Log study session — ${item.title}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Eyebrow>Date</Eyebrow>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <Eyebrow>Minutes</Eyebrow>
            <Input type="number" autoFocus value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="e.g. 45" onKeyDown={e => e.key === "Enter" && submit()} />
          </div>
        </div>
        <div>
          <Eyebrow>Note (optional)</Eyebrow>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="What did you cover?" />
        </div>
        <PrimaryBtn color={learningTypeMeta(item.type).color} onClick={submit} style={{ width: "100%", justifyContent: "center" }}>Log session</PrimaryBtn>
      </div>
    </Modal>
  );
}

function LearningItemCard({ item, onUpdate, onDelete, onLogSession }) {
  const [showLog, setShowLog] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const typeMeta = learningTypeMeta(item.type);
  const statusMeta = learningStatusMeta(item.status);
  const TypeIcon = typeMeta.icon;
  const grad = GRAD[typeMeta.color] || [typeMeta.color, typeMeta.color];

  const hours = hoursLoggedFor(item);
  const autoProgress = item.totalHours > 0 ? Math.min(100, Math.round((hours / item.totalHours) * 100)) : null;
  const progress = autoProgress != null ? autoProgress : item.progress;

  const expiry = item.type === "Certification" && item.expiryDate ? goalCountdown(item.expiryDate) : null;
  const target = item.targetDate ? goalCountdown(item.targetDate) : null;
  const sessions = (item.sessions || []).slice().sort((a, b) => b.date.localeCompare(a.date));

  const setStatus = (status) => {
    const updates = { status };
    if (status === "completed" && !item.completedAt) updates.completedAt = todayStr();
    if (status === "in_progress" && !item.startedAt) updates.startedAt = todayStr();
    onUpdate(updates);
  };

  return (
    <Panel style={{ padding: 18 }}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: typeMeta.color + "1f" }}>
            <TypeIcon size={17} color={typeMeta.color} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: typeMeta.color }}>{item.type}</span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: statusMeta.color + "22", color: statusMeta.color }}>{statusMeta.label}</span>
            </div>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 17, color: T.text }}>{item.title}</div>
            {item.provider && <div style={{ color: T.muted, fontSize: 12 }}>{item.provider}</div>}
          </div>
        </div>
        <IconBtn title="Delete" danger onClick={onDelete}><Trash2 size={15} /></IconBtn>
      </div>

      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {target && item.status !== "completed" && (
          <span className="flex items-center gap-1 text-xs" style={{ color: target.color }}><Hourglass size={11} /> {target.text}</span>
        )}
        {expiry && (
          <span className="flex items-center gap-1 text-xs" style={{ color: expiry.color }}><AlertTriangle size={11} /> Expires: {expiry.text}</span>
        )}
        {item.totalHours > 0 && (
          <span className="text-xs" style={{ color: T.muted }}>{hours}h / {item.totalHours}h logged</span>
        )}
      </div>

      <div className="mt-3">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
          <div style={{ width: `${progress}%`, height: "100%", background: `linear-gradient(90deg, ${grad[0]}, ${grad[1]})`, transition: "width .4s" }} />
        </div>
        <div className="flex items-center justify-between mt-1">
          <div className="text-xs font-mono" style={{ color: T.muted }}>{progress}%</div>
          {autoProgress == null && (
            <input type="range" min="0" max="100" value={item.progress} onChange={e => onUpdate({ progress: +e.target.value })} style={{ width: 120 }} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {LEARNING_STATUS.map(s => (
          <button key={s.id} onClick={() => setStatus(s.id)}
            className="text-xs px-2 py-1 rounded-full font-semibold"
            style={{ background: item.status === s.id ? s.color + "22" : T.surface2, color: item.status === s.id ? s.color : T.muted, border: `1px solid ${item.status === s.id ? s.color : T.line}` }}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <PrimaryBtn color={typeMeta.color} onClick={() => setShowLog(true)} style={{ padding: "8px 14px", fontSize: 13 }}>
          <Plus size={14} /> Log session
        </PrimaryBtn>
        {sessions.length > 0 && (
          <button onClick={() => setShowSessions(s => !s)} className="text-xs font-semibold" style={{ color: T.muted }}>
            {showSessions ? "Hide" : "Show"} history ({sessions.length})
          </button>
        )}
      </div>

      {showSessions && (
        <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${T.line}` }}>
          {sessions.slice(0, 8).map(s => (
            <div key={s.id} className="flex items-center justify-between text-xs">
              <span style={{ color: T.muted }}>{fmtDate(s.date)}</span>
              <span style={{ color: T.text, flex: 1, marginLeft: 10 }}>{s.note || "—"}</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", color: typeMeta.color }}>{s.minutes}m</span>
            </div>
          ))}
        </div>
      )}

      {showLog && (
        <LogSessionModal item={item} onClose={() => setShowLog(false)} onLog={(session) => onUpdate({ sessions: [...(item.sessions || []), session] })} />
      )}
    </Panel>
  );
}

function LearningModule({ items, setItems }) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Course");
  const [provider, setProvider] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [totalHours, setTotalHours] = useState("");

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const addItem = () => {
    if (!title.trim()) return;
    setItems([{
      id: uid(), title: title.trim(), type, provider: provider.trim(), status: "not_started",
      progress: 0, targetDate, expiryDate: type === "Certification" ? expiryDate : "",
      totalHours: parseFloat(totalHours) || 0, notes: "", links: [],
      sessions: [], createdAt: todayStr(), startedAt: null, completedAt: null,
    }, ...items]);
    setTitle(""); setProvider(""); setTargetDate(""); setExpiryDate(""); setTotalHours(""); setShowAdd(false);
  };

  const updateItem = (id, updates) => setItems(items.map(i => i.id === id ? { ...i, ...updates } : i));
  const removeItem = (id) => setItems(items.filter(i => i.id !== id));

  const visible = items.filter(i => {
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Eyebrow color={T.violet}>Knowledge & Skills</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Learning</h2>
        </div>
        <PrimaryBtn color={T.violet} onClick={() => setShowAdd(true)}><Plus size={16} /> New item</PrimaryBtn>
      </div>

      <LearningStatsRow items={items} />
      <WeeklyStudyChart items={items} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {[{ id: "all", label: "All types" }, ...LEARNING_TYPES].map(t => {
            const active = typeFilter === t.id;
            const color = t.color || T.violet;
            return (
              <button key={t.id} onClick={() => setTypeFilter(t.id)}
                className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ background: active ? color + "22" : T.surface2, color: active ? color : T.muted, border: `1px solid ${active ? color : T.line}` }}>
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1.5">
          {[{ id: "all", label: "All status" }, ...LEARNING_STATUS].map(s => {
            const active = statusFilter === s.id;
            const color = s.color || T.muted;
            return (
              <button key={s.id} onClick={() => setStatusFilter(s.id)}
                className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ background: active ? color + "22" : T.surface2, color: active ? color : T.muted, border: `1px solid ${active ? color : T.line}` }}>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {visible.map(item => (
          <LearningItemCard
            key={item.id} item={item}
            onUpdate={(updates) => updateItem(item.id, updates)}
            onDelete={() => removeItem(item.id)}
          />
        ))}
        {visible.length === 0 && (
          <div className="col-span-2 text-center py-10" style={{ color: T.muted }}>
            {items.length === 0 ? "Nothing here yet — add a course, book, or certification to start tracking." : "Nothing matches these filters."}
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="New learning item" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div>
              <Eyebrow>Type</Eyebrow>
              <div className="grid grid-cols-3 gap-1.5">
                {LEARNING_TYPES.map(t => {
                  const Icon = t.icon;
                  const active = type === t.id;
                  return (
                    <button key={t.id} onClick={() => setType(t.id)}
                      className="flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium"
                      style={{ background: active ? t.color + "22" : T.surface2, border: active ? `1px solid ${t.color}` : `1px solid ${T.line}`, color: active ? t.color : T.muted }}>
                      <Icon size={16} /> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Eyebrow>Title</Eyebrow>
              <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Advanced React Patterns" onKeyDown={e => e.key === "Enter" && addItem()} />
            </div>
            <div>
              <Eyebrow>{type === "Book" ? "Author" : type === "Certification" ? "Issuing body" : "Provider"}</Eyebrow>
              <Input value={provider} onChange={e => setProvider(e.target.value)} placeholder={type === "Book" ? "e.g. Robert C. Martin" : "e.g. Coursera, AWS"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Eyebrow>Target date</Eyebrow>
                <Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
              </div>
              <div>
                <Eyebrow>Est. total hours</Eyebrow>
                <Input type="number" value={totalHours} onChange={e => setTotalHours(e.target.value)} placeholder="optional" />
              </div>
            </div>
            {type === "Certification" && (
              <div>
                <Eyebrow icon={AlertTriangle}>Expiry date (optional)</Eyebrow>
                <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
              </div>
            )}
            <PrimaryBtn color={T.violet} onClick={addItem} style={{ width: "100%", justifyContent: "center" }}>Add item</PrimaryBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SettingsModule({ allData, applyImport, integrations, setIntegrations, workouts, setWorkouts, resetAllAppData, settingsPassword, setSettingsPassword }) {
  const [importError, setImportError] = useState("");
  const [importedOk, setImportedOk] = useState(false);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lifeos-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportError(""); setImportedOk(false);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        applyImport(parsed);
        setImportedOk(true);
      } catch (err) {
        setImportError(err.message || "Could not read that file — make sure it's a LifeOS backup JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      <div>
        <Eyebrow color={T.muted}>System</Eyebrow>
        <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Settings</h2>
      </div>

      <div>
        <Eyebrow color={T.sky}>Integrations</Eyebrow>
        <IntegrationsPanel integrations={integrations} setIntegrations={setIntegrations} workouts={workouts} setWorkouts={setWorkouts} />
      </div>

      <DangerZonePanel settingsPassword={settingsPassword} setSettingsPassword={setSettingsPassword} onClearAll={resetAllAppData} />

      <div>
        <Eyebrow color={T.muted}>Backup</Eyebrow>
      </div>
      <Panel style={{ padding: 18 }}>
        <Eyebrow>Backup your data</Eyebrow>
        <p style={{ color: T.muted, fontSize: 13, marginBottom: 12 }}>
          Download everything — habits, goals, transactions, workouts, tasks, and journal entries — as a single JSON file.
        </p>
        <PrimaryBtn onClick={exportData}><Download size={16} /> Export backup</PrimaryBtn>
      </Panel>

      <Panel style={{ padding: 18 }}>
        <Eyebrow>Restore from backup</Eyebrow>
        <p style={{ color: T.muted, fontSize: 13, marginBottom: 12 }}>
          Importing replaces your current data with the contents of the backup file.
        </p>
        <label
          className="px-4 py-2 rounded-xl font-semibold text-sm inline-flex items-center gap-2 cursor-pointer"
          style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}`, fontFamily: "Inter, sans-serif" }}
        >
          <Upload size={16} /> Choose file
          <input type="file" accept="application/json" onChange={handleFile} style={{ display: "none" }} />
        </label>
        {importedOk && <div style={{ color: T.teal, fontSize: 13, marginTop: 10 }}>Backup restored successfully.</div>}
        {importError && <div style={{ color: T.coral, fontSize: 13, marginTop: 10 }}>{importError}</div>}
      </Panel>
    </div>
  );
}

/* ================= DASHBOARD (daily briefing) ================= */

function Divider() {
  return <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.line}, transparent)`, margin: "18px 0" }} />;
}

function SectionLabel({ children, color = T.muted, icon: Icon }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      {Icon && <Icon size={13} color={color} />}
      <div className="text-xs uppercase tracking-widest font-semibold" style={{ color, letterSpacing: "0.12em" }}>{children}</div>
    </div>
  );
}

function VitalStat({ icon: Icon, color, label, value, goal, suffix = "" }) {
  const pct = goal ? Math.min(1, value / goal) : 0;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={13} color={color} />
        <span className="text-xs" style={{ color: T.muted }}>{label}</span>
      </div>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 17, color: T.text }}>
        {value}{suffix}{goal ? <span style={{ color: T.muted, fontSize: 13 }}> /{goal}{suffix}</span> : null}
      </div>
      {goal ? (
        <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background: T.surface2 }}>
          <div style={{ width: `${pct * 100}%`, height: "100%", background: `linear-gradient(90deg, ${GRAD[color][0]}, ${GRAD[color][1]})` }} />
        </div>
      ) : null}
    </div>
  );
}

function FocusRow({ emoji, label, value, color, onCheck }) {
  if (onCheck) {
    return (
      <button onClick={onCheck} className="flex items-start gap-2.5 text-sm w-full text-left group">
        <Circle size={16} color={T.line} style={{ marginTop: 2, flexShrink: 0 }} className="group-hover:opacity-70" />
        <div className="flex-1">
          <span style={{ color, fontWeight: 600 }}>{label}: </span>
          <span style={{ color: T.text }}>{value}</span>
        </div>
      </button>
    );
  }
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span style={{ fontSize: 15, lineHeight: "20px" }}>{emoji}</span>
      <div className="flex-1">
        <span style={{ color, fontWeight: 600 }}>{label}: </span>
        <span style={{ color: T.text }}>{value}</span>
      </div>
    </div>
  );
}

// FIX: consumed calories/protein/fats are all derived from calorieLog
// entries (passed in as `consumed`/`proteinConsumed`/`fatsConsumed`) instead
// of separately-tracked vitals fields, so there's a single source of truth.
// Each logged meal now also carries protein/fat grams, and existing entries
// can be edited in place (not just deleted) via the pencil icon.
function MacroBar({ label, value, goal, color }) {
  const pct = goal ? Math.min(1, value / goal) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span style={{ color: T.muted }}>{label}</span>
        <span style={{ color: T.text, fontFamily: "JetBrains Mono, monospace" }}>{value}g / {goal}g</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: `linear-gradient(90deg, ${GRAD[color][0]}, ${GRAD[color][1]})` }} />
      </div>
    </div>
  );
}

function FuelGauge({ goal, consumed, proteinGoal, proteinConsumed, fatsGoal, fatsConsumed, entries, onAdd, onUpdate, onRemove }) {
  const [name, setName] = useState("");
  const [cals, setCals] = useState("");
  const [protein, setProtein] = useState("");
  const [fats, setFats] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: "", calories: "", protein: "", fats: "" });

  const pct = goal ? Math.min(1, consumed / goal) : 0;
  const remaining = goal - consumed;

  const submit = () => {
    const n = parseInt(cals, 10);
    if (!n) return;
    onAdd({
      id: uid(),
      name: name.trim() || "Meal",
      calories: n,
      protein: parseFloat(protein) || 0,
      fats: parseFloat(fats) || 0,
    });
    setName(""); setCals(""); setProtein(""); setFats("");
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditDraft({
      name: entry.name,
      calories: String(entry.calories),
      protein: String(entry.protein || 0),
      fats: String(entry.fats || 0),
    });
  };

  const saveEdit = () => {
    const n = parseInt(editDraft.calories, 10);
    if (!n) return;
    onUpdate(editingId, {
      name: editDraft.name.trim() || "Meal",
      calories: n,
      protein: parseFloat(editDraft.protein) || 0,
      fats: parseFloat(editDraft.fats) || 0,
    });
    setEditingId(null);
  };

  return (
    <Panel style={{ padding: 20 }}>
      <Eyebrow color={T.gold}>Fuel Gauge</Eyebrow>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mt-1">
        <Ring pct={pct} color={T.gold} size={92} stroke={9} label="kcal" value={consumed} />
        <div className="flex-1 w-full">
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.text }}>
            {consumed}<span style={{ color: T.muted, fontSize: 14 }}> / {goal} kcal</span>
          </div>
          <div style={{ color: remaining >= 0 ? T.muted : T.coral, fontSize: 13, marginTop: 2 }}>
            {remaining >= 0 ? `${remaining} kcal remaining today` : `${Math.abs(remaining)} kcal over today`}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <MacroBar label="Protein" value={proteinConsumed} goal={proteinGoal} color={T.coral} />
            <MacroBar label="Fats" value={fatsConsumed} goal={fatsGoal} color={T.sky} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Input placeholder="Meal (optional)" value={name} onChange={e => setName(e.target.value)} style={{ flex: "2 1 140px" }} onKeyDown={e => e.key === "Enter" && submit()} />
        <Input type="number" placeholder="kcal" value={cals} onChange={e => setCals(e.target.value)} style={{ flex: "1 1 70px" }} onKeyDown={e => e.key === "Enter" && submit()} />
        <Input type="number" placeholder="protein g" value={protein} onChange={e => setProtein(e.target.value)} style={{ flex: "1 1 80px" }} onKeyDown={e => e.key === "Enter" && submit()} />
        <Input type="number" placeholder="fat g" value={fats} onChange={e => setFats(e.target.value)} style={{ flex: "1 1 70px" }} onKeyDown={e => e.key === "Enter" && submit()} />
        <button aria-label="Add meal" onClick={submit} className="px-3 rounded-lg" style={{ background: T.surface2, color: T.gold, border: `1px solid ${T.line}` }}>
          <Plus size={16} />
        </button>
      </div>

      {entries.length > 0 ? (
        <div className="mt-3.5 space-y-2">
          {entries.map(e => (
            editingId === e.id ? (
              <div key={e.id} className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg" style={{ background: T.surface2 }}>
                <Input value={editDraft.name} onChange={ev => setEditDraft({ ...editDraft, name: ev.target.value })} style={{ flex: "2 1 120px" }} />
                <Input type="number" value={editDraft.calories} onChange={ev => setEditDraft({ ...editDraft, calories: ev.target.value })} style={{ flex: "1 1 60px" }} placeholder="kcal" />
                <Input type="number" value={editDraft.protein} onChange={ev => setEditDraft({ ...editDraft, protein: ev.target.value })} style={{ flex: "1 1 70px" }} placeholder="protein g" />
                <Input type="number" value={editDraft.fats} onChange={ev => setEditDraft({ ...editDraft, fats: ev.target.value })} style={{ flex: "1 1 60px" }} placeholder="fat g" />
                <IconBtn title="Save changes" onClick={saveEdit}><Check size={15} color={T.teal} /></IconBtn>
                <IconBtn title="Cancel edit" danger onClick={() => setEditingId(null)}><X size={15} /></IconBtn>
              </div>
            ) : (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span style={{ color: T.text }}>{e.name}</span>
                <div className="flex items-center gap-1.5">
                  <span style={{ fontFamily: "JetBrains Mono, monospace", color: T.muted, fontSize: 12 }}>
                    {e.calories} kcal · {e.protein || 0}g P · {e.fats || 0}g F
                  </span>
                  <IconBtn title="Edit meal" onClick={() => startEdit(e)}><Edit3 size={13} /></IconBtn>
                  <IconBtn title="Remove meal" danger onClick={() => onRemove(e.id)}><Trash2 size={13} /></IconBtn>
                </div>
              </div>
            )
          ))}
        </div>
      ) : (
        <div style={{ color: T.muted, fontSize: 12.5, marginTop: 12 }}>Nothing logged yet today.</div>
      )}
    </Panel>
  );
}

function DashboardEditModal({ profile, setProfile, schedule, setSchedule, vitals, setVitals, onClose }) {
  const [name, setName] = useState(profile.name);
  const [v, setV] = useState(vitals);
  const [newTime, setNewTime] = useState("09:00");
  const [newLabel, setNewLabel] = useState("");
  const [sched, setSched] = useState(schedule);

  const addSchedItem = () => {
    if (!newLabel.trim()) return;
    setSched([...sched, { id: uid(), time: newTime, label: newLabel.trim() }].sort((a, b) => a.time.localeCompare(b.time)));
    setNewLabel("");
  };
  const removeSchedItem = (id) => setSched(sched.filter(s => s.id !== id));

  const save = () => {
    setProfile({ ...profile, name });
    setVitals(v);
    setSchedule(sched);
    onClose();
  };

  return (
    <Modal title="Edit today's briefing" onClose={onClose}>
      <div className="space-y-4" style={{ maxHeight: "65vh", overflowY: "auto" }}>
        <div>
          <Eyebrow>Your name</Eyebrow>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Athul" />
        </div>

        <div>
          <Eyebrow>Schedule</Eyebrow>
          <div className="space-y-1.5 mb-2">
            {sched.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span style={{ color: T.muted, width: 68 }}>{fmtTime12(s.time)}</span>
                <span style={{ color: T.text, flex: 1 }}>{s.label}</span>
                <IconBtn title="Remove event" danger onClick={() => removeSchedItem(s.id)}><Trash2 size={13} /></IconBtn>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ width: 110 }} />
            <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Event" onKeyDown={e => e.key === "Enter" && addSchedItem()} />
            <button aria-label="Add schedule item" onClick={addSchedItem} className="px-3 rounded-lg" style={{ background: T.surface2, color: T.sky, border: `1px solid ${T.line}` }}><Plus size={16} /></button>
          </div>
        </div>

        <div>
          <Eyebrow>Nutrition & activity</Eyebrow>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Calorie goal</div><Input type="number" value={v.caloriesGoal} onChange={e => setV({ ...v, caloriesGoal: +e.target.value })} /></div>
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Protein goal (g)</div><Input type="number" value={v.proteinGoal} onChange={e => setV({ ...v, proteinGoal: +e.target.value })} /></div>
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Fat goal (g)</div><Input type="number" value={v.fatsGoal} onChange={e => setV({ ...v, fatsGoal: +e.target.value })} /></div>
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Carb goal (g)</div><Input type="number" value={v.carbsGoal ?? 250} onChange={e => setV({ ...v, carbsGoal: +e.target.value })} /></div>
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Water goal (ml)</div><Input type="number" value={v.waterGoal ?? 2500} onChange={e => setV({ ...v, waterGoal: +e.target.value })} /></div>
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Steps</div><Input type="number" value={v.steps} onChange={e => setV({ ...v, steps: +e.target.value })} /></div>
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Steps goal</div><Input type="number" value={v.stepsGoal} onChange={e => setV({ ...v, stepsGoal: +e.target.value })} /></div>
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Sleep (hrs)</div><Input type="number" step="0.25" value={v.sleepHours} onChange={e => setV({ ...v, sleepHours: +e.target.value })} /></div>
            <div><div className="text-xs mb-1" style={{ color: T.muted }}>Sleep goal (hrs)</div><Input type="number" step="0.25" value={v.sleepGoal} onChange={e => setV({ ...v, sleepGoal: +e.target.value })} /></div>
          </div>
        </div>

        <div>
          <Eyebrow>Daily budget</Eyebrow>
          <Input type="number" value={v.dailyBudget} onChange={e => setV({ ...v, dailyBudget: +e.target.value })} />
        </div>

        <PrimaryBtn onClick={save} style={{ width: "100%", justifyContent: "center" }}>Save briefing</PrimaryBtn>
      </div>
    </Modal>
  );
}

/* ================= Dashboard widgets ================= */

function WidgetShell({ id, title, color, icon: Icon, draggable, onDragStart, onDragOver, onDrop, dimmed, children }) {
  return (
    <Panel
      style={{ padding: 16, opacity: dimmed ? 0.4 : 1 }}
      draggable={draggable}
      onDragStart={() => onDragStart(id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver && onDragOver(id); }}
      onDrop={() => onDrop(id)}
    >
      <div className="flex items-center gap-2 mb-3">
        {draggable && <GripVertical size={14} color={T.muted} style={{ cursor: "grab" }} />}
        {Icon && <Icon size={13} color={color || T.muted} />}
        <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: color || T.muted, letterSpacing: "0.12em" }}>{title}</div>
      </div>
      {children}
    </Panel>
  );
}

function QuickActionsBar({ setTab }) {
  const actions = [
    { label: "Habit", icon: Flame, color: T.brass, tab: "habits" },
    { label: "Task", icon: ListTodo, color: T.sky, tab: "tasks" },
    { label: "Spend", icon: Wallet, color: T.teal, tab: "finance" },
    { label: "Workout", icon: Dumbbell, color: T.coral, tab: "fitness" },
    { label: "Meal", icon: Utensils, color: T.gold, tab: "nutrition" },
    { label: "Journal", icon: BookOpen, color: T.gold, tab: "journal" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(a => {
        const Icon = a.icon;
        return (
          <button key={a.label} onClick={() => setTab(a.tab)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ background: a.color + "18", color: a.color, border: `1px solid ${T.line}` }}>
            <Icon size={14} /> {a.label}
          </button>
        );
      })}
    </div>
  );
}

const WEATHER_CODE_MAP = (code) => {
  if (code === 0) return { label: "Clear sky", icon: Sun, color: T.gold };
  if ([1, 2, 3].includes(code)) return { label: "Partly cloudy", icon: Cloud, color: T.muted };
  if ([45, 48].includes(code)) return { label: "Foggy", icon: Cloud, color: T.muted };
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return { label: "Rainy", icon: CloudRain, color: T.sky };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "Snowy", icon: CloudSnow, color: T.sky };
  return { label: "Mixed conditions", icon: Cloud, color: T.muted };
};

function WeatherWidget() {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ status: "error", data: null, error: "Location isn't available in this browser." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
          const json = await res.json();
          setState({ status: "ok", data: json, error: "" });
        } catch (e) {
          setState({ status: "error", data: null, error: "Couldn't reach the weather service." });
        }
      },
      () => setState({ status: "error", data: null, error: "Location permission denied — enable it to see local weather." })
    );
  }, []);

  if (state.status === "loading") {
    return <div style={{ color: T.muted, fontSize: 13 }}>Getting your local weather…</div>;
  }
  if (state.status === "error") {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: T.muted }}>
        <MapPin size={14} /> {state.error}
      </div>
    );
  }
  const { current, daily } = state.data;
  const info = WEATHER_CODE_MAP(current.weather_code);
  const Icon = info.icon;
  return (
    <div className="flex items-center gap-4">
      <Icon size={36} color={info.color} />
      <div>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 26, color: T.text }}>{Math.round(current.temperature_2m)}°</div>
        <div style={{ color: T.muted, fontSize: 12.5 }}>
          {info.label} · H:{Math.round(daily.temperature_2m_max[0])}° L:{Math.round(daily.temperature_2m_min[0])}°
        </div>
      </div>
    </div>
  );
}

function GlobalSearch({ habits, tasks, goals, tx, workouts, journal, calorieLog, setTab }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (q.trim().length < 2) return [];
    const s = q.toLowerCase();
    const out = [];
    habits.forEach(h => h.name.toLowerCase().includes(s) && out.push({ text: h.name, group: "Habit", tab: "habits", color: T.brass }));
    tasks.forEach(t => t.text.toLowerCase().includes(s) && out.push({ text: t.text, group: "Task", tab: "tasks", color: T.sky }));
    goals.forEach(g => g.title.toLowerCase().includes(s) && out.push({ text: g.title, group: "Goal", tab: "goals", color: T.violet }));
    tx.forEach(t => (t.note || t.category).toLowerCase().includes(s) && out.push({ text: t.note || t.category, group: "Finance", tab: "finance", color: T.teal }));
    workouts.forEach(w => w.type.toLowerCase().includes(s) && out.push({ text: `${w.type} · ${fmtDate(w.date)}`, group: "Fitness", tab: "fitness", color: T.coral }));
    journal.forEach(j => j.text.toLowerCase().includes(s) && out.push({ text: j.text.slice(0, 60), group: "Journal", tab: "journal", color: T.gold }));
    calorieLog.forEach(c => c.name.toLowerCase().includes(s) && out.push({ text: `${c.name} · ${fmtDate(c.date)}`, group: "Nutrition", tab: "nutrition", color: T.gold }));
    return out.slice(0, 8);
  }, [q, habits, tasks, goals, tx, workouts, journal, calorieLog]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
        <Search size={15} color={T.muted} />
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search habits, tasks, goals, spending, meals…"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: T.text, fontFamily: "Inter, sans-serif" }}
        />
      </div>
      {results.length > 0 && (
        <div className="absolute left-0 right-0 mt-1.5 rounded-xl overflow-hidden z-20" style={{ background: T.surface2, border: `1px solid ${T.line}`, boxShadow: "0 12px 32px -8px rgba(0,0,0,0.5)" }}>
          {results.map((r, i) => (
            <button key={i} onClick={() => { setTab(r.tab); setQ(""); }} className="w-full flex items-center justify-between px-3 py-2 text-left text-sm"
              style={{ borderBottom: i < results.length - 1 ? `1px solid ${T.line}` : "none" }}>
              <span style={{ color: T.text }}>{r.text}</span>
              <span className="text-xs" style={{ color: r.color }}>{r.group}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SmartRemindersWidget({ reminders, notifPermission, onEnableNotifs }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div />
        <button onClick={onEnableNotifs} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: notifPermission === "granted" ? T.teal : T.muted }}>
          {notifPermission === "granted" ? <BellRing size={13} /> : <BellOff size={13} />}
          {notifPermission === "granted" ? "Notifications on" : "Enable notifications"}
        </button>
      </div>
      {reminders.length === 0 ? (
        <div style={{ color: T.muted, fontSize: 13 }}>Nothing needs your attention right now.</div>
      ) : (
        <div className="space-y-2">
          {reminders.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span style={{ width: 7, height: 7, borderRadius: 999, background: r.color, boxShadow: glow(r.color, 0.5), flexShrink: 0 }} />
              <span style={{ color: T.text }}>{r.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeeklyTrendChart({ scoreLog }) {
  const data = daysAgoArr(7).map(d => ({ date: fmtDate(d), score: scoreLog[d] ?? null }));
  return (
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke={T.line} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" stroke={T.muted} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} stroke={T.muted} fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} />
          <Line type="monotone" dataKey="score" stroke={T.brass} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LifeScoreBreakdown({ habitScore, taskScore, vitalsScore, financeScore }) {
  const rows = [
    { label: "Habits", value: habitScore, weight: 30, color: T.brass },
    { label: "Tasks", value: taskScore, weight: 25, color: T.sky },
    { label: "Vitals", value: vitalsScore, weight: 25, color: T.coral },
    { label: "Finance", value: financeScore, weight: 20, color: T.teal },
  ];
  return (
    <div className="space-y-2.5">
      {rows.map(r => (
        <div key={r.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: T.muted }}>{r.label} <span style={{ opacity: 0.6 }}>({r.weight}% weight)</span></span>
            <span style={{ color: T.text, fontFamily: "JetBrains Mono, monospace" }}>{Math.round(r.value)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
            <div style={{ width: `${Math.max(0, Math.min(100, r.value))}%`, height: "100%", background: `linear-gradient(90deg, ${GRAD[r.color][0]}, ${GRAD[r.color][1]})` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StreakCalendar({ scoreLog }) {
  const days = daysAgoArr(35);
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const colorFor = (d) => {
    const s = scoreLog[d];
    if (s == null) return T.surface2;
    if (s >= 80) return T.teal;
    if (s >= 55) return T.gold;
    return T.coral;
  };
  return (
    <div>
      <div className="flex gap-1">
        {weeks.map((wk, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {wk.map(d => (
              <div key={d} title={`${d}: ${scoreLog[d] ?? "no data"}`}
                style={{ width: 13, height: 13, borderRadius: 3, background: colorFor(d), border: d === todayStr() ? `1px solid ${T.text}` : "none" }} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2.5 text-xs" style={{ color: T.muted }}>
        <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 2, background: T.teal }} /> Great</span>
        <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 2, background: T.gold }} /> Okay</span>
        <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 2, background: T.coral }} /> Rough</span>
      </div>
    </div>
  );
}

function CalendarView({ tasks, journal }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const dateStr = (day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const tasksOn = (day) => tasks.filter(t => t.dueDate === dateStr(day)).length;
  const journalOn = (day) => journal.some(j => j.date === dateStr(day));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <IconBtn title="Previous month" onClick={() => setMonthOffset(m => m - 1)}><ChevronLeft size={16} /></IconBtn>
        <div className="text-sm font-semibold" style={{ color: T.text }}>{base.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
        <IconBtn title="Next month" onClick={() => setMonthOffset(m => m + 1)}><ChevronRight size={16} /></IconBtn>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} style={{ color: T.muted, fontSize: 10 }}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const isToday = dateStr(day) === todayStr();
          const dueCount = tasksOn(day);
          const hasJournal = journalOn(day);
          return (
            <div key={i} title={`${dueCount} task(s) due${hasJournal ? " · journal entry" : ""}`}
              className="flex flex-col items-center justify-center rounded-lg"
              style={{ aspectRatio: "1", background: isToday ? T.brass + "22" : T.surface2, border: isToday ? `1px solid ${T.brass}` : `1px solid transparent` }}>
              <span style={{ fontSize: 11, color: isToday ? T.brass : T.text }}>{day}</span>
              <div className="flex gap-0.5 mt-0.5">
                {dueCount > 0 && <span style={{ width: 4, height: 4, borderRadius: 999, background: T.coral }} />}
                {hasJournal && <span style={{ width: 4, height: 4, borderRadius: 999, background: T.gold }} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AchievementsWidget({ habits, tasks, journal, waterLog, vitals, nutritionScoreToday }) {
  const bestStreak = habits.reduce((max, h) => {
    let s = 0, d = new Date();
    while (h.completions[d.toISOString().slice(0, 10)]) { s++; d.setDate(d.getDate() - 1); }
    return Math.max(max, s);
  }, 0);
  const doneTasks = tasks.filter(t => t.done).length;
  const hydratedToday = (waterLog[todayStr()] || 0) >= (vitals.waterGoal || 2500);

  const badges = [
    { label: "7-Day Streak", desc: "Keep any habit going 7 days straight", unlocked: bestStreak >= 7, icon: Flame, color: T.brass },
    { label: "Task Machine", desc: "Complete 10 tasks", unlocked: doneTasks >= 10, icon: CheckCircle2, color: T.sky },
    { label: "Hydration Hero", desc: "Hit your water goal today", unlocked: hydratedToday, icon: Droplet, color: T.sky },
    { label: "Journal Keeper", desc: "Write 7 journal entries", unlocked: journal.length >= 7, icon: BookOpen, color: T.gold },
    { label: "Nutrition Pro", desc: "Score 80+ on Nutrition today", unlocked: nutritionScoreToday >= 80, icon: Utensils, color: T.coral },
    { label: "Habit Master", desc: "Reach a 30-day streak", unlocked: bestStreak >= 30, icon: Award, color: T.violet },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {badges.map(b => {
        const Icon = b.unlocked ? b.icon : Lock;
        return (
          <div key={b.label} className="flex flex-col items-center text-center gap-1.5 p-3 rounded-xl" style={{ background: T.surface2, border: `1px solid ${T.line}`, opacity: b.unlocked ? 1 : 0.5 }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: b.unlocked ? b.color + "22" : T.line, boxShadow: b.unlocked ? glow(b.color, 0.4) : "none" }}>
              <Icon size={16} color={b.unlocked ? b.color : T.muted} />
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: b.unlocked ? T.text : T.muted }}>{b.label}</div>
            <div style={{ fontSize: 10, color: T.muted }}>{b.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ habits, setHabits, goals, tx, workouts, tasks, setTasks, journal, schedule, setSchedule, vitals, setVitals, profile, setProfile, scoreLog, setScoreLog, calorieLog, setCalorieLog, waterLog, setWaterLog, dashboardOrder, setDashboardOrder, setTab }) {
  const today = todayStr();
  const [showEdit, setShowEdit] = useState(false);
  const [showAddSteps, setShowAddSteps] = useState(false);
  const [stepsToAdd, setStepsToAdd] = useState("");
  const [dragWidget, setDragWidget] = useState(null);
  const [notifPermission, setNotifPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  // Quick-add task form (priority + recurrence) shown inside the Tasks widget.
  const [qtText, setQtText] = useState("");
  const [qtPriority, setQtPriority] = useState("Medium");
  const [qtRecurrence, setQtRecurrence] = useState("none");

  const addSteps = () => {
    const n = parseInt(stepsToAdd, 10);
    if (!n) return;
    setVitals({ ...vitals, steps: vitals.steps + n });
    setStepsToAdd(""); setShowAddSteps(false);
  };

  const todaysMeals = calorieLog.filter(c => c.date === today);
  const consumedToday = todaysMeals.reduce((sum, m) => sum + m.calories, 0);
  const proteinToday = Math.round(todaysMeals.reduce((sum, m) => sum + (m.protein || 0), 0));
  const fatsToday = Math.round(todaysMeals.reduce((sum, m) => sum + (m.fats || 0), 0));
  const carbsToday = Math.round(todaysMeals.reduce((sum, m) => sum + (m.carbs || 0), 0));

  const addMeal = (entry) => setCalorieLog([{ ...entry, date: today }, ...calorieLog]);
  const updateMeal = (id, updates) => setCalorieLog(calorieLog.map(c => c.id === id ? { ...c, ...updates } : c));
  const removeMeal = (id) => setCalorieLog(calorieLog.filter(c => c.id !== id));
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const activeHabits = habits.filter(h => !h.archived);
  const habitsDone = activeHabits.filter(h => h.completions[today]).length;
  const habitPct = activeHabits.length ? habitsDone / activeHabits.length : 1;

  const week = daysAgoArr(7);
  const habitStatus = (h) => {
    if (h.completions[today]) return "green";
    const warmThisWeek = week.some(d => h.completions[d]);
    return warmThisWeek ? "yellow" : "red";
  };
  const statusColor = { green: T.teal, yellow: T.gold, red: T.coral };

  const spentToday = tx.filter(t => t.type === "expense" && t.date === today).reduce((s, t) => s + t.amount, 0);
  const remaining = vitals.dailyBudget - spentToday;

  const pendingTasks = tasks.filter(t => !t.done);

  // Toggling a recurring task's completion spawns its next occurrence
  // instead of just disappearing — the original stays in history as done.
  const toggleTask = (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const willBeDone = !task.done;
    let next = tasks.map(t => t.id === id ? { ...t, done: willBeDone } : t);
    if (willBeDone && task.recurrence && task.recurrence !== "none") {
      const addDays = RECURRENCE_DAYS[task.recurrence] || 1;
      const base = task.dueDate || today;
      next = [{ ...task, id: uid(), done: false, dueDate: shiftDate(base, addDays) }, ...next];
    }
    setTasks(next);
  };

  const addQuickTask = () => {
    if (!qtText.trim()) return;
    setTasks([{
      id: uid(), text: qtText.trim(), quadrant: QUICK_PRIORITY_TO_QUADRANT[qtPriority],
      done: false, dueDate: today, recurrence: qtRecurrence,
    }, ...tasks]);
    setQtText(""); setQtPriority("Medium"); setQtRecurrence("none");
  };

  const vitalsChecks = [];
  if (vitals.caloriesGoal > 0) vitalsChecks.push(consumedToday <= vitals.caloriesGoal);
  if (vitals.proteinGoal > 0) vitalsChecks.push(proteinToday >= vitals.proteinGoal);
  if (vitals.fatsGoal > 0) vitalsChecks.push(fatsToday <= vitals.fatsGoal);
  if (vitals.stepsGoal > 0) vitalsChecks.push(vitals.steps >= vitals.stepsGoal);
  if (vitals.sleepGoal > 0) vitalsChecks.push(vitals.sleepHours >= vitals.sleepGoal);
  const vitalsScore = vitalsChecks.length ? (vitalsChecks.filter(Boolean).length / vitalsChecks.length) * 100 : 0;

  const taskScore = tasks.length ? (tasks.filter(t => t.done).length / tasks.length) * 100 : 0;
  const financeScore = vitals.dailyBudget > 0 ? Math.max(0, Math.min(100, (remaining / vitals.dailyBudget) * 100 + 50)) : 0;
  const habitScore = activeHabits.length
    ? (activeHabits.reduce((sum, h) => sum + (h.completions[today] ? (h.impactWeight || 3) : 0), 0) /
       activeHabits.reduce((sum, h) => sum + (h.impactWeight || 3), 0)) * 100
    : 0;
  const score = Math.round(habitScore * 0.3 + taskScore * 0.25 + vitalsScore * 0.25 + financeScore * 0.2);
  const scoreColor = score >= 80 ? T.teal : score >= 55 ? T.gold : T.coral;

  const yesterdayStr = useMemo(() => shiftDate(today, -1), [today]);
  useEffect(() => {
    if (scoreLog[today] !== score) setScoreLog({ ...scoreLog, [today]: score });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);
  const scoreDelta = scoreLog[yesterdayStr] != null ? score - scoreLog[yesterdayStr] : null;

  const focusTask = useMemo(() => {
    return tasks.find(t => !t.done && t.quadrant === "urgent-important") || pendingTasks[0] || null;
  }, [tasks, pendingTasks]);
  const focusHabit = useMemo(() => {
    if (focusTask) return null;
    return activeHabits.find(h => habitStatus(h) === "red") || null;
  }, [focusTask, activeHabits]);
  const highestImpact = focusTask
    ? `Finish "${focusTask.text}".`
    : focusHabit
      ? `${focusHabit.name}.`
      : (tasks.length || activeHabits.length)
        ? "You're clear — nothing urgent on deck."
        : "No focus items yet.";

  const riskText = useMemo(() => {
    const risks = [];
    const proteinLeft = vitals.proteinGoal - proteinToday;
    if (proteinLeft > 0) risks.push({ text: `Only ${proteinLeft}g protein left.`, severity: proteinLeft / vitals.proteinGoal });
    const stepsLeft = vitals.stepsGoal - vitals.steps;
    if (stepsLeft > 0) risks.push({ text: `${stepsLeft.toLocaleString()} steps short of your goal.`, severity: stepsLeft / vitals.stepsGoal });
    const calOver = consumedToday - vitals.caloriesGoal;
    if (calOver > 0) risks.push({ text: `${calOver} kcal over today's target.`, severity: calOver / vitals.caloriesGoal });
    if (!risks.length) return "Nothing flagged — you're on track.";
    risks.sort((a, b) => b.severity - a.severity);
    return risks[0].text;
  }, [vitals, consumedToday, proteinToday]);

  const nextText = useMemo(() => {
    const now = new Date();
    const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const upcoming = [...schedule].sort((a, b) => a.time.localeCompare(b.time)).find(s => s.time >= nowStr);
    if (!upcoming) return "Nothing else on the calendar today.";
    const [h, m] = upcoming.time.split(":").map(Number);
    const target = new Date(); target.setHours(h, m, 0, 0);
    const diffMin = Math.max(0, Math.round((target - now) / 60000));
    const when = diffMin === 0 ? "now" : diffMin < 60 ? `in ${diffMin} min` : `in ${Math.floor(diffMin / 60)}h${diffMin % 60 ? ` ${diffMin % 60}m` : ""}`;
    return `${upcoming.label} ${when}.`;
  }, [schedule]);

  const missionDone = tasks.filter(t => t.done).length;
  const missionText = tasks.length ? `${missionDone}/${tasks.length} tasks completed.` : "No tasks set yet.";
  const moneyText = remaining >= 0 ? `${fmtMoney(remaining)} left today.` : `${fmtMoney(Math.abs(remaining))} over budget today.`;
  const greetName = profile.name ? `, ${profile.name}` : "";

  // Smart Reminders — derived alerts, independent of the Focus/Risk lines above.
  const waterMl = waterLog[today] || 0;
  const smartReminders = useMemo(() => {
    const list = [];
    const overdue = tasks.filter(t => !t.done && t.dueDate && t.dueDate < today);
    if (overdue.length) list.push({ text: `${overdue.length} task${overdue.length > 1 ? "s" : ""} overdue.`, color: T.coral });
    const dueToday = tasks.filter(t => !t.done && t.dueDate === today);
    if (dueToday.length) list.push({ text: `${dueToday.length} task${dueToday.length > 1 ? "s" : ""} due today.`, color: T.gold });
    if (hour >= 15 && waterMl < (vitals.waterGoal || 2500) * 0.5) list.push({ text: "You're behind on water for this time of day.", color: T.sky });
    if (hour >= 18 && remaining < 0) list.push({ text: "You've gone over your daily budget.", color: T.coral });
    activeHabits.forEach(h => {
      if (!h.reminderTime || h.completions[today]) return;
      if (h.reminderTime <= `${String(hour).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`) {
        list.push({ text: `Reminder: ${h.name}.`, color: T.brass });
      }
    });
    return list;
  }, [tasks, waterMl, remaining, activeHabits, hour]);

  useEffect(() => {
    if (notifPermission !== "granted" || smartReminders.length === 0) return;
    const key = `lifeos:notified:${today}`;
    const already = new Set(JSON.parse(sessionStorage.getItem(key) || "[]"));
    smartReminders.forEach(r => {
      if (already.has(r.text)) return;
      new Notification("LifeOS", { body: r.text });
      already.add(r.text);
    });
    sessionStorage.setItem(key, JSON.stringify([...already]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartReminders, notifPermission]);

  const enableNotifs = () => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then(setNotifPermission);
  };

  // Simplified nutrition score (mirrors the Nutrition tab's formula) so the
  // Achievements widget can check "Nutrition Pro" without importing that module.
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const nutritionScoreToday = Math.round(
    clamp01(1 - Math.abs(consumedToday - vitals.caloriesGoal) / vitals.caloriesGoal) * 30 +
    clamp01(proteinToday / vitals.proteinGoal) * 25 +
    clamp01(1 - Math.abs(carbsToday - (vitals.carbsGoal || 250)) / (vitals.carbsGoal || 250)) * 15 +
    clamp01(1 - Math.abs(fatsToday - vitals.fatsGoal) / vitals.fatsGoal) * 10 +
    clamp01(waterMl / (vitals.waterGoal || 2500)) * 20
  );

  const order = reconcileWidgetOrder(dashboardOrder);
  const moveWidget = (targetId) => {
    if (!dragWidget || dragWidget === targetId) return;
    const list = [...order];
    const from = list.indexOf(dragWidget), to = list.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setDashboardOrder(list);
    setDragWidget(null);
  };

  const widgetContent = {
    score: (
      <div>
        <div className="flex items-center gap-5 mb-4">
          <div style={{ position: "relative", width: 76, height: 76 }}>
            <Ring pct={score / 100} color={scoreColor} size={76} stroke={7} label="" value="" />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 18, fontWeight: 600, color: T.text }}>{score}</div>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.text }}>
              {score}<span style={{ color: T.muted, fontSize: 14 }}>/100</span>
              {scoreDelta != null && scoreDelta !== 0 && (
                <span style={{ fontSize: 13, marginLeft: 8, color: scoreDelta > 0 ? T.teal : T.coral }}>{scoreDelta > 0 ? "+" : ""}{scoreDelta}</span>
              )}
            </div>
            <div style={{ color: T.muted, fontSize: 12 }}>vs. yesterday</div>
          </div>
        </div>
        <LifeScoreBreakdown habitScore={habitScore} taskScore={taskScore} vitalsScore={vitalsScore} financeScore={financeScore} />
      </div>
    ),
    focus: (
      <div className="space-y-2.5">
        <FocusRow emoji="🔥" label="Highest Impact" value={highestImpact} color={T.coral}
          onCheck={focusTask ? () => toggleTask(focusTask.id) : focusHabit ? () => {
            const c = { ...focusHabit.completions };
            if (c[today]) delete c[today]; else c[today] = true;
            setHabits(habits.map(x => x.id === focusHabit.id ? { ...x, completions: c } : x));
          } : undefined} />
        <FocusRow emoji="⚠️" label="Risk" value={riskText} color={T.gold} />
        <FocusRow emoji="💰" label="Money" value={moneyText} color={T.teal} />
        <FocusRow emoji="📅" label="Next" value={nextText} color={T.sky} />
        <FocusRow emoji="🎯" label="Mission" value={missionText} color={T.violet} />
      </div>
    ),
    schedule: (
      <div className="space-y-2">
        {schedule.length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>Nothing scheduled — add your day via the edit icon.</div>}
        {schedule.map(s => (
          <div key={s.id} className="flex items-center gap-3 text-sm">
            <span style={{ fontFamily: "JetBrains Mono, monospace", color: T.sky, width: 76, fontSize: 12.5 }}>{fmtTime12(s.time)}</span>
            <span style={{ color: T.text }}>{s.label}</span>
          </div>
        ))}
      </div>
    ),
    tasks: (
      <div>
        <div className="flex gap-1.5 mb-3">
          <Input value={qtText} onChange={e => setQtText(e.target.value)} placeholder="Quick add a task…" onKeyDown={e => e.key === "Enter" && addQuickTask()} style={{ flex: "2 1 100px" }} />
          <Select value={qtPriority} onChange={e => setQtPriority(e.target.value)} style={{ flex: "1 1 70px" }}>
            {["High", "Medium", "Low"].map(p => <option key={p}>{p}</option>)}
          </Select>
          <Select value={qtRecurrence} onChange={e => setQtRecurrence(e.target.value)} style={{ flex: "1 1 70px" }}>
            <option value="none">One-time</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </Select>
          <button onClick={addQuickTask} className="px-3 rounded-lg" style={{ background: T.surface2, color: T.sky, border: `1px solid ${T.line}` }}><Plus size={16} /></button>
        </div>
        <div className="space-y-2">
          {pendingTasks.slice(0, 6).map(t => {
            const pr = PRIORITY_MAP[t.quadrant] || PRIORITY_MAP["not_urgent-not_important"];
            return (
              <button key={t.id} onClick={() => toggleTask(t.id)} className="flex items-center gap-2.5 text-sm w-full text-left">
                <Circle size={16} color={T.line} />
                <span style={{ width: 6, height: 6, borderRadius: 999, background: pr.color, flexShrink: 0 }} />
                <span style={{ color: T.text, flex: 1 }}>{t.text}</span>
                {t.recurrence && t.recurrence !== "none" && <Repeat size={12} color={T.muted} />}
              </button>
            );
          })}
          {pendingTasks.length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>All tasks done — nice.</div>}
        </div>
      </div>
    ),
    habits: (
      <div className="grid grid-cols-2 gap-2">
        {activeHabits.map(h => {
          const st = habitStatus(h);
          const doneToday = st === "green";
          return (
            <button key={h.id} onClick={() => {
              const c = { ...h.completions };
              if (c[today]) delete c[today]; else c[today] = true;
              setHabits(habits.map(x => x.id === h.id ? { ...x, completions: c } : x));
            }} className="flex items-center gap-2 text-sm">
              {doneToday
                ? <CheckCircle2 size={18} color={statusColor.green} fill={statusColor.green + "33"} />
                : <Circle size={18} color={statusColor[st]} />}
              <span style={{ color: doneToday ? T.muted : T.text, textDecoration: doneToday ? "line-through" : "none" }}>{h.icon} {h.name}</span>
            </button>
          );
        })}
      </div>
    ),
    vitals: (
      <div className="grid grid-cols-2 gap-4">
        <VitalStat icon={Zap} color={T.gold} label="Calories" value={consumedToday} goal={vitals.caloriesGoal} />
        <VitalStat icon={Egg} color={T.coral} label="Protein" value={proteinToday} goal={vitals.proteinGoal} suffix="g" />
        <VitalStat icon={Droplet} color={T.sky} label="Fats" value={fatsToday} goal={vitals.fatsGoal} suffix="g" />
        <div>
          <VitalStat icon={Footprints} color={T.brass} label="Steps" value={vitals.steps.toLocaleString()} goal={null} />
          <button onClick={() => setShowAddSteps(true)} className="mt-1.5 flex items-center gap-1 text-xs font-medium" style={{ color: T.sky }}>
            <Plus size={12} /> Add steps
          </button>
        </div>
        <VitalStat icon={Moon} color={T.violet} label="Sleep" value={fmtSleep(vitals.sleepHours)} goal={null} />
      </div>
    ),
    finance: (
      <div className="grid grid-cols-2 gap-4">
        {vitals.dailyBudget > 0 ? (
          <>
            <div>
              <div className="text-xs mb-1" style={{ color: T.muted }}>Spent today</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 19, color: T.coral }}>{fmtMoney(spentToday)}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: T.muted }}>Remaining</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 19, color: remaining >= 0 ? T.teal : T.coral }}>{fmtMoney(remaining)}</div>
            </div>
          </>
        ) : (
          <div className="col-span-2 text-sm" style={{ color: T.muted }}>Set a daily budget in Fitness to unlock finance summary.</div>
        )}
      </div>
    ),
    goals: (
      <div className="space-y-3">
        {goals.map(g => (
          <div key={g.id}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span style={{ color: T.text }}>{g.title}</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", color: T.muted, fontSize: 12.5 }}>{g.progress}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
              <div style={{ width: `${g.progress}%`, height: "100%", background: `linear-gradient(90deg, ${GRAD[T.violet][0]}, ${GRAD[T.violet][1]})` }} />
            </div>
          </div>
        ))}
        {goals.length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>No active goals yet.</div>}
      </div>
    ),
    weeklyTrend: <WeeklyTrendChart scoreLog={scoreLog} />,
    streakCalendar: <StreakCalendar scoreLog={scoreLog} />,
    calendarView: <CalendarView tasks={tasks} journal={journal} />,
    achievements: <AchievementsWidget habits={habits} tasks={tasks} journal={journal} waterLog={waterLog} vitals={vitals} nutritionScoreToday={nutritionScoreToday} />,
  };

  const widgetMeta = {
    score: { title: "Today's Score & Breakdown", icon: Sparkles, color: scoreColor, viewAll: null },
    focus: { title: "Today's Focus", icon: Sparkles, color: T.brass, viewAll: null },
    schedule: { title: "Today's Schedule", icon: Calendar, color: T.sky, viewAll: null },
    tasks: { title: "Tasks", icon: ListTodo, color: T.sky, viewAll: "tasks" },
    habits: { title: "Habits", icon: Flame, color: T.brass, viewAll: "habits" },
    vitals: { title: "Vitals", icon: Zap, color: T.coral, viewAll: null },
    finance: { title: "Finance", icon: Wallet, color: T.teal, viewAll: null },
    goals: { title: "Goal Progress", icon: Target, color: T.violet, viewAll: "goals" },
    weeklyTrend: { title: "Weekly Trend", icon: TrendingUp, color: T.brass, viewAll: null },
    streakCalendar: { title: "Streak Calendar", icon: Flame, color: T.gold, viewAll: null },
    calendarView: { title: "Calendar View", icon: Calendar, color: T.violet, viewAll: null },
    achievements: { title: "Achievements", icon: Award, color: T.violet, viewAll: null },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <Eyebrow color={T.brass}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Eyebrow>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 28, color: T.text }}>{timeGreeting}{greetName} 👋</h1>
        </div>
        <IconBtn title="Edit today's briefing" onClick={() => setShowEdit(true)}><Edit3 size={18} /></IconBtn>
      </div>

      <QuickActionsBar setTab={setTab} />
      <GlobalSearch habits={habits} tasks={tasks} goals={goals} tx={tx} workouts={workouts} journal={journal} calorieLog={calorieLog} setTab={setTab} />

      <div className="grid md:grid-cols-2 gap-4">
        <Panel style={{ padding: 16 }}>
          <Eyebrow color={T.sky}>Local Weather</Eyebrow>
          <WeatherWidget />
        </Panel>
        <Panel style={{ padding: 16 }}>
          <Eyebrow color={T.gold}>Smart Reminders</Eyebrow>
          <SmartRemindersWidget reminders={smartReminders} notifPermission={notifPermission} onEnableNotifs={enableNotifs} />
        </Panel>
      </div>

      <div className="text-xs px-1" style={{ color: T.muted }}>Drag the grip handle on any card below to reorder your dashboard.</div>

      <div className="space-y-4">
        {order.map(id => {
          const meta = widgetMeta[id];
          return (
            <WidgetShell
              key={id} id={id} title={meta.title} color={meta.color} icon={meta.icon}
              draggable onDragStart={setDragWidget} onDrop={moveWidget} dimmed={dragWidget === id}
            >
              {widgetContent[id]}
              {meta.viewAll && (
                <button onClick={() => setTab(meta.viewAll)} className="mt-3 text-xs" style={{ color: T.muted }}>View all →</button>
              )}
            </WidgetShell>
          );
        })}
      </div>

      <FuelGauge
        goal={vitals.caloriesGoal}
        consumed={consumedToday}
        proteinGoal={vitals.proteinGoal}
        proteinConsumed={proteinToday}
        fatsGoal={vitals.fatsGoal}
        fatsConsumed={fatsToday}
        entries={todaysMeals}
        onAdd={addMeal}
        onUpdate={updateMeal}
        onRemove={removeMeal}
      />

      {showAddSteps && (
        <Modal title="Add steps" onClose={() => setShowAddSteps(false)}>
          <div className="space-y-3">
            <Eyebrow>Steps to add</Eyebrow>
            <Input autoFocus type="number" value={stepsToAdd} onChange={e => setStepsToAdd(e.target.value)} placeholder="e.g. 1000" onKeyDown={e => e.key === "Enter" && addSteps()} />
            <PrimaryBtn color={T.sky} onClick={addSteps} style={{ width: "100%", justifyContent: "center" }}>Add</PrimaryBtn>
          </div>
        </Modal>
      )}

      {showEdit && (
        <DashboardEditModal profile={profile} setProfile={setProfile} schedule={schedule} setSchedule={setSchedule} vitals={vitals} setVitals={setVitals} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}

/* ================= NUTRITION module ================= */
/* Apple Health rings + MacroFactor-style daily macro tracking, layered on
   top of the same instrument-panel primitives used everywhere else:
   Panel / Ring / Eyebrow / PrimaryBtn / Modal. Nothing here introduces a
   new visual language — it's the existing tokens applied to a deeper,
   dedicated nutrition surface than the Dashboard's Fuel Gauge widget. */

function LegacyNutritionModule({ calorieLog, setCalorieLog, waterLog, setWaterLog, vitals }) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showAdd, setShowAdd] = useState(false);

  const dayEntries = useMemo(() => calorieLog.filter(c => c.date === selectedDate), [calorieLog, selectedDate]);
  const consumed = dayEntries.reduce((s, c) => s + c.calories, 0);
  const protein = Math.round(dayEntries.reduce((s, c) => s + (c.protein || 0), 0));
  const carbs = Math.round(dayEntries.reduce((s, c) => s + (c.carbs || 0), 0));
  const fats = Math.round(dayEntries.reduce((s, c) => s + (c.fats || 0), 0));

  const caloriesGoal = vitals.caloriesGoal || 2000;
  const proteinGoal = vitals.proteinGoal || 150;
  const carbsGoal = vitals.carbsGoal || 250;
  const fatsGoal = vitals.fatsGoal || 70;
  const waterGoal = vitals.waterGoal || 2500;
  const waterMl = waterLog[selectedDate] || 0;

  const recentNames = useMemo(() => {
    const counts = {};
    calorieLog.forEach(c => { counts[c.name] = (counts[c.name] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n);
  }, [calorieLog]);

  const addMeal = (entry) => setCalorieLog([{ ...entry, date: selectedDate }, ...calorieLog]);
  const updateMeal = (id, updates) => setCalorieLog(calorieLog.map(c => c.id === id ? { ...c, ...updates } : c));
  const removeMeal = (id) => setCalorieLog(calorieLog.filter(c => c.id !== id));
  const setWater = (ml) => setWaterLog({ ...waterLog, [selectedDate]: Math.max(0, ml) });

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const calScore = clamp01(1 - Math.abs(consumed - caloriesGoal) / caloriesGoal);
  const proteinScore = clamp01(protein / proteinGoal);
  const carbsScore = clamp01(1 - Math.abs(carbs - carbsGoal) / carbsGoal);
  const fatsScore = clamp01(1 - Math.abs(fats - fatsGoal) / fatsGoal);
  const waterScore = clamp01(waterMl / waterGoal);
  const nutritionScore = Math.round(calScore * 30 + proteinScore * 25 + carbsScore * 15 + fatsScore * 10 + waterScore * 20);

  const breakdown = [
    { label: "Calories", color: T.gold },
    { label: "Protein", color: T.coral },
    { label: "Carbs", color: T.brass },
    { label: "Fats", color: T.sky },
    { label: "Water", color: T.sky },
  ];

  return (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Eyebrow color={T.gold}>Fuel & Hydration</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Nutrition</h2>
        </div>
        <div className="flex items-center gap-3">
          <NutritionDateNav date={selectedDate} setDate={setSelectedDate} />
          <PrimaryBtn color={T.gold} onClick={() => setShowAdd(true)}><Plus size={16} /> Log meal</PrimaryBtn>
        </div>
      </div>

      <NutritionScoreCard score={nutritionScore} breakdown={breakdown} />

      <Panel style={{ padding: 18 }}>
        <Eyebrow color={T.gold}>Today's Rings</Eyebrow>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-1">
          <Ring pct={caloriesGoal ? consumed / caloriesGoal : 0} color={T.gold} size={84} stroke={8} label="kcal" value={consumed} />
          <Ring pct={proteinGoal ? protein / proteinGoal : 0} color={T.coral} size={84} stroke={8} label="protein g" value={protein} />
          <Ring pct={carbsGoal ? carbs / carbsGoal : 0} color={T.brass} size={84} stroke={8} label="carbs g" value={carbs} />
          <Ring pct={fatsGoal ? fats / fatsGoal : 0} color={T.sky} size={84} stroke={8} label="fats g" value={fats} />
        </div>
      </Panel>

      <div className="grid md:grid-cols-2 gap-4">
        <WeeklyProgress calorieLog={calorieLog} caloriesGoal={caloriesGoal} />
        <WaterTracker ml={waterMl} goal={waterGoal} onSet={setWater} />
      </div>

      <MealTimeline entries={dayEntries} onUpdate={updateMeal} onRemove={removeMeal} />

      <NutritionFAB onClick={() => setShowAdd(true)} />

      {showAdd && <AddMealModal recentNames={recentNames} onClose={() => setShowAdd(false)} onAdd={addMeal} />}
    </div>
  );
}

//* ================= NUTRITION module ================= */
/* Apple Health rings + MacroFactor-style daily macro tracking, layered on
   top of the same instrument-panel primitives used everywhere else:
   Panel / Ring / Eyebrow / PrimaryBtn / Modal. Nothing here introduces a
   new visual language — it's the existing tokens applied to a deeper,
   dedicated nutrition surface than the Dashboard's Fuel Gauge widget. */

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function NutritionDateNav({ date, setDate }) {
  const isToday = date === todayStr();
  const label = isToday
    ? "Today"
    : new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="flex items-center gap-1">
      <IconBtn title="Previous day" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={18} /></IconBtn>
      <div className="px-2 text-sm font-semibold min-w-[92px] text-center" style={{ color: T.text, fontFamily: "Inter, sans-serif" }}>
        {label}
      </div>
      <IconBtn title="Next day" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight size={18} /></IconBtn>
      {!isToday && (
        <button onClick={() => setDate(todayStr())} className="ml-1 text-xs font-semibold px-2 py-1 rounded-full" style={{ color: T.sky, background: T.sky + "1a" }}>
          Jump to today
        </button>
      )}
    </div>
  );
}

function NutritionScoreCard({ score, breakdown }) {
  const color = score >= 80 ? T.teal : score >= 55 ? T.gold : T.coral;
  const verdict = score >= 80 ? "Excellent" : score >= 55 ? "On track" : "Needs attention";
  return (
    <Panel style={{ padding: 20 }}>
      <div className="flex items-center gap-5">
        <Ring pct={score / 100} color={color} size={92} stroke={9} label="score" value={score} />
        <div className="flex-1">
          <Eyebrow color={color}>Nutrition Score — {verdict}</Eyebrow>
          <div style={{ color: T.muted, fontSize: 12.5, lineHeight: 1.6 }}>
            Blends how close you landed to your calorie target, protein and carb/fat balance, and hydration into one number.
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
            {breakdown.map(b => (
              <div key={b.label} className="flex items-center gap-1.5 text-xs" style={{ color: T.muted }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: b.color }} />
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ---- Feature: Saved/Favorite Meals (one-tap logging) ----
function FavoriteMealsPanel({ favoriteMeals, onLog, onRemove }) {
  return (
    <Panel style={{ padding: 16 }}>
      <div className="flex items-center justify-between mb-3">
        <Eyebrow icon={Heart} color={T.coral}>Favorite Meals</Eyebrow>
        <span style={{ color: T.muted, fontSize: 11 }}>{favoriteMeals.length}</span>
      </div>
      {favoriteMeals.length === 0 ? (
        <div style={{ color: T.muted, fontSize: 12.5 }}>
          Save a meal as a favorite next time you log it — then one tap re-logs it here.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {favoriteMeals.map(f => (
            <div key={f.id} className="relative group">
              <button
                onClick={() => onLog(f)}
                className="w-full flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-colors"
                style={{ background: T.surface2, border: `1px solid ${T.line}` }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.coral)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
              >
                <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{f.name}</span>
                <span style={{ color: T.muted, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
                  {f.calories} kcal · {f.protein || 0}P
                </span>
              </button>
              <button
                onClick={() => onRemove(f.id)}
                title="Remove favorite"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.coral }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---- Feature: Meal Suggestions ("Need 60g protein, 400 kcal left") ----
function MealSuggestionsPanel({ remainingCalories, remainingProtein, favoriteMeals, onLog }) {
  const fits = favoriteMeals
    .filter(f => f.calories <= Math.max(remainingCalories, 0) + 50) // small grace margin
    .sort((a, b) => (b.protein || 0) - (a.protein || 0))
    .slice(0, 3);

  const calText = remainingCalories > 0 ? `${remainingCalories} kcal left` : `${Math.abs(remainingCalories)} kcal over`;
  const proteinText = remainingProtein > 0 ? `Need ${remainingProtein}g protein` : `Protein goal hit`;

  return (
    <Panel style={{ padding: 16 }}>
      <Eyebrow icon={Target} color={T.gold}>Meal Suggestions</Eyebrow>
      <div style={{ color: T.text, fontSize: 14, marginTop: 2 }}>{proteinText}, {calText}.</div>
      {fits.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {fits.map(f => (
            <button key={f.id} onClick={() => onLog(f)} className="flex items-center justify-between w-full text-sm text-left px-2.5 py-1.5 rounded-lg"
              style={{ background: T.surface2 }}>
              <span style={{ color: T.text }}>{f.name}</span>
              <span style={{ color: T.muted, fontSize: 11.5, fontFamily: "JetBrains Mono, monospace" }}>{f.calories} kcal · {f.protein || 0}g P</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ color: T.muted, fontSize: 12, marginTop: 8 }}>
          {favoriteMeals.length === 0 ? "Save some favorite meals to get suggestions that fit your remaining budget." : "None of your favorites fit what's left today."}
        </div>
      )}
    </Panel>
  );
}

// ---- Feature: Macro Breakdown (pie chart + percentages) ----
function MacroBreakdownChart({ protein, carbs, fats }) {
  const pCal = protein * 4, cCal = carbs * 4, fCal = fats * 9;
  const total = pCal + cCal + fCal;
  const data = [
    { name: "Protein", value: pCal, grams: protein, color: T.coral },
    { name: "Carbs", value: cCal, grams: carbs, color: T.brass },
    { name: "Fats", value: fCal, grams: fats, color: T.sky },
  ];

  return (
    <Panel style={{ padding: 16 }}>
      <Eyebrow icon={Percent} color={T.gold}>Macro Breakdown</Eyebrow>
      {total === 0 ? (
        <div style={{ color: T.muted, fontSize: 12.5, marginTop: 8 }}>Log a meal to see your macro split.</div>
      ) : (
        <div className="flex items-center gap-4 mt-1">
          <div style={{ width: 100, height: 100, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={30} outerRadius={48} paddingAngle={3}>
                  {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1.5">
            {data.map(d => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5" style={{ color: T.text }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: d.color }} /> {d.name}
                </span>
                <span style={{ color: T.muted, fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>
                  {d.grams}g · {total ? Math.round((d.value / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---- Feature: Nutrition Insights ----
// Simple, honestly-labeled pattern detection: compares average protein on
// days that had a logged workout vs. days that didn't, and weekday vs.
// weekend calorie averages. Needs at least 2 days in each bucket before it
// says anything, so it doesn't draw conclusions from noise.
function computeNutritionInsights(calorieLog, workouts) {
  const dateTotals = {};
  calorieLog.forEach(c => {
    if (!dateTotals[c.date]) dateTotals[c.date] = { calories: 0, protein: 0 };
    dateTotals[c.date].calories += c.calories;
    dateTotals[c.date].protein += (c.protein || 0);
  });
  const entries = Object.entries(dateTotals);
  const avg = (list, key) => list.length ? Math.round(list.reduce((s, [, v]) => s + v[key], 0) / list.length) : null;

  const insights = [];

  const workoutDates = new Set((workouts || []).map(w => w.date));
  const workoutDays = entries.filter(([d]) => workoutDates.has(d));
  const restDays = entries.filter(([d]) => !workoutDates.has(d));
  if (workoutDays.length >= 2 && restDays.length >= 2) {
    const wp = avg(workoutDays, "protein"), rp = avg(restDays, "protein");
    if (wp > rp) insights.push(`Protein is highest on workout days (${wp}g vs ${rp}g on rest days).`);
    else if (rp > wp) insights.push(`Protein is actually lower on workout days (${wp}g vs ${rp}g on rest days) — worth fueling training harder.`);
  }

  const weekday = entries.filter(([d]) => { const day = new Date(d + "T00:00:00").getDay(); return day >= 1 && day <= 5; });
  const weekend = entries.filter(([d]) => { const day = new Date(d + "T00:00:00").getDay(); return day === 0 || day === 6; });
  if (weekday.length >= 2 && weekend.length >= 2) {
    const wc = avg(weekday, "calories"), we = avg(weekend, "calories");
    if (wc > 0 && we > wc * 1.1) insights.push(`Weekend calories run about ${Math.round((we / wc - 1) * 100)}% higher than weekdays.`);
  }

  if (insights.length === 0) insights.push("Log meals across a few more days — including some workout days — to unlock personalized insights.");
  return insights;
}

function NutritionInsightsPanel({ calorieLog, workouts }) {
  const insights = useMemo(() => computeNutritionInsights(calorieLog, workouts), [calorieLog, workouts]);
  return (
    <Panel style={{ padding: 16 }}>
      <Eyebrow icon={Lightbulb} color={T.violet}>Nutrition Insights</Eyebrow>
      <div className="space-y-2 mt-2">
        {insights.map((text, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <Sparkles size={13} color={T.violet} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ color: T.text }}>{text}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function WeeklyProgress({ calorieLog, caloriesGoal }) {
  const data = useMemo(() => {
    const days = daysAgoArr(7);
    return days.map(d => {
      const dayTotal = calorieLog.filter(c => c.date === d).reduce((s, c) => s + c.calories, 0);
      return { date: fmtDate(d), calories: dayTotal, over: dayTotal > caloriesGoal };
    });
  }, [calorieLog, caloriesGoal]);

  const avg = data.length ? Math.round(data.reduce((s, d) => s + d.calories, 0) / data.length) : 0;
  const onTargetDays = data.filter(d => d.calories > 0 && Math.abs(d.calories - caloriesGoal) <= caloriesGoal * 0.1).length;

  return (
    <Panel style={{ padding: 16 }}>
      <div className="flex items-center justify-between mb-1">
        <Eyebrow color={T.teal}>Weekly Progress</Eyebrow>
        <div className="text-xs" style={{ color: T.muted }}>
          Avg <span style={{ color: T.text, fontFamily: "JetBrains Mono, monospace" }}>{avg}</span> kcal · {onTargetDays}/7 days on target
        </div>
      </div>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke={T.line} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" stroke={T.muted} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke={T.muted} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} />
            <ReferenceLine y={caloriesGoal} stroke={T.muted} strokeDasharray="4 4" />
            <Bar dataKey="calories" radius={[6, 6, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.over ? T.coral : T.teal} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function WaterTracker({ ml, goal, onSet }) {
  const cupsTarget = Math.max(1, Math.round(goal / WATER_UNIT_ML));
  const cupsFilled = Math.min(cupsTarget, Math.floor(ml / WATER_UNIT_ML));
  const pct = goal ? Math.min(1, ml / goal) : 0;

  const clickCup = (i) => {
    onSet(i < cupsFilled ? i * WATER_UNIT_ML : (i + 1) * WATER_UNIT_ML);
  };

  return (
    <Panel style={{ padding: 18 }}>
      <div className="flex items-center justify-between mb-3">
        <Eyebrow color={T.sky}>Water Tracker</Eyebrow>
        <div className="text-xs" style={{ color: T.muted }}>
          <span style={{ color: T.text, fontFamily: "JetBrains Mono, monospace" }}>{ml}</span> / {goal} ml
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {Array.from({ length: cupsTarget }).map((_, i) => {
          const filled = i < cupsFilled;
          return (
            <button key={i} aria-label={`Glass ${i + 1} of ${cupsTarget}`} onClick={() => clickCup(i)}>
              <Droplet size={26} color={filled ? T.sky : T.line} fill={filled ? T.sky + "55" : "none"} />
            </button>
          );
        })}
      </div>
      <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: T.surface2 }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: `linear-gradient(90deg, ${GRAD[T.sky][0]}, ${GRAD[T.sky][1]})`, transition: "width .4s" }} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => onSet(Math.max(0, ml - WATER_UNIT_ML))} className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1" style={{ background: T.surface2, color: T.muted, border: `1px solid ${T.line}` }}>
          <Minus size={12} /> {WATER_UNIT_ML}ml
        </button>
        <button onClick={() => onSet(ml + WATER_UNIT_ML)} className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1" style={{ background: T.sky + "22", color: T.sky, border: `1px solid ${T.line}` }}>
          <Plus size={12} /> {WATER_UNIT_ML}ml
        </button>
        <button onClick={() => onSet(ml + 500)} className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1" style={{ background: T.sky + "22", color: T.sky, border: `1px solid ${T.line}` }}>
          <Plus size={12} /> 500ml
        </button>
      </div>
    </Panel>
  );
}

function MealEditRow({ entry, onSave, onCancel }) {
  const [draft, setDraft] = useState({
    name: entry.name, time: entry.time || "12:00", mealType: entry.mealType || "snack",
    calories: String(entry.calories), protein: String(entry.protein || 0),
    carbs: String(entry.carbs || 0), fats: String(entry.fats || 0),
  });
  const save = () => {
    const n = parseInt(draft.calories, 10);
    if (!n) return;
    onSave({
      name: draft.name.trim() || "Meal", time: draft.time, mealType: draft.mealType,
      calories: n, protein: parseFloat(draft.protein) || 0, carbs: parseFloat(draft.carbs) || 0, fats: parseFloat(draft.fats) || 0,
    });
  };
  return (
    <div className="p-2.5 rounded-lg space-y-2" style={{ background: T.surface2 }}>
      <div className="flex flex-wrap gap-1.5">
        <Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} style={{ flex: "2 1 120px" }} placeholder="Name" />
        <Input type="time" value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} style={{ flex: "1 1 90px" }} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Input type="number" value={draft.calories} onChange={e => setDraft({ ...draft, calories: e.target.value })} style={{ flex: "1 1 60px" }} placeholder="kcal" />
        <Input type="number" value={draft.protein} onChange={e => setDraft({ ...draft, protein: e.target.value })} style={{ flex: "1 1 60px" }} placeholder="P g" />
        <Input type="number" value={draft.carbs} onChange={e => setDraft({ ...draft, carbs: e.target.value })} style={{ flex: "1 1 60px" }} placeholder="C g" />
        <Input type="number" value={draft.fats} onChange={e => setDraft({ ...draft, fats: e.target.value })} style={{ flex: "1 1 60px" }} placeholder="F g" />
        <IconBtn title="Save changes" onClick={save}><Check size={16} color={T.teal} /></IconBtn>
        <IconBtn title="Cancel edit" danger onClick={onCancel}><X size={16} /></IconBtn>
      </div>
    </div>
  );
}

function MealTimeline({ entries, onUpdate, onRemove, onSaveFavorite, favoriteMeals }) {
  const [editingId, setEditingId] = useState(null);
  const isFavorited = (name) => favoriteMeals.some(f => f.name.toLowerCase() === name.toLowerCase());

  return (
    <Panel style={{ padding: 0 }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
        <Eyebrow color={T.gold}>Meal Timeline</Eyebrow>
        <div className="text-xs" style={{ color: T.muted }}>{entries.length} logged</div>
      </div>
      {MEAL_TYPES.map(mt => {
        const items = entries.filter(e => (e.mealType || "snack") === mt.id).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        if (items.length === 0) return null;
        const subtotal = items.reduce((s, e) => s + e.calories, 0);
        const Icon = mt.icon;
        return (
          <div key={mt.id} className="px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icon size={15} color={mt.color} />
                <span className="text-sm font-semibold" style={{ color: mt.color }}>{mt.label}</span>
              </div>
              <span className="text-xs font-mono" style={{ color: T.muted, fontFamily: "JetBrains Mono, monospace" }}>{subtotal} kcal</span>
            </div>
            <div className="space-y-2">
              {items.map(e => editingId === e.id ? (
                <MealEditRow key={e.id} entry={e} onCancel={() => setEditingId(null)} onSave={(updates) => { onUpdate(e.id, updates); setEditingId(null); }} />
              ) : (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2.5">
                    {e.time && <span style={{ color: T.muted, fontSize: 11.5, fontFamily: "JetBrains Mono, monospace", width: 44 }}>{fmtTime12(e.time)}</span>}
                    <span style={{ color: T.text }}>{e.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span style={{ fontFamily: "JetBrains Mono, monospace", color: T.muted, fontSize: 11.5 }}>
                      {e.calories} kcal · {e.protein || 0}P · {e.carbs || 0}C · {e.fats || 0}F
                    </span>
                    <IconBtn title={isFavorited(e.name) ? "Already a favorite" : "Save as favorite"} onClick={() => onSaveFavorite(e)}>
                      <Heart size={13} color={isFavorited(e.name) ? T.coral : T.muted} fill={isFavorited(e.name) ? T.coral : "none"} />
                    </IconBtn>
                    <IconBtn title="Edit meal" onClick={() => setEditingId(e.id)}><Edit3 size={13} /></IconBtn>
                    <IconBtn title="Remove meal" danger onClick={() => onRemove(e.id)}><Trash2 size={13} /></IconBtn>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {entries.length === 0 && <div className="text-center py-10" style={{ color: T.muted }}>Nothing logged for this day yet.</div>}
    </Panel>
  );
}

function AddMealModal({ recentNames, onClose, onAdd, onAddFavorite }) {
  const [mealType, setMealType] = useState(mealTypeFor(new Date().getHours()));
  const [time, setTime] = useState(nowTimeStr());
  const [name, setName] = useState("");
  const [cals, setCals] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [saveFav, setSaveFav] = useState(false);

  const submit = () => {
    const n = parseInt(cals, 10);
    if (!n) return;
    const entry = {
      id: uid(), name: name.trim() || "Meal", mealType, time,
      calories: n, protein: parseFloat(protein) || 0, carbs: parseFloat(carbs) || 0, fats: parseFloat(fats) || 0,
    };
    onAdd(entry);
    if (saveFav) onAddFavorite(entry);
    onClose();
  };

  return (
    <Modal title="Log a meal" onClose={onClose}>
      <div className="space-y-3">
        {recentNames.length > 0 && (
          <div>
            <Eyebrow>Recent</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {recentNames.map(n => (
                <button key={n} onClick={() => setName(n)} className="px-2.5 py-1 rounded-full text-xs" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <Eyebrow>Meal</Eyebrow>
          <div className="grid grid-cols-4 gap-1.5">
            {MEAL_TYPES.map(mt => {
              const Icon = mt.icon;
              const active = mealType === mt.id;
              return (
                <button key={mt.id} onClick={() => setMealType(mt.id)}
                  className="flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium"
                  style={{ background: active ? mt.color + "22" : T.surface2, border: active ? `1px solid ${mt.color}` : `1px solid ${T.line}`, color: active ? mt.color : T.muted }}>
                  <Icon size={15} />
                  {mt.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Eyebrow>Name</Eyebrow>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Grilled chicken bowl" onKeyDown={e => e.key === "Enter" && submit()} />
          </div>
          <div>
            <Eyebrow>Time</Eyebrow>
            <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div><div className="text-xs mb-1" style={{ color: T.muted }}>kcal</div><Input type="number" value={cals} onChange={e => setCals(e.target.value)} /></div>
          <div><div className="text-xs mb-1" style={{ color: T.muted }}>Protein g</div><Input type="number" value={protein} onChange={e => setProtein(e.target.value)} /></div>
          <div><div className="text-xs mb-1" style={{ color: T.muted }}>Carbs g</div><Input type="number" value={carbs} onChange={e => setCarbs(e.target.value)} /></div>
          <div><div className="text-xs mb-1" style={{ color: T.muted }}>Fat g</div><Input type="number" value={fats} onChange={e => setFats(e.target.value)} /></div>
        </div>
        <button onClick={() => setSaveFav(f => !f)} className="flex items-center gap-2 text-sm">
          <Heart size={16} color={saveFav ? T.coral : T.muted} fill={saveFav ? T.coral : "none"} />
          <span style={{ color: saveFav ? T.text : T.muted }}>Save as favorite meal</span>
        </button>
        <PrimaryBtn color={T.gold} onClick={submit} style={{ width: "100%", justifyContent: "center" }}>Log meal</PrimaryBtn>
      </div>
    </Modal>
  );
}

function NutritionFAB({ onClick }) {
  const [g1, g2] = GRAD[T.gold];
  return (
    <button
      onClick={onClick}
      aria-label="Log a meal"
      className="fixed z-30 flex items-center justify-center rounded-full transition-transform active:scale-90 bottom-24 md:bottom-8 right-5 md:right-8"
      style={{
        width: 56, height: 56,
        background: `linear-gradient(135deg, ${g1}, ${g2})`,
        boxShadow: `${glow(T.gold, 0.55)}, 0 8px 20px -6px rgba(0,0,0,0.6)`,
        border: "none",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.06)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <Plus size={26} color="#14161C" />
    </button>
  );
}

function NutritionModule({ calorieLog, setCalorieLog, waterLog, setWaterLog, vitals, workouts, favoriteMeals, setFavoriteMeals }) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showAdd, setShowAdd] = useState(false);

  const dayEntries = useMemo(() => calorieLog.filter(c => c.date === selectedDate), [calorieLog, selectedDate]);
  const consumed = dayEntries.reduce((s, c) => s + c.calories, 0);
  const protein = Math.round(dayEntries.reduce((s, c) => s + (c.protein || 0), 0));
  const carbs = Math.round(dayEntries.reduce((s, c) => s + (c.carbs || 0), 0));
  const fats = Math.round(dayEntries.reduce((s, c) => s + (c.fats || 0), 0));

  const caloriesGoal = vitals.caloriesGoal || 2000;
  const proteinGoal = vitals.proteinGoal || 150;
  const carbsGoal = vitals.carbsGoal || 250;
  const fatsGoal = vitals.fatsGoal || 70;
  const waterGoal = vitals.waterGoal || 2500;
  const waterMl = waterLog[selectedDate] || 0;

  const recentNames = useMemo(() => {
    const counts = {};
    calorieLog.forEach(c => { counts[c.name] = (counts[c.name] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n);
  }, [calorieLog]);

  const addMeal = (entry) => setCalorieLog([{ ...entry, date: selectedDate }, ...calorieLog]);
  const updateMeal = (id, updates) => setCalorieLog(calorieLog.map(c => c.id === id ? { ...c, ...updates } : c));
  const removeMeal = (id) => setCalorieLog(calorieLog.filter(c => c.id !== id));
  const setWater = (ml) => setWaterLog({ ...waterLog, [selectedDate]: Math.max(0, ml) });

  // ---- Feature: favorite meals — save + one-tap log ----
  const addFavorite = (entry) => {
    if (favoriteMeals.some(f => f.name.toLowerCase() === entry.name.toLowerCase())) return;
    setFavoriteMeals([...favoriteMeals, {
      id: uid(), name: entry.name, calories: entry.calories,
      protein: entry.protein || 0, carbs: entry.carbs || 0, fats: entry.fats || 0,
    }]);
  };
  const removeFavorite = (id) => setFavoriteMeals(favoriteMeals.filter(f => f.id !== id));
  const logFavorite = (fav) => {
    const hour = new Date().getHours();
    addMeal({
      id: uid(), name: fav.name, mealType: mealTypeFor(hour), time: nowTimeStr(),
      calories: fav.calories, protein: fav.protein || 0, carbs: fav.carbs || 0, fats: fav.fats || 0,
    });
  };

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const calScore = clamp01(1 - Math.abs(consumed - caloriesGoal) / caloriesGoal);
  const proteinScore = clamp01(protein / proteinGoal);
  const carbsScore = clamp01(1 - Math.abs(carbs - carbsGoal) / carbsGoal);
  const fatsScore = clamp01(1 - Math.abs(fats - fatsGoal) / fatsGoal);
  const waterScore = clamp01(waterMl / waterGoal);
  const nutritionScore = Math.round(calScore * 30 + proteinScore * 25 + carbsScore * 15 + fatsScore * 10 + waterScore * 20);

  const breakdown = [
    { label: "Calories", color: T.gold },
    { label: "Protein", color: T.coral },
    { label: "Carbs", color: T.brass },
    { label: "Fats", color: T.sky },
    { label: "Water", color: T.sky },
  ];

  const isToday = selectedDate === todayStr();

  return (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Eyebrow color={T.gold}>Fuel & Hydration</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Nutrition</h2>
        </div>
        <div className="flex items-center gap-3">
          <NutritionDateNav date={selectedDate} setDate={setSelectedDate} />
          <PrimaryBtn color={T.gold} onClick={() => setShowAdd(true)}><Plus size={16} /> Log meal</PrimaryBtn>
        </div>
      </div>

      <NutritionScoreCard score={nutritionScore} breakdown={breakdown} />

      <FavoriteMealsPanel favoriteMeals={favoriteMeals} onLog={logFavorite} onRemove={removeFavorite} />

      {isToday ? (
        <MealSuggestionsPanel
          remainingCalories={caloriesGoal - consumed}
          remainingProtein={Math.max(0, proteinGoal - protein)}
          favoriteMeals={favoriteMeals}
          onLog={logFavorite}
        />
      ) : (
        <Panel style={{ padding: 16 }}>
          <Eyebrow icon={Target} color={T.gold}>Meal Suggestions</Eyebrow>
          <div style={{ color: T.muted, fontSize: 12.5, marginTop: 4 }}>Suggestions are based on today's remaining budget — jump to today to see them.</div>
        </Panel>
      )}

      <Panel style={{ padding: 18 }}>
        <Eyebrow color={T.gold}>Today's Rings</Eyebrow>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-1">
          <Ring pct={caloriesGoal ? consumed / caloriesGoal : 0} color={T.gold} size={84} stroke={8} label="kcal" value={consumed} />
          <Ring pct={proteinGoal ? protein / proteinGoal : 0} color={T.coral} size={84} stroke={8} label="protein g" value={protein} />
          <Ring pct={carbsGoal ? carbs / carbsGoal : 0} color={T.brass} size={84} stroke={8} label="carbs g" value={carbs} />
          <Ring pct={fatsGoal ? fats / fatsGoal : 0} color={T.sky} size={84} stroke={8} label="fats g" value={fats} />
        </div>
      </Panel>

      <div className="grid md:grid-cols-2 gap-4">
        <MacroBreakdownChart protein={protein} carbs={carbs} fats={fats} />
        <WaterTracker ml={waterMl} goal={waterGoal} onSet={setWater} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <WeeklyProgress calorieLog={calorieLog} caloriesGoal={caloriesGoal} />
        <NutritionInsightsPanel calorieLog={calorieLog} workouts={workouts} />
      </div>

      <MealTimeline entries={dayEntries} onUpdate={updateMeal} onRemove={removeMeal} onSaveFavorite={addFavorite} favoriteMeals={favoriteMeals} />

      <NutritionFAB onClick={() => setShowAdd(true)} />

      {showAdd && <AddMealModal recentNames={recentNames} onClose={() => setShowAdd(false)} onAdd={addMeal} onAddFavorite={addFavorite} />}
    </div>
  );
}
/* ================= App Error Boundary ================= */

// FIX: a basic error boundary so a malformed import or a bug in one module
// doesn't take down the entire app with a blank white screen.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: T.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center", color: T.text, fontFamily: "Inter, sans-serif" }}>
            <AlertTriangle size={28} color={T.coral} style={{ margin: "0 auto 12px" }} />
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, marginBottom: 8 }}>Something went wrong</div>
            <div style={{ color: T.muted, fontSize: 13, marginBottom: 16 }}>
              {this.state.error?.message || "An unexpected error occurred while rendering LifeOS."}
            </div>
            <PrimaryBtn onClick={() => window.location.reload()}>Reload</PrimaryBtn>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ================= APP SHELL ================= */

function CommandPalette({ open, onClose, actions }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);

  const filtered = useMemo(() => {
    if (!q.trim()) return actions;
    const s = q.toLowerCase();
    return actions.filter(a => a.label.toLowerCase().includes(s) || a.group.toLowerCase().includes(s));
  }, [q, actions]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter") { e.preventDefault(); const a = filtered[idx]; if (a) { a.run(); onClose(); } }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, idx, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-24 p-4"
      style={{ background: "rgba(6,8,11,0.72)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">
        <Panel style={{ background: T.surface2, boxShadow: "0 24px 64px -12px rgba(0,0,0,0.6)" }}>
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Search size={17} color={T.muted} />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setIdx(0); }}
              placeholder="Jump to a module or run a quick action…"
              aria-label="Search commands"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: T.text, fontFamily: "Inter, sans-serif" }}
            />
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: T.muted, border: `1px solid ${T.line}` }}>esc</span>
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto" }} className="py-1.5">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-sm text-center" style={{ color: T.muted }}>No matches.</div>
            )}
            {filtered.map((a, i) => {
              const Icon = a.icon;
              const active = i === idx;
              return (
                <button
                  key={a.label}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => { a.run(); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm"
                  style={{ background: active ? T.surface : "transparent", color: active ? T.text : T.muted }}
                >
                  <Icon size={16} color={active ? a.color : T.muted} />
                  <span className="flex-1">{a.label}</span>
                  <span className="text-xs" style={{ color: T.muted }}>{a.group}</span>
                  {active && <CornerDownLeft size={13} color={T.muted} />}
                </button>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ================= RELATIONSHIPS module ================= */

const RELATIONSHIP_TYPES = [
  { id: "Family", color: T.coral },
  { id: "Friend", color: T.sky },
  { id: "Partner", color: T.violet },
  { id: "Colleague", color: T.brass },
  { id: "Other", color: T.muted },
];
const relationshipColor = (r) => (RELATIONSHIP_TYPES.find(t => t.id === r) || RELATIONSHIP_TYPES[4]).color;

function initialsFor(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
}

function nextOccurrenceFromDate(fullDateStr) {
  if (!fullDateStr) return null;
  const [, m, d] = fullDateStr.split("-");
  const today = new Date(todayStr() + "T00:00:00");
  let year = today.getFullYear();
  let candidate = new Date(`${year}-${m}-${d}T00:00:00`);
  if (candidate < today) { year += 1; candidate = new Date(`${year}-${m}-${d}T00:00:00`); }
  const daysUntil = Math.round((candidate - today) / 86400000);
  return { date: candidate.toISOString().slice(0, 10), daysUntil };
}

function ageTurning(birthDateStr) {
  if (!birthDateStr) return null;
  const birthYear = parseInt(birthDateStr.slice(0, 4), 10);
  const next = nextOccurrenceFromDate(birthDateStr);
  if (!next) return null;
  return parseInt(next.date.slice(0, 4), 10) - birthYear;
}

function daysUntilColor(days) {
  if (days <= 7) return T.coral;
  if (days <= 30) return T.gold;
  return T.muted;
}

function buildUpcomingDates(people) {
  const items = [];
  people.forEach(p => {
    if (p.birthday) {
      const next = nextOccurrenceFromDate(p.birthday);
      if (next) items.push({ id: `bday-${p.id}`, personId: p.id, label: `${p.name}'s birthday${ageTurning(p.birthday) != null ? ` (turning ${ageTurning(p.birthday)})` : ""}`, date: next.date, daysUntil: next.daysUntil, icon: Cake, color: relationshipColor(p.relationship) });
    }
    (p.importantDates || []).forEach(d => {
      const next = nextOccurrenceFromDate(d.date);
      if (next) items.push({ id: `date-${d.id}`, personId: p.id, label: `${p.name}: ${d.label}`, date: next.date, daysUntil: next.daysUntil, icon: Calendar, color: relationshipColor(p.relationship) });
    });
  });
  return items.sort((a, b) => a.daysUntil - b.daysUntil);
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(todayStr() + "T00:00:00") - new Date(dateStr + "T00:00:00")) / 86400000);
}

function UpcomingDatesPanel({ people }) {
  const upcoming = useMemo(() => buildUpcomingDates(people).filter(i => i.daysUntil <= 90).slice(0, 10), [people]);
  return (
    <Panel style={{ padding: 16 }}>
      <Eyebrow icon={Cake} color={T.coral}>Upcoming Dates</Eyebrow>
      {upcoming.length === 0 ? (
        <div style={{ color: T.muted, fontSize: 12.5, marginTop: 6 }}>Nothing in the next 90 days.</div>
      ) : (
        <div className="space-y-2 mt-2">
          {upcoming.map(i => {
            const Icon = i.icon;
            const color = daysUntilColor(i.daysUntil);
            return (
              <div key={i.id} className="flex items-center gap-2.5 text-sm">
                <Icon size={13} color={i.color} style={{ flexShrink: 0 }} />
                <span style={{ color: T.text, flex: 1 }}>{i.label}</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, color }}>
                  {i.daysUntil === 0 ? "Today" : i.daysUntil === 1 ? "Tomorrow" : `${i.daysUntil}d`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function GiftIdeaRow({ g, onToggle, onRemove }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <button onClick={onToggle}>
        {g.done ? <CheckCircle2 size={15} color={T.gold} /> : <Circle size={15} color={T.line} />}
      </button>
      <span style={{ color: g.done ? T.muted : T.text, textDecoration: g.done ? "line-through" : "none", flex: 1 }}>{g.text}</span>
      <IconBtn title="Remove idea" danger onClick={onRemove}><Trash2 size={13} /></IconBtn>
    </div>
  );
}

function PersonDetailDrawer({ person, onClose, onUpdate, onDelete }) {
  const [notes, setNotes] = useState(person.notes || "");
  const [newGift, setNewGift] = useState("");
  const [newDateLabel, setNewDateLabel] = useState("");
  const [newDateValue, setNewDateValue] = useState("");

  const color = relationshipColor(person.relationship);
  const saveNotes = () => onUpdate(person.id, { notes });

  const addGift = () => {
    if (!newGift.trim()) return;
    onUpdate(person.id, { giftIdeas: [...(person.giftIdeas || []), { id: uid(), text: newGift.trim(), done: false }] });
    setNewGift("");
  };
  const toggleGift = (id) => onUpdate(person.id, { giftIdeas: (person.giftIdeas || []).map(g => g.id === id ? { ...g, done: !g.done } : g) });
  const removeGift = (id) => onUpdate(person.id, { giftIdeas: (person.giftIdeas || []).filter(g => g.id !== id) });

  const addDate = () => {
    if (!newDateLabel.trim() || !newDateValue) return;
    onUpdate(person.id, { importantDates: [...(person.importantDates || []), { id: uid(), label: newDateLabel.trim(), date: newDateValue }] });
    setNewDateLabel(""); setNewDateValue("");
  };
  const removeDate = (id) => onUpdate(person.id, { importantDates: (person.importantDates || []).filter(d => d.id !== id) });

  const markContacted = () => onUpdate(person.id, { lastContact: todayStr() });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(6,8,11,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-sm overflow-y-auto" style={{ background: T.surface2, borderLeft: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: color + "22", color }}>{initialsFor(person.name)}</div>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 17, color: T.text }}>{person.name}</div>
          </div>
          <IconBtn title="Close" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Eyebrow>Relationship</Eyebrow>
              <Select value={person.relationship} onChange={e => onUpdate(person.id, { relationship: e.target.value })}>
                {RELATIONSHIP_TYPES.map(t => <option key={t.id}>{t.id}</option>)}
              </Select>
            </div>
            <div>
              <Eyebrow icon={Cake}>Birthday</Eyebrow>
              <Input type="date" value={person.birthday || ""} onChange={e => onUpdate(person.id, { birthday: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Eyebrow icon={Phone}>Staying in touch</Eyebrow>
            </div>
            <div className="flex items-center gap-3 text-sm mb-2">
              <span style={{ color: T.muted }}>
                {person.lastContact ? `Last contact: ${fmtDate(person.lastContact)} (${daysSince(person.lastContact)}d ago)` : "No contact logged yet"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={markContacted} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: T.teal + "22", color: T.teal }}>
                Mark contacted today
              </button>
              <div className="flex items-center gap-1.5">
                <span style={{ color: T.muted, fontSize: 11.5 }}>Remind every</span>
                <Input type="number" value={person.contactFrequencyDays || ""} onChange={e => onUpdate(person.id, { contactFrequencyDays: parseInt(e.target.value, 10) || null })} style={{ width: 60 }} placeholder="days" />
              </div>
            </div>
          </div>

          <div>
            <Eyebrow icon={Calendar}>Important dates</Eyebrow>
            <div className="space-y-1.5 mb-2">
              {(person.importantDates || []).map(d => (
                <div key={d.id} className="flex items-center gap-2 text-sm">
                  <span style={{ color: T.text, flex: 1 }}>{d.label}</span>
                  <span style={{ color: T.muted, fontSize: 11.5 }}>{fmtDate(d.date)}</span>
                  <IconBtn title="Remove date" danger onClick={() => removeDate(d.id)}><Trash2 size={13} /></IconBtn>
                </div>
              ))}
              {(person.importantDates || []).length === 0 && <div style={{ color: T.muted, fontSize: 12.5 }}>Anniversaries, first-met day, etc.</div>}
            </div>
            <div className="flex gap-2">
              <Input value={newDateLabel} onChange={e => setNewDateLabel(e.target.value)} placeholder="Label" style={{ flex: 2 }} />
              <Input type="date" value={newDateValue} onChange={e => setNewDateValue(e.target.value)} style={{ flex: 1 }} />
              <button onClick={addDate} className="px-3 rounded-lg" style={{ background: T.surface, color, border: `1px solid ${T.line}` }}><Plus size={16} /></button>
            </div>
          </div>

          <div>
            <Eyebrow icon={Gift}>Gift ideas</Eyebrow>
            <div className="space-y-1.5 mb-2">
              {(person.giftIdeas || []).map(g => (
                <GiftIdeaRow key={g.id} g={g} onToggle={() => toggleGift(g.id)} onRemove={() => removeGift(g.id)} />
              ))}
              {(person.giftIdeas || []).length === 0 && <div style={{ color: T.muted, fontSize: 12.5 }}>Nothing saved yet.</div>}
            </div>
            <div className="flex gap-2">
              <Input value={newGift} onChange={e => setNewGift(e.target.value)} placeholder="Add an idea…" onKeyDown={e => e.key === "Enter" && addGift()} />
              <button onClick={addGift} className="px-3 rounded-lg" style={{ background: T.surface, color: T.gold, border: `1px solid ${T.line}` }}><Plus size={16} /></button>
            </div>
          </div>

          <div>
            <Eyebrow icon={AlignLeft}>Notes</Eyebrow>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} rows={4}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text, fontFamily: "Inter, sans-serif" }}
              placeholder="Likes, dislikes, things to remember…"
            />
          </div>

          <button onClick={() => { onDelete(person.id); onClose(); }} className="flex items-center gap-2 text-sm font-medium" style={{ color: T.coral }}>
            <Trash2 size={15} /> Remove person
          </button>
        </div>
      </div>
    </div>
  );
}

function PersonCard({ person, onUpdate, onDelete, onOpenDetail, onTogglePin }) {
  const color = relationshipColor(person.relationship);
  const nextDates = useMemo(() => buildUpcomingDates([person]), [person]);
  const soonest = nextDates[0];
  const pendingGifts = (person.giftIdeas || []).filter(g => !g.done).length;

  const dSince = daysSince(person.lastContact);
  const overdue = person.contactFrequencyDays && (dSince == null || dSince >= person.contactFrequencyDays);

  return (
    <Panel style={{ padding: 16 }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: color + "22", color }}>
            {initialsFor(person.name)}
          </div>
          <div>
            <button onClick={onOpenDetail} className="text-left">
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 16, color: T.text }}>{person.name}</div>
            </button>
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>{person.relationship}</div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <IconBtn title={person.pinned ? "Unpin" : "Pin"} onClick={onTogglePin}>
            <Star size={14} color={person.pinned ? T.gold : T.muted} fill={person.pinned ? T.gold : "none"} />
          </IconBtn>
          <IconBtn title="Remove" danger onClick={onDelete}><Trash2 size={14} /></IconBtn>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {soonest && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: daysUntilColor(soonest.daysUntil) }}>
            <Cake size={12} /> {soonest.label.replace(`${person.name}'s `, "").replace(`${person.name}: `, "")} — {soonest.daysUntil === 0 ? "today" : soonest.daysUntil === 1 ? "tomorrow" : `in ${soonest.daysUntil}d`}
          </div>
        )}
        {overdue && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: T.coral }}>
            <Phone size={12} /> Reach out — {dSince != null ? `it's been ${dSince}d` : "no contact logged yet"}
          </div>
        )}
        {pendingGifts > 0 && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: T.gold }}>
            <Gift size={12} /> {pendingGifts} gift idea{pendingGifts === 1 ? "" : "s"} saved
          </div>
        )}
      </div>

      <button onClick={onOpenDetail} className="mt-3 text-xs font-semibold" style={{ color: T.muted }}>View details →</button>
    </Panel>
  );
}

function RelationshipsModule({ people, setPeople }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("Friend");
  const [birthday, setBirthday] = useState("");
  const [filter, setFilter] = useState("all");
  const [detailId, setDetailId] = useState(null);

  const addPerson = () => {
    if (!name.trim()) return;
    setPeople([{
      id: uid(), name: name.trim(), relationship, birthday, pinned: false,
      lastContact: "", contactFrequencyDays: null, importantDates: [], giftIdeas: [], notes: "",
    }, ...people]);
    setName(""); setBirthday(""); setRelationship("Friend"); setShowAdd(false);
  };

  const updatePerson = (id, updates) => setPeople(people.map(p => p.id === id ? { ...p, ...updates } : p));
  const removePerson = (id) => { setPeople(people.filter(p => p.id !== id)); if (detailId === id) setDetailId(null); };
  const togglePin = (id) => setPeople(people.map(p => p.id === id ? { ...p, pinned: !p.pinned } : p));

  const visible = people
    .filter(p => filter === "all" || p.relationship === filter)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const stats = useMemo(() => {
    const upcoming30 = buildUpcomingDates(people).filter(i => i.daysUntil <= 30).length;
    const overdueCount = people.filter(p => {
      if (!p.contactFrequencyDays) return false;
      const d = daysSince(p.lastContact);
      return d == null || d >= p.contactFrequencyDays;
    }).length;
    const giftCount = people.reduce((s, p) => s + (p.giftIdeas || []).filter(g => !g.done).length, 0);
    return { total: people.length, upcoming30, overdueCount, giftCount };
  }, [people]);

  const detailPerson = people.find(p => p.id === detailId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Eyebrow color={T.coral}>Staying Connected</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Relationships</h2>
        </div>
        <PrimaryBtn color={T.coral} onClick={() => setShowAdd(true)}><Plus size={16} /> Add person</PrimaryBtn>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Panel style={{ padding: 16 }}>
          <Eyebrow>People</Eyebrow>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.text }}>{stats.total}</div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <Eyebrow color={T.gold}>Next 30 days</Eyebrow>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.gold }}>{stats.upcoming30}</div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <Eyebrow color={T.coral}>Reach out</Eyebrow>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.coral }}>{stats.overdueCount}</div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <Eyebrow color={T.violet}>Gift ideas</Eyebrow>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: T.violet }}>{stats.giftCount}</div>
        </Panel>
      </div>

      <UpcomingDatesPanel people={people} />

      <div className="flex flex-wrap gap-2">
        {[{ id: "all", label: "All" }, ...RELATIONSHIP_TYPES].map(f => {
          const active = filter === f.id;
          const color = f.color || T.muted;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: active ? color + "22" : T.surface2, color: active ? color : T.muted, border: `1px solid ${active ? color : T.line}` }}>
              {f.label || f.id}
            </button>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {visible.map(p => (
          <PersonCard
            key={p.id} person={p}
            onUpdate={(updates) => updatePerson(p.id, updates)}
            onDelete={() => removePerson(p.id)}
            onOpenDetail={() => setDetailId(p.id)}
            onTogglePin={() => togglePin(p.id)}
          />
        ))}
        {visible.length === 0 && (
          <div className="col-span-2 text-center py-10" style={{ color: T.muted }}>
            {people.length === 0 ? "No one added yet — start with the people who matter most." : "No one matches this filter."}
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Add person" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div>
              <Eyebrow>Name</Eyebrow>
              <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Sharma" onKeyDown={e => e.key === "Enter" && addPerson()} />
            </div>
            <div>
              <Eyebrow>Relationship</Eyebrow>
              <Select value={relationship} onChange={e => setRelationship(e.target.value)}>
                {RELATIONSHIP_TYPES.map(t => <option key={t.id}>{t.id}</option>)}
              </Select>
            </div>
            <div>
              <Eyebrow icon={Cake}>Birthday (optional)</Eyebrow>
              <Input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} />
            </div>
            <PrimaryBtn color={T.coral} onClick={addPerson} style={{ width: "100%", justifyContent: "center" }}>Add person</PrimaryBtn>
          </div>
        </Modal>
      )}

      {detailPerson && (
        <PersonDetailDrawer person={detailPerson} onClose={() => setDetailId(null)} onUpdate={updatePerson} onDelete={removePerson} />
      )}
    </div>
  );
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function TravelModule({ trips, setTrips }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", destination: "", startDate: "", endDate: "", notes: "", youtubeUrl: "" });

  const addTrip = () => {
    if (!form.title.trim() || !form.destination.trim()) return;
    const nextTrip = { id: uid(), title: form.title.trim(), destination: form.destination.trim(), startDate: form.startDate, endDate: form.endDate, notes: form.notes.trim(), youtubeUrl: form.youtubeUrl.trim(), createdAt: todayStr() };
    setTrips(prev => [nextTrip, ...(Array.isArray(prev) ? prev : [])]);
    setForm({ title: "", destination: "", startDate: "", endDate: "", notes: "", youtubeUrl: "" });
    setShowAdd(false);
  };

  const removeTrip = (id) => setTrips(prev => (Array.isArray(prev) ? prev.filter(t => t.id !== id) : []));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Eyebrow color={T.violet}>Trips & memories</Eyebrow>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, color: T.text }}>Travel</h2>
        </div>
        <PrimaryBtn color={T.violet} onClick={() => setShowAdd(true)}><Plus size={16} /> Add trip</PrimaryBtn>
      </div>

      {trips.length === 0 ? (
        <Panel style={{ padding: 18 }}>
          <div style={{ color: T.muted }}>No trips yet. Add your next adventure and keep the memories close.</div>
        </Panel>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {trips.map(trip => {
            const ytId = extractYouTubeId(trip.youtubeUrl);
            return (
              <Panel key={trip.id} style={{ padding: 18 }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: T.violet + "22", color: T.violet }}>
                        <Plane size={16} />
                      </div>
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, color: T.text }}>{trip.title}</div>
                    </div>
                    <div className="text-sm" style={{ color: T.muted }}>{trip.destination}</div>
                  </div>
                  <IconBtn title="Remove trip" danger onClick={() => removeTrip(trip.id)}><Trash2 size={15} /></IconBtn>
                </div>

                <div className="mt-3 space-y-2 text-sm">
                  {(trip.startDate || trip.endDate) && (
                    <div className="flex items-center gap-2" style={{ color: T.text }}>
                      <Calendar size={14} /> {trip.startDate || "—"}{trip.startDate && trip.endDate ? " → " : ""}{trip.endDate || ""}
                    </div>
                  )}
                  {trip.notes && <div style={{ color: T.muted }}>{trip.notes}</div>}
                  {ytId && (
                    <div className="mt-2 overflow-hidden rounded-xl" style={{ border: `1px solid ${T.line}` }}>
                      <iframe
                        width="100%"
                        height="180"
                        src={`https://www.youtube.com/embed/${ytId}`}
                        title={`${trip.title} video`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {showAdd && (
        <Modal title="Add trip" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div>
              <Eyebrow>Trip title</Eyebrow>
              <Input autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Tokyo Spring" onKeyDown={e => e.key === "Enter" && addTrip()} />
            </div>
            <div>
              <Eyebrow>Destination</Eyebrow>
              <Input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} placeholder="e.g. Kyoto, Japan" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Eyebrow>Start date</Eyebrow>
                <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <Eyebrow>End date</Eyebrow>
                <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Eyebrow>Notes</Eyebrow>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Highlights, plans, or memories" />
            </div>
            <div>
              <Eyebrow icon={Video}>YouTube link</Eyebrow>
              <Input value={form.youtubeUrl} onChange={e => setForm({ ...form, youtubeUrl: e.target.value })} placeholder="Optional" />
            </div>
            <PrimaryBtn color={T.violet} onClick={addTrip} style={{ width: "100%", justifyContent: "center" }}>Save trip</PrimaryBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid, color: T.brass },
  { id: "habits", label: "Habits", icon: Flame, color: T.brass },
  { id: "tasks", label: "Tasks", icon: ListTodo, color: T.sky },
  { id: "goals", label: "Goals", icon: Target, color: T.violet },
  { id: "finance", label: "Finance", icon: Wallet, color: T.teal },
  { id: "fitness", label: "Fitness", icon: Dumbbell, color: T.coral },
  { id: "nutrition", label: "Nutrition", icon: Utensils, color: T.gold },
  { id: "calendar", label: "Calendar", icon: Calendar, color: T.violet },
  { id: "learning", label: "Learning", icon: GraduationCap, color: T.violet },
  { id: "relationships", label: "Relationships", icon: Users, color: T.coral },
  { id: "travel", label: "Travel", icon: Luggage, color: T.violet },
  { id: "journal", label: "Journal", icon: BookOpen, color: T.gold },
];

const SETTINGS_NAV = { id: "settings", label: "Settings", icon: Settings2, color: T.muted };

function LifeOSApp() {
  const [tab, setTab] = useState("dashboard");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [habits, setHabits, hLoaded] = usePersisted("lifeos:habits", EMPTY_HABITS);
  const [goals, setGoals, gLoaded] = usePersisted("lifeos:goals", EMPTY_GOALS);
  const [tx, setTx, tLoaded] = usePersisted("lifeos:transactions", EMPTY_TX);
  const [workouts, setWorkouts, wLoaded] = usePersisted("lifeos:workouts", EMPTY_WORKOUTS);
  const [weight, setWeight, wgLoaded] = usePersisted("lifeos:weight", EMPTY_WEIGHT);
  const [tasks, setTasks, tkLoaded] = usePersisted("lifeos:tasks", EMPTY_TASKS);
  const [journal, setJournal, jLoaded] = usePersisted("lifeos:journal", EMPTY_JOURNAL);
  const [integrations, setIntegrations, iLoaded] = usePersisted("lifeos:integrations", EMPTY_INTEGRATIONS);
  const [schedule, setSchedule, scLoaded] = usePersisted("lifeos:schedule", EMPTY_SCHEDULE);
  const [vitals, setVitals, vLoaded] = usePersisted("lifeos:vitals", EMPTY_VITALS);
  const [profile, setProfile, pLoaded] = usePersisted("lifeos:profile", EMPTY_PROFILE);
  const [scoreLog, setScoreLog, slLoaded] = usePersisted("lifeos:scoreLog", {});
  const [calorieLog, setCalorieLog, clLoaded] = usePersisted("lifeos:calorieLog", EMPTY_CALORIELOG);
  const [waterLog, setWaterLog, wtLoaded] = usePersisted("lifeos:waterLog", EMPTY_WATERLOG);
  const [favoriteMeals, setFavoriteMeals, fmLoaded] = usePersisted("lifeos:favoriteMeals", []);
  const [calendarEvents, setCalendarEvents, ceLoaded] = usePersisted("lifeos:calendarEvents", []);
  const [learningItems, setLearningItems, liLoaded] = usePersisted("lifeos:learningItems", []);
  const [people, setPeople, ppLoaded] = usePersisted("lifeos:people", []);
  const [trips, setTrips, trLoaded] = usePersisted("lifeos:trips", []);
  const [settingsPassword, setSettingsPassword, spLoaded] = usePersisted("lifeos:settingsPassword", "1234");
  const [dashboardOrder, setDashboardOrder, doLoaded] = usePersisted("lifeos:dashboardOrder", DEFAULT_DASHBOARD_ORDER);
  const [assistantMessages, setAssistantMessages, amLoaded] = usePersisted("lifeos:assistantMessages", []);
  const [lastBriefingDate, setLastBriefingDate, lbLoaded] = usePersisted("lifeos:lastBriefingDate", "");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);

  const ready = hLoaded && gLoaded && tLoaded && wLoaded && wgLoaded && tkLoaded && jLoaded && iLoaded && scLoaded && vLoaded && pLoaded && slLoaded && clLoaded && wtLoaded && fmLoaded && spLoaded && ceLoaded && liLoaded && ppLoaded && trLoaded && doLoaded && amLoaded && lbLoaded;

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const paletteActions = [
    ...NAV.map(n => ({ label: `Go to ${n.label}`, group: "Navigate", icon: n.icon, color: n.color, run: () => setTab(n.id) })),
    { label: "Go to Settings", group: "Navigate", icon: Settings2, color: T.muted, run: () => setTab("settings") },
    { label: "Mark a habit complete", group: "Habits", icon: Flame, color: T.brass, run: () => setTab("habits") },
    { label: "Add a task", group: "Tasks", icon: ListTodo, color: T.sky, run: () => setTab("tasks") },
    { label: "Log a transaction", group: "Finance", icon: Wallet, color: T.teal, run: () => setTab("finance") },
    { label: "Log a workout", group: "Fitness", icon: Dumbbell, color: T.coral, run: () => setTab("fitness") },
    { label: "Log a meal", group: "Nutrition", icon: Utensils, color: T.gold, run: () => setTab("nutrition") },
    { label: "Write in journal", group: "Journal", icon: BookOpen, color: T.gold, run: () => setTab("journal") },
    { label: "Add a goal", group: "Goals", icon: Target, color: T.violet, run: () => setTab("goals") },
  ];

  const allData = { habits, goals, transactions: tx, workouts, weight, tasks, journal, integrations, schedule, vitals, profile, calorieLog, waterLog, favoriteMeals, calendarEvents, learningItems, people, trips, dashboardOrder, exportedAt: new Date().toISOString() };

  const resetAllAppData = () => {
    setHabits(EMPTY_HABITS);
    setGoals(EMPTY_GOALS);
    setTx(EMPTY_TX);
    setWorkouts(EMPTY_WORKOUTS);
    setWeight(EMPTY_WEIGHT);
    setTasks(EMPTY_TASKS);
    setJournal(EMPTY_JOURNAL);
    setIntegrations(EMPTY_INTEGRATIONS);
    setSchedule(EMPTY_SCHEDULE);
    setVitals(EMPTY_VITALS);
    setProfile(EMPTY_PROFILE);
    setScoreLog({});
    setCalorieLog(EMPTY_CALORIELOG);
    setWaterLog(EMPTY_WATERLOG);
    setFavoriteMeals([]);
    setCalendarEvents([]);
    setLearningItems([]);
    setPeople([]);
    setTrips([]);
    setDashboardOrder(DEFAULT_DASHBOARD_ORDER);
    setTab("dashboard");
    setPaletteOpen(false);
  };

  // FIX: validate the shape of an imported backup before applying it, so a
  // corrupted or foreign JSON file can't silently break app state (and the
  // existing try/catch in SettingsModule can now actually catch bad shapes).
  const applyImport = (data) => {
    if (!data || typeof data !== "object") throw new Error("Invalid backup file — not a LifeOS export.");
    if (Array.isArray(data.habits)) setHabits(data.habits);
    if (Array.isArray(data.goals)) setGoals(data.goals);
    if (Array.isArray(data.transactions)) setTx(data.transactions);
    if (Array.isArray(data.workouts)) setWorkouts(data.workouts);
    if (Array.isArray(data.weight)) setWeight(data.weight);
    if (Array.isArray(data.dashboardOrder)) setDashboardOrder(reconcileWidgetOrder(data.dashboardOrder));
    if (Array.isArray(data.tasks)) setTasks(data.tasks);
    if (Array.isArray(data.journal)) setJournal(data.journal);
    if (data.integrations && typeof data.integrations === "object" && !Array.isArray(data.integrations)) setIntegrations(data.integrations);
    if (Array.isArray(data.schedule)) setSchedule(data.schedule);
    if (data.vitals && typeof data.vitals === "object" && !Array.isArray(data.vitals)) setVitals(data.vitals);
    if (data.profile && typeof data.profile === "object" && !Array.isArray(data.profile)) setProfile(data.profile);
    if (Array.isArray(data.calorieLog)) setCalorieLog(data.calorieLog);
    if (data.waterLog && typeof data.waterLog === "object" && !Array.isArray(data.waterLog)) setWaterLog(data.waterLog);
    if (Array.isArray(data.favoriteMeals)) setFavoriteMeals(data.favoriteMeals);
    if (Array.isArray(data.calendarEvents)) setCalendarEvents(data.calendarEvents);
    if (Array.isArray(data.learningItems)) setLearningItems(data.learningItems);
    if (Array.isArray(data.people)) setPeople(data.people);
    if (Array.isArray(data.trips)) setTrips(data.trips);
  };

  const assistantActions = { tasks, setTasks, habits, setHabits, tx, setTx, calorieLog, setCalorieLog, journal, setJournal, goals, setGoals };

  const runAssistantTurn = async (apiMessages) => {
    const data = await callAssistantAPI(apiMessages, ASSISTANT_SYSTEM_PROMPT + "\n\nCONTEXT:\n" + buildAssistantContext({ habits, tasks, goals, tx, vitals, calorieLog, workouts, journal }));
    const toolUses = (data.content || []).filter(b => b.type === "tool_use");
    const textBlocks = (data.content || []).filter(b => b.type === "text").map(b => b.text || b.content || "").filter(Boolean).join("\n");

    if (toolUses.length > 0) {
      const actionSummaries = toolUses.map(tu => executeAssistantTool(tu.name, tu.input, assistantActions));
      setAssistantMessages(prev => [...prev, ...actionSummaries.map(s => ({ role: "action", content: s }))]);
      const toolResultsMsg = { role: "user", content: toolUses.map((tu, i) => ({ type: "tool_result", tool_use_id: tu.id, content: actionSummaries[i] })) };
      const followUp = [...apiMessages, { role: "assistant", content: data.content }, toolResultsMsg];
      return runAssistantTurn(followUp);
    }

    return textBlocks || "I'm done processing your request.";
  };

  const sendAssistantMessage = async (userText) => {
    setAssistantMessages(prev => [...prev, { role: "user", content: userText }]);
    setAssistantLoading(true);
    try {
      const history = assistantMessages.filter(m => m.role === "user" || m.role === "assistant").slice(-16).map(m => ({ role: m.role, content: m.content }));
      const reply = await runAssistantTurn([...history, { role: "user", content: userText }]);
      setAssistantMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setAssistantMessages(prev => [...prev, { role: "assistant", content: "Something went wrong reaching the assistant — try again in a moment." }]);
    } finally {
      setAssistantLoading(false);
    }
  };

  useEffect(() => {
    if (!assistantOpen || lastBriefingDate === todayStr()) return;
    setLastBriefingDate(todayStr());
    (async () => {
      setAssistantLoading(true);
      try {
        const reply = await runAssistantTurn([{ role: "user", content: "Give me a short, warm daily briefing based on my current data. Highlight the one thing most worth focusing on today." }]);
        setAssistantMessages(prev => [...prev, { role: "assistant", content: reply }]);
      } finally {
        setAssistantLoading(false);
      }
    })();
  }, [assistantOpen]);

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      <style>{FONT_IMPORT}{`
        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${T.line}; border-radius: 4px; }
        ::selection { background: ${T.sky}55; color: ${T.text}; }
        table { width: 100%; }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline: 2px solid ${T.sky}; outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <div className="hidden md:flex flex-col w-60 shrink-0 p-4 md:sticky md:top-0 md:h-screen md:overflow-y-auto" style={{ borderRight: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2.5 px-2 py-3 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${GRAD[T.brass][0]}, ${GRAD[T.brass][1]})`, boxShadow: glow(T.brass, 0.4) }}
            >
              <Sparkles size={16} color="#14161C" />
            </div>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, color: T.text, letterSpacing: "-0.01em" }}>LifeOS</div>
          </div>

          <button
            onClick={() => setPaletteOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-4 transition-colors"
            style={{ background: T.surface2, color: T.muted, border: `1px solid ${T.line}` }}
          >
            <Search size={15} />
            <span className="flex-1 text-left">Search</span>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ border: `1px solid ${T.line}` }}>⌘K</span>
          </button>

          <nav className="flex-1 space-y-0.5">
            {NAV.map(n => {
              const Icon = n.icon;
              const active = tab === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setTab(n.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: active ? T.surface2 : "transparent",
                    color: active ? T.text : T.muted,
                    boxShadow: active ? `inset 2px 0 0 ${n.color}, 0 0 20px -8px ${n.color}66` : "none",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.surface2 + "88"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <Icon size={17} color={active ? n.color : T.muted} />
                  {n.label}
                </button>
              );
            })}
          </nav>
          <button
            onClick={() => setTab("settings")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-2"
            style={{
              background: tab === "settings" ? T.surface2 : "transparent",
              color: tab === "settings" ? T.text : T.muted,
              boxShadow: tab === "settings" ? `inset 2px 0 0 ${T.muted}` : "none",
            }}
          >
            <Settings2 size={17} color={T.muted} /> Settings
          </button>
          <div className="px-3 py-2 text-xs" style={{ color: T.muted }}>
            Data is saved automatically.
          </div>
        </div>

        {/* Mobile bottom nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex overflow-x-auto py-2 px-1" style={{ background: T.surface, borderTop: `1px solid ${T.line}` }}>
          {[...NAV, SETTINGS_NAV].map(n => {
            const Icon = n.icon;
            const active = tab === n.id;
            return (
              <button key={n.id} onClick={() => setTab(n.id)} className="flex flex-col items-center gap-0.5 px-3 py-1 shrink-0">
                <Icon size={18} color={active ? n.color : T.muted} />
                <span style={{ fontSize: 10, color: active ? T.text : T.muted }}>{n.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main content */}
        <div className="flex-1 p-5 md:p-8 pb-24 md:pb-8 max-w-6xl mx-auto w-full">
          <button
            onClick={() => setPaletteOpen(true)}
            className="md:hidden w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm mb-4"
            style={{ background: T.surface2, color: T.muted, border: `1px solid ${T.line}` }}
          >
            <Search size={15} /> Search or run a quick action…
          </button>
          {!ready ? (
            <div style={{ color: T.muted }}>Loading LifeOS…</div>
          ) : (
            <>
              {tab !== "dashboard" && (
                <button
                  onClick={() => setTab("dashboard")}
                  className="flex items-center gap-1.5 mb-4 text-sm font-medium transition-colors"
                  style={{ color: T.muted }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = T.muted)}
                >
                  <ChevronLeft size={18} /> Back
                </button>
              )}
              {tab === "dashboard" && (
                <Dashboard
                  habits={habits} setHabits={setHabits}
                  goals={goals}
                  tx={tx}
                  workouts={workouts}
                  tasks={tasks} setTasks={setTasks}
                  journal={journal}
                  schedule={schedule} setSchedule={setSchedule}
                  vitals={vitals} setVitals={setVitals}
                  profile={profile} setProfile={setProfile}
                  scoreLog={scoreLog} setScoreLog={setScoreLog}
                  calorieLog={calorieLog} setCalorieLog={setCalorieLog}
                  waterLog={waterLog} setWaterLog={setWaterLog}
                  dashboardOrder={dashboardOrder} setDashboardOrder={setDashboardOrder}
                  setTab={setTab}
                />
              )}
              {tab === "habits" && <HabitsModule habits={habits} setHabits={setHabits} />}
              {tab === "tasks" && <TasksModule tasks={tasks} setTasks={setTasks} />}
              {tab === "goals" && <GoalsModule goals={goals} setGoals={setGoals} />}
              {tab === "finance" && <FinanceModule tx={tx} setTx={setTx} />}
              {tab === "fitness" && <FitnessModule workouts={workouts} setWorkouts={setWorkouts} weight={weight} setWeight={setWeight} />}
              {tab === "nutrition" && <NutritionModule calorieLog={calorieLog} setCalorieLog={setCalorieLog} waterLog={waterLog} setWaterLog={setWaterLog} vitals={vitals} workouts={workouts} favoriteMeals={favoriteMeals} setFavoriteMeals={setFavoriteMeals} />}
              {tab === "calendar" && (
                <CalendarModule
                  tasks={tasks} setTasks={setTasks}
                  habits={habits}
                  workouts={workouts}
                  calorieLog={calorieLog}
                  tx={tx}
                  calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents}
                />
              )}
              {tab === "learning" && <LearningModule items={learningItems} setItems={setLearningItems} />}
              {tab === "relationships" && <RelationshipsModule people={people} setPeople={setPeople} />}
              {tab === "travel" && <TravelModule trips={trips} setTrips={setTrips} />}
              {tab === "journal" && <JournalModule journal={journal} setJournal={setJournal} />}
              {tab === "settings" && <SettingsModule allData={allData} applyImport={applyImport} integrations={integrations} setIntegrations={setIntegrations} workouts={workouts} setWorkouts={setWorkouts} resetAllAppData={resetAllAppData} settingsPassword={settingsPassword} setSettingsPassword={setSettingsPassword} />}
            </>
          )}
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
    </div>
  );
}

export default function LifeOS() {
  return (
    <ErrorBoundary>
      <LifeOSApp />
    </ErrorBoundary>
  );
}
