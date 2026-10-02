import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight, X, Building2, Users, ShieldCheck, Briefcase, Receipt, Sparkles, Globe, ClipboardList } from "lucide-react";

type Step = {
  id: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  href: string;
  tip: string;
};

const STEPS: Step[] = [
  {
    id: 1,
    icon: <Building2 size={32} className="text-primary" />,
    title: "Set up your firm",
    description: "Add your firm name, GSTIN, PAN, bank details and logo. These appear on every invoice you send to clients.",
    action: "Go to Settings",
    href: "/settings",
    tip: "Upload your logo — it appears on your invoices, login page and client-facing website.",
  },
  {
    id: 2,
    icon: <Globe size={32} className="text-primary" />,
    title: "Your client-facing website is ready",
    description: "Firmora gives you a free professional website to share with clients. Add your services, WhatsApp number and tagline in Settings → Website. Share the link on your visiting card, Instagram or WhatsApp.",
    action: "Set Up Website",
    href: "/settings",
    tip: "Your website link is: ca-firmora.vercel.app?ca=YOUR_ID — copy it from Settings.",
  },
  {
    id: 3,
    icon: <ClipboardList size={32} className="text-primary" />,
    title: "Customise your document checklists",
    description: "Every engagement type — ITR Filing, GST Return, Statutory Audit — has a pre-built document checklist. Go to Settings → Checklist Templates to edit what documents you request from clients, and add your own service types.",
    action: "Edit Checklists",
    href: "/settings",
    tip: "You can also add custom service types like FSSAI Compliance or RERA Filing.",
  },
  {
    id: 4,
    icon: <Users size={32} className="text-primary" />,
    title: "Add your first client",
    description: "Add a client and tick the services they need — GST, TDS, ITR, PF, Advance Tax. Compliance deadlines are created automatically. You can also import all clients at once from Excel.",
    action: "Add Client",
    href: "/clients",
    tip: "Tick 'ITR Filing Applicable', 'GST Registered' etc. and the right deadlines appear in Compliance automatically.",
  },
  {
    id: 5,
    icon: <ShieldCheck size={32} className="text-primary" />,
    title: "Review compliance deadlines",
    description: "Once clients are added, their compliance calendar is ready. View upcoming and overdue deadlines, mark items as filed, and export a pending list to Excel.",
    action: "View Compliance",
    href: "/compliance",
    tip: "Dashboard shows Today's Focus every morning — DSC expiry, overdue invoices and missed deadlines.",
  },
  {
    id: 6,
    icon: <Briefcase size={32} className="text-primary" />,
    title: "Create an engagement",
    description: "Track any piece of work — ITR filing, GST audit, company incorporation. A document checklist is auto-created. Tick conditions like 'Has Capital Gains' or 'Has Employees' to include the right documents automatically.",
    action: "Add Engagement",
    href: "/engagements",
    tip: "Assign a Maker and Checker for quality control. The Checker approves before work is marked complete.",
  },
  {
    id: 7,
    icon: <Receipt size={32} className="text-primary" />,
    title: "Send your first invoice",
    description: "Create a professional invoice with multiple line items and GST. Download as a PDF in Classic, Modern or Minimal theme and send it directly to the client.",
    action: "Create Invoice",
    href: "/invoices",
    tip: "Use Fee Estimator to price any CA service confidently based on entity type, turnover and complexity.",
  },
  {
    id: 8,
    icon: <Sparkles size={32} className="text-primary" />,
    title: "You're all set!",
    description: "Your practice is live on Firmora. Your dashboard shows what needs attention every day — DSC expiry, pending documents, overdue invoices, upcoming deadlines and new leads.",
    action: "Go to Dashboard",
    href: "/",
    tip: "Share your website link with clients today to start receiving enquiries directly.",
  },
];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleAction = () => {
    if (isLast) {
      onComplete();
      navigate({ to: "/" });
    } else {
      onComplete();
      navigate({ to: current.href as any });
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else { onComplete(); navigate({ to: "/" }); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  i < step ? "w-6 bg-primary" :
                  i === step ? "w-8 bg-primary" :
                  "w-4 bg-muted"
                }`}
              />
            ))}
          </div>
          <button onClick={handleSkip} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-8 space-y-6">
          {/* Step indicator */}
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Step {step + 1} of {STEPS.length}
          </div>

          {/* Icon + Title */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              {current.icon}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{current.title}</h2>
              <p className="text-muted-foreground text-sm mt-1 leading-relaxed">{current.description}</p>
            </div>
          </div>

          {/* Tip */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
            <p className="text-xs text-primary font-medium">
              💡 <span className="font-semibold">Pro tip:</span> {current.tip}
            </p>
          </div>

          {/* Completed steps */}
          {step > 0 && (
            <div className="space-y-1.5">
              {STEPS.slice(0, step).map(s => (
                <div key={s.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                  <span>{s.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <button onClick={handleSkip} className="text-sm text-muted-foreground hover:text-foreground font-medium">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 text-sm rounded-lg border border-input text-foreground hover:bg-muted font-medium">
                Back
              </button>
            )}
            <button onClick={handleNext} className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-muted text-foreground hover:bg-muted/80 font-medium border border-input">
              Next <ChevronRight size={15} />
            </button>
            <button onClick={handleAction} className="inline-flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
              {isLast ? "Get Started" : current.action}
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook to control onboarding
export function useOnboarding() {
  const key = "firmora_onboarded";
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem(key); }
    catch { return false; }
  });

  const complete = () => {
    try { localStorage.setItem(key, "true"); } catch {}
    setShow(false);
  };

  const reset = () => {
    try { localStorage.removeItem(key); } catch {}
    setShow(true);
  };

  return { show, complete, reset };
}
