// src/components/Onboarding.tsx
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronRight, X, HelpCircle } from "lucide-react";

// ─── Tour Steps ───────────────────────────────────────────────────────────────
export type TourStep = {
  id: number;
  path: string;
  title: string;
  description: string;
  action: string;
  trigger: "manual" | "settings_saved" | "client_saved" | "engagement_saved" | "invoice_saved";
};

const TOUR_STEPS: TourStep[] = [
  {
    id: 1,
    path: "/settings",
    title: "Step 1 — Set up your firm",
    description: "Fill in your firm name, GSTIN, PAN, address and bank details. Upload your logo too. Hit Save Settings when done.",
    action: "Go to Settings",
    trigger: "settings_saved",
  },
  {
    id: 2,
    path: "/settings#website",
    title: "Step 2 — Set up your client website",
    description: "Add your WhatsApp number, tagline and select services to display on your client-facing website. Hit Save Settings when done.",
    action: "Set Up Website",
    trigger: "settings_saved",
  },
  {
    id: 3,
    path: "/settings#templates",
    title: "Step 3 — Customise your checklists",
    description: "Edit the documents you request from clients for each service type. Add your own service types like FSSAI or RERA. Hit Save Template when done.",
    action: "Go to Checklist Templates",
    trigger: "manual",
  },
  {
    id: 4,
    path: "/clients",
    title: "Step 4 — Add your first client",
    description: "Click Add Client. Fill in the details and tick the services they need — GST, ITR, TDS, PF. Compliance deadlines will be created automatically when you save.",
    action: "Add Client",
    trigger: "client_saved",
  },
  {
    id: 5,
    path: "/compliance",
    title: "Step 5 — Review compliance deadlines",
    description: "Your client\'s compliance calendar is ready. View upcoming and overdue deadlines here. Mark items as filed once done. Click Got it when you\'re ready.",
    action: "View Compliance",
    trigger: "manual",
  },
  {
    id: 6,
    path: "/staff",
    title: "Step 6 — Add your team (Maker-Checker)",
    description: "Add your staff members here. Every engagement has a Maker (who does the work) and a Checker (who reviews it). Only levels 1–5 — Partner, Director, Senior Manager, Manager, Assistant Manager — can approve. This ensures quality control on every assignment.",
    action: "Add Staff",
    trigger: "manual",
  },
  {
    id: 7,
    path: "/engagements",
    title: "Step 7 — Create your first engagement",
    description: "Click Add Engagement. Select the client and service type. Assign a Maker and Checker from your staff. Tick conditions like Has Capital Gains or Has Employees — the right documents auto-include in the checklist.",
    action: "Add Engagement",
    trigger: "engagement_saved",
  },
  {
    id: 8,
    path: "/clients#expiry",
    title: "Step 8 — Track document expiries",
    description: "Go to Clients → Document Expiry Tracker tab. Add DSC, FSSAI, Shop License, Insurance and other document expiry dates for each client. You'll get reminders 7 days before expiry on your dashboard.",
    action: "Open Expiry Tracker",
    trigger: "manual",
  },
  {
    id: 10,
    path: "/fee-estimator",
    title: "Step 9 — Not sure what to charge?",
    description: "Use the Fee Estimator to price any CA service confidently. Select the service, entity type and complexity — it gives you a market-based fee range. Never undercharge again.",
    action: "Open Fee Estimator",
    trigger: "manual",
  },
  {
    id: 11,
    path: "/invoices",
    title: "Step 9 — Send your first invoice",
    description: "Click Create Invoice. Select the client, add line items with GST. Download as PDF in Classic, Modern or Minimal theme. Outstanding invoices appear on your dashboard automatically.",
    action: "Create Invoice",
    trigger: "invoice_saved",
  },
  {
    id: 12,
    path: "/",
    title: "🎉 You\'re all set!",
    description: "Your dashboard shows what needs attention every day — DSC expiry, pending documents, overdue invoices and upcoming deadlines. Welcome to Firmora!",
    action: "Go to Dashboard",
    trigger: "manual",
  },
];

const STORAGE_KEY = "firmora_tour_step"; // current step (1-based), "done" if complete

// Navigate to "/path#hash" — router-aware so same-page hash changes also switch tabs
function goPath(navigate: ReturnType<typeof useNavigate>, path: string) {
  const [to, hash] = path.split("#");
  navigate({ to: to as any, hash: hash || undefined } as any);
}

// ─── Context ──────────────────────────────────────────────────────────────────
type TourContextType = {
  currentStep: number | null;
  totalSteps: number;
  isActive: boolean;
  next: () => void;
  prev: () => void;
  skip: () => void;
  restart: () => void;
  triggerEvent: (event: TourStep["trigger"]) => void;
};

const TourContext = createContext<TourContextType | null>(null);

const NOOP_TOUR: TourContextType = {
  currentStep: null,
  totalSteps: 0,
  isActive: false,
  next: () => {},
  prev: () => {},
  skip: () => {},
  restart: () => {},
  triggerEvent: () => {},
};

