import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Coffee, LogOut, LogIn, CheckCircle2, Clock, User, KeyRound, ChevronDown, Timer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  useKioskPunch,
  useGetSettings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useIdleTimer } from "@/hooks/use-idle-timer";

type CostCodeOption = { id: number; code: string; description: string | null };

type RequestedAction = "clock_in" | "clock_out" | "break_start" | "break_end";

type KioskEmployee = { id: number; firstName: string; lastName: string; jobTitle: string | null };

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export default function Kiosk() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [pin, setPin] = useState("");
  const [selectedCostCode, setSelectedCostCode] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loggedInEmployee, setLoggedInEmployee] = useState<KioskEmployee | null>(null);

  const { data: settings } = useGetSettings();

  type KioskPunchStatus = {
    employeeId: number;
    status: "clocked_out" | "clocked_in" | "on_break";
    clockedInAt: string | null;
    hoursToday: number;
  };
  const { data: currentStatus, refetch: refetchStatus } = useQuery<KioskPunchStatus>({
    queryKey: ["kiosk-punch-status", loggedInEmployee?.id],
    queryFn: async () => {
      const res = await fetch(`/api/kiosk/punches/employee/${loggedInEmployee!.id}/current`);
      if (!res.ok) throw new Error("Failed to load punch status");
      return res.json();
    },
    enabled: !!loggedInEmployee,
    staleTime: 0,
  });
  const { data: costCodes = [] } = useQuery<CostCodeOption[]>({
    queryKey: ["kiosk-cost-codes"],
    queryFn: async () => {
      const res = await fetch("/api/kiosk/cost-codes");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });
  const hasCostCodes = costCodes.length > 0;

  const kioskPunch = useKioskPunch();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!loginIdentifier.trim() || !loginPin.trim()) {
      setLoginError("Please enter your Employee ID and PIN.");
      return;
    }
    setLoginLoading(true);
    try {
      const res = await fetch("/api/kiosk/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: loginIdentifier.trim(), pin: loginPin.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setLoginError(data?.error || "Invalid credentials. Please try again.");
        return;
      }
      const employee: KioskEmployee = await res.json();
      setLoggedInEmployee(employee);
      setLoginIdentifier("");
      setLoginPin("");
    } catch {
      setLoginError("Unable to connect. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogOff = () => {
    setLoggedInEmployee(null);
    setPin("");
    setSelectedCostCode("");
    setLoginIdentifier("");
    setLoginPin("");
    setLoginError("");
  };

  const handlePunch = async (requestedAction: RequestedAction) => {
    if (!loggedInEmployee) return;
    if (settings?.kioskRequirePin && !pin) return;
    try {
      const response = await kioskPunch.mutateAsync({
        data: {
          employeeId: loggedInEmployee.id,
          pin: pin || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          requestedAction,
          costCode: selectedCostCode || undefined,
        },
      });
      toast.success(response.message);
      setPin("");
      setSelectedCostCode("");
      refetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record punch";
      toast.error(msg);
    }
  };

  const status = currentStatus?.status;
  const pinRequired = settings?.kioskRequirePin;
  const pinMissing = pinRequired && !pin;
  const isPending = kioskPunch.isPending;

  const timeoutSeconds = settings?.kioskTimeoutSeconds ?? 60;
  const { remainingSeconds } = useIdleTimer({
    timeoutSeconds,
    onTimeout: handleLogOff,
    paused: !loggedInEmployee || isPending,
  });
  const showCountdown = !!loggedInEmployee && remainingSeconds <= 10;

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Header ── */}
      <header className="bg-card border-b border-border flex items-center justify-between px-8 py-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-foreground text-sm tracking-tight">
            {settings?.companyName || "Timekeeper"}
          </span>
        </div>

        <div className="text-right">
          <div className="font-mono text-4xl font-bold text-foreground tabular-nums leading-none tracking-tight">
            {format(currentTime, "HH:mm:ss")}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {format(currentTime, "EEEE, MMMM d, yyyy")}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex items-center justify-center p-6">

        {!loggedInEmployee ? (

          /* ── SCREEN 1: Login form ── */
          <div className="w-full max-w-sm">
            <div className="bg-card rounded-xl border border-border shadow-md overflow-hidden">
              <div className="px-8 pt-8 pb-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary/10 mb-4">
                  <Clock className="h-8 w-8 text-primary" />
                </div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Time Entry</p>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Kiosk Login</h1>
                <p className="text-sm text-muted-foreground mt-2">Enter your Employee ID or last name and PIN to continue.</p>
              </div>

              <form onSubmit={handleLogin} className="px-8 pb-8 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2 tracking-wide uppercase">
                    Employee ID or Last Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      value={loginIdentifier}
                      onChange={(e) => { setLoginIdentifier(e.target.value); setLoginError(""); }}
                      className="pl-10 h-12 rounded-lg"
                      placeholder="e.g. EMP001 or Smith"
                      autoFocus
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2 tracking-wide uppercase">
                    PIN
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      value={loginPin}
                      onChange={(e) => { setLoginPin(e.target.value); setLoginError(""); }}
                      className="pl-10 h-12 rounded-lg tracking-[0.3em]"
                      placeholder="Enter PIN"
                      autoComplete="off"
                    />
                  </div>
                </div>

                {loginError && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive font-medium">
                    {loginError}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-14 text-base font-semibold gap-3 rounded-xl mt-2"
                  disabled={loginLoading}
                >
                  {loginLoading ? (
                    <>
                      <div className="w-5 h-5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <LogIn className="h-5 w-5" />
                      Sign In
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>

        ) : (

          /* ── SCREEN 2: Action panel ── */
          <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-card rounded-xl border border-border shadow-md overflow-hidden">

              {/* Employee identity strip */}
              <div className="px-8 pt-8 pb-6 border-b border-border text-center">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl font-bold text-2xl mb-4 ${
                  avatarColor(`${loggedInEmployee.firstName}${loggedInEmployee.lastName}`)
                }`}>
                  {initials(loggedInEmployee.firstName, loggedInEmployee.lastName)}
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-foreground leading-tight">
                  {loggedInEmployee.firstName} {loggedInEmployee.lastName}
                </h2>
                {loggedInEmployee.jobTitle && (
                  <p className="text-sm text-muted-foreground mt-1">{loggedInEmployee.jobTitle}</p>
                )}

                {currentStatus && (
                  <div className="mt-4 inline-flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                      status === "clocked_in"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : status === "on_break"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        status === "clocked_in" ? "bg-emerald-500" :
                        status === "on_break" ? "bg-amber-500" : "bg-slate-400"
                      }`} />
                      {status === "clocked_in" ? "Clocked In" : status === "on_break" ? "On Break" : "Clocked Out"}
                      {currentStatus.clockedInAt && status !== "clocked_out" && (
                        <span className="opacity-60 font-normal">
                          · since {format(new Date(currentStatus.clockedInAt), "h:mm a")}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions area */}
              <div className="px-6 py-6 space-y-3">
                {pinRequired && (
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-muted-foreground mb-2 text-center tracking-wide uppercase">
                      Enter PIN
                    </label>
                    <Input
                      type="password"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      className="text-center text-2xl tracking-[0.5em] h-14 rounded-lg"
                      autoFocus
                      placeholder="····"
                    />
                  </div>
                )}

                {hasCostCodes && (
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-muted-foreground mb-2 text-center tracking-wide uppercase">
                      Cost Code
                    </label>
                    <div className="relative">
                      <select
                        value={selectedCostCode}
                        onChange={(e) => setSelectedCostCode(e.target.value)}
                        className="w-full h-14 rounded-lg border border-input bg-background px-4 pr-10 text-base appearance-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <option value="">No cost code</option>
                        {costCodes.map((cc) => (
                          <option key={cc.id} value={cc.code}>
                            {cc.code}{cc.description ? ` — ${cc.description}` : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                )}

                {!currentStatus ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-border border-t-primary animate-spin" />
                    <span className="text-sm">Loading status...</span>
                  </div>
                ) : (
                  <>
                    <Button
                      size="lg"
                      className="w-full h-16 text-base font-semibold gap-3 rounded-xl"
                      onClick={() => handlePunch("clock_in")}
                      disabled={isPending || pinMissing || status !== "clocked_out"}
                    >
                      <LogIn className="h-5 w-5" />
                      <span>Clock In</span>
                      <span className="opacity-50 text-sm font-normal ml-auto">Start shift</span>
                    </Button>

                    <Button
                      size="lg"
                      variant="secondary"
                      className="w-full h-16 text-base font-semibold gap-3 rounded-xl"
                      onClick={() => handlePunch(status === "on_break" ? "break_end" : "break_start")}
                      disabled={isPending || pinMissing || status === "clocked_out"}
                    >
                      {status === "on_break"
                        ? <CheckCircle2 className="h-5 w-5" />
                        : <Coffee className="h-5 w-5" />}
                      <span>{status === "on_break" ? "End Break" : "Take Break"}</span>
                      <span className="opacity-50 text-sm font-normal ml-auto">
                        {status === "on_break" ? "Resume shift" : "Pause shift"}
                      </span>
                    </Button>

                    <Button
                      size="lg"
                      variant="destructive"
                      className="w-full h-16 text-base font-semibold gap-3 rounded-xl"
                      onClick={() => handlePunch("clock_out")}
                      disabled={isPending || pinMissing || status === "clocked_out"}
                    >
                      <LogOut className="h-5 w-5" />
                      <span>Clock Out</span>
                      <span className="opacity-50 text-sm font-normal ml-auto">End shift</span>
                    </Button>
                  </>
                )}

                {showCountdown && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-2 text-amber-800 animate-in fade-in duration-300">
                    <Timer className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-medium">
                      Returning to login in {remainingSeconds}s…
                    </span>
                  </div>
                )}

                <div className="pt-3 border-t border-border mt-3">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full h-12 text-sm font-semibold gap-2 rounded-xl"
                    onClick={handleLogOff}
                    disabled={isPending}
                  >
                    <LogOut className="h-4 w-4" />
                    Log Off
                  </Button>
                </div>
              </div>
            </div>
          </div>

        )}
      </main>

      {/* ── Footer ── */}
      <footer className="px-8 py-3 border-t border-border bg-card">
        <p className="text-xs text-muted-foreground text-center">
          {settings?.kioskMessage || "Contact your manager if you experience any issues."}
        </p>
      </footer>
    </div>
  );
}
