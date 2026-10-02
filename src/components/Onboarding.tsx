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
    path: "/settings",
    title: "Step 2 — Set up your client website",
    description: "Go to the Website tab. Add your WhatsApp number, tagline and services. Share the link on your visiting card and Instagram. Hit Save Settings when done.",
    action: "Set Up Website",
    trigger: "settings_saved",
  },
  {
    id: 3,
    path: "/settings",
    title: "Step 3 — Customise your checklists",
    description: "Go to the Checklist Templates tab. Edit the documents you request from clients for each service type. Add your own service types like FSSAI or RERA. Hit Save Template when done.",
    action: "Edit Checklists",
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
    description: "Your client's compliance calendar is ready. View upcoming and overdue deadlines here. Mark items as filed once done. Click Got it when you're ready.",
    action: "View Compliance",
    trigger: "manual",
  },
  {
    id: 6,
    path: "/engagements",
    title: "Step 6 — Create your first engagement",
    description: "Click Add Engagement. Select the client and service type. Tick conditions like Has Capital Gains or Has Employees — the right documents will auto-include in the checklist.",
    action: "Add Engagement",
    trigger: "engagement_saved",
  },
  {
    id: 7,
    path: "/invoices",
    title: "Step 7 — Send your first invoice",
    description: "Click Add Invoice. Select the client, add line items and GST. Download as PDF and send. Outstanding invoices appear on your dashboard automatically.",
    action: "Create Invoice",
    trigger: "invoice_saved",
  },
  {
    id: 8,
    path: "/",
    title: "🎉 You're all set!",
    description: "Your dashboard now shows what needs attention every day — DSC expiry, pending documents, overdue invoices and upcoming deadlines. Welcome to Firmora!",
    action: "Go to Dashboard",
    trigger: "manual",
  },
];

const STORAGE_KEY = "firmora_tour_step"; // current step (1-based), "done" if complete

// ─── Context ──────────────────────────────────────────────────────────────────
type TourContextType = {
  currentStep: number | null; // null = tour done/not started
  totalSteps: number;
  isActive: boolean;
  next: () => void;
  skip: () => void;
  restart: () => void;
  triggerEvent: (event: TourStep["trigger"]) => void;
};

const TourContext = createContext<TourContextType | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
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
    navigate({ to: s.path as any });
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
      }, 800);
    }
  }, [currentStep, goToStep, navigate]);

  return (
    <TourContext.Provider value={{
      currentStep,
      totalSteps: TOUR_STEPS.length,
      isActive: currentStep !== null,
      next,
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
  const { currentStep, totalSteps, isActive, next, skip } = useTour();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const navigate = useNavigate();
  const [minimised, setMinimised] = useState(false);

  if (!isActive || currentStep === null) return null;

  const step = TOUR_STEPS[currentStep - 1];
  if (!step) return null;

  // Check if user is on correct page
  const onCorrectPage = pathname === step.path || (step.path !== "/" && pathname.startsWith(step.path));

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
    <div className="fixed bottom-0 left-0 right-0 md:left-64 z-50 p-4 pointer-events-none">
      <div className="max-w-2xl mx-auto pointer-events-auto">
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
              <button onClick={skip} className="text-xs text-muted-foreground hover:text-foreground font-medium">
                Skip tour
              </button>
              <div className="flex items-center gap-2">
                {!onCorrectPage && (
                  <button
                    onClick={() => navigate({ to: step.path as any })}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                  >
                    {step.action} <ChevronRight size={15} />
                  </button>
                )}
                {onCorrectPage && step.trigger === "manual" && (
                  <button
                    onClick={next}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                  >
                    {isLast ? "Finish" : "Got it, Next"}
                    <ChevronRight size={15} />
                  </button>
                )}
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