export function useTour() {
  const ctx = useContext(TourContext);
  return ctx ?? NOOP_TOUR; // Safe fallback — no throw
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "done") return null;      // Tour completed — hide
      if (!saved) return 1;                   // New user — start from step 1
      const n = parseInt(saved, 10);
      return isNaN(n) ? 1 : n;               // Resume from saved step
    } catch { return 1; }
  });

  const saveStep = (step: number | null) => {
    try {
      if (step === null) localStorage.setItem(STORAGE_KEY, "done");
      else localStorage.setItem(STORAGE_KEY, String(step));
    } catch {}
  };

  const goToStep = useCallback((step: number) => {
    const s = TOUR_STEPS[step - 1];
    if (!s) return;
    setCurrentStep(step);
    saveStep(step);
    goPath(navigate, s.path);
  }, [navigate]);

  const next = useCallback(() => {
    if (currentStep === null) return;
    const nextStep = currentStep + 1;
    if (nextStep > TOUR_STEPS.length) {
      setCurrentStep(null);
      saveStep(null);
      navigate({ to: "/" });
    } else {
      goToStep(nextStep);
    }
  }, [currentStep, goToStep, navigate]);

  const prev = useCallback(() => {
    if (currentStep === null || currentStep <= 1) return;
    goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  const skip = useCallback(() => {
    setCurrentStep(null);
    saveStep(null);
  }, []);

  const restart = useCallback(() => {
    goToStep(1);
  }, [goToStep]);

  const triggerEvent = useCallback((event: TourStep["trigger"]) => {
    if (currentStep === null || event === "manual") return;
    const s = TOUR_STEPS[currentStep - 1];
    if (s?.trigger === event) {
      // Small delay so save toast shows first
      setTimeout(() => {
        const nextStep = currentStep + 1;
        if (nextStep > TOUR_STEPS.length) {
          setCurrentStep(null);
          saveStep(null);
          navigate({ to: "/" });
        } else {
          goToStep(nextStep);
        }
      }, 1200);
    }
  }, [currentStep, goToStep, navigate]);

  return (
    <TourContext.Provider value={{
      currentStep,
      totalSteps: TOUR_STEPS.length,
      isActive: currentStep !== null,
      next,
      prev,
      skip,
      restart,
      triggerEvent,
    }}>
      {children}
    </TourContext.Provider>
  );
}

// ─── Floating Tour Card ───────────────────────────────────────────────────────
export function TourCard() {
  const { currentStep, totalSteps, isActive, next, prev, skip } = useTour();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const currentHash = useRouterState({ select: s => (s.location.hash ?? "").replace(/^#/, "") });
  const navigate = useNavigate();
  const [minimised, setMinimised] = useState(false);

  if (!isActive || currentStep === null) return null;

  const step = TOUR_STEPS[currentStep - 1];
  if (!step) return null;

  // Check if user is on correct page
  const [stepBasePath, stepHash] = step.path.split("#");
  const onCorrectPath = pathname === stepBasePath || (stepBasePath !== "/" && pathname.startsWith(stepBasePath));
  const onCorrectTab = !stepHash || currentHash === stepHash;
  const onCorrectPage = onCorrectPath && onCorrectTab;

  const isLast = currentStep === totalSteps;
  const pct = Math.round((currentStep / totalSteps) * 100);

  // Minimised pill
  if (minimised) {
    return (
      <button
        onClick={() => setMinimised(false)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-full shadow-xl text-sm font-semibold hover:bg-primary/90 transition-all"
      >
        <HelpCircle size={16} />
        Tour — Step {currentStep}/{totalSteps}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 md:right-6 z-50 pointer-events-none w-full md:w-[420px] md:left-auto left-4">
      <div className="pointer-events-auto">
        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>

          <div className="px-5 py-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {currentStep} of {totalSteps}
                </span>
                <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setMinimised(true)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Minimise">
                  <span className="text-xs font-bold">—</span>
                </button>
                <button onClick={skip} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Skip tour">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.description}</p>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3">
              <button onClick={skip} className="text-xs text-muted-foreground hover:text-red-500 font-medium">
                End tour
              </button>
              <div className="flex items-center gap-2">
                {/* Back */}
                {currentStep > 1 && (
                  <button onClick={prev} className="px-3 py-2 text-sm rounded-lg border border-input text-foreground hover:bg-muted font-medium">
                    ← Back
                  </button>
                )}
                {/* Skip this step */}
                {!isLast && (
                  <button onClick={next} className="px-3 py-2 text-sm rounded-lg border border-input text-muted-foreground hover:bg-muted font-medium">
                    Skip step
                  </button>
                )}
                {/* Navigate to correct page */}
                {!onCorrectPage && (
                  <button
                    onClick={() => goPath(navigate, step.path)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                  >
                    {step.action} <ChevronRight size={15} />
                  </button>
                )}
                {/* On correct page — manual trigger */}
                {onCorrectPage && step.trigger === "manual" && (
                  <button onClick={next} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
                    {isLast ? "Finish 🎉" : "Got it, Next"} <ChevronRight size={15} />
                  </button>
                )}
                {/* On correct page — waiting for action */}
                {onCorrectPage && step.trigger !== "manual" && (
                  <span className="text-xs text-muted-foreground italic">
                    {step.trigger === "settings_saved" && "⏳ Save settings to continue..."}
                    {step.trigger === "client_saved" && "⏳ Save a client to continue..."}
                    {step.trigger === "engagement_saved" && "⏳ Save an engagement to continue..."}
                    {step.trigger === "invoice_saved" && "⏳ Save an invoice to continue..."}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Restart Tour Button (for Sidebar) ───────────────────────────────────────
export function RestartTourButton() {
  const { restart, isActive } = useTour();
  return (
    <button
      onClick={restart}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
    >
      <HelpCircle size={17} strokeWidth={2} />
      {isActive ? "Restart Tour" : "Take a Tour"}
    </button>
  );
}
