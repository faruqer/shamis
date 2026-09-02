"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Users,
  Coins,
  Search,
  Pencil,
  Trash2,
  UserPlus,
  Clock,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, LoadingSpinner } from "@/components/layout/page-transition";
import { cn, formatDateTime, formatRmb } from "@/lib/utils";
import {
  creditOutstanding,
  getCreditStatus,
  parseRmbAmount,
} from "@/lib/china-rmb";
import { Role } from "@prisma/client";

interface PersonSummary {
  id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  totalCredit: number;
  totalPaid: number;
  outstanding: number;
  count: number;
}

interface CreditRecord {
  id: string;
  personId: string;
  amount: string;
  paidAmount: string;
  description?: string | null;
  notes?: string | null;
  creditDate: string;
  person: { id: string; name: string };
  createdBy?: { name: string };
}

interface ChinaRmbData {
  persons: PersonSummary[];
  credits: CreditRecord[];
  summary: {
    totalCredit: number;
    totalPaid: number;
    outstanding: number;
    friendCount: number;
    friendsWithBalance: number;
  };
}

function toDatetimeLocalValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusLabel(status: ReturnType<typeof getCreditStatus>) {
  if (status === "SETTLED") return "Paid back";
  if (status === "PARTIAL") return "Partial";
  return "Open";
}

export function ChinaRmbClient({ user }: { user: { name: string; role: Role; email: string } }) {
  const [data, setData] = useState<ChinaRmbData | null>(null);
  const [loading, setLoading] = useState(true);
  const [personSearch, setPersonSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [showPersonForm, setShowPersonForm] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState("");
  const [personPhone, setPersonPhone] = useState("");
  const [personNotes, setPersonNotes] = useState("");
  const [personFormLoading, setPersonFormLoading] = useState(false);

  const [showCreditForm, setShowCreditForm] = useState(false);
  const [editingCreditId, setEditingCreditId] = useState<string | null>(null);
  const [creditPersonId, setCreditPersonId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDescription, setCreditDescription] = useState("");
  const [creditNotes, setCreditNotes] = useState("");
  const [creditDate, setCreditDate] = useState(() => toDatetimeLocalValue());
  const [creditFormLoading, setCreditFormLoading] = useState(false);

  const [payCredit, setPayCredit] = useState<CreditRecord | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payLoading, setPayLoading] = useState(false);

  function loadData() {
    setLoading(true);
    fetch("/api/china-rmb")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load China RMB data");
        }
        return res.json();
      })
      .then(setData)
      .catch((err) => alert(err instanceof Error ? err.message : "Failed to load data"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredPersons = useMemo(() => {
    if (!data) return [];
    const query = personSearch.trim().toLowerCase();
    if (!query) return data.persons;
    return data.persons.filter((person) =>
      [person.name, person.phone, person.notes].filter(Boolean).join(" ").toLowerCase().includes(query)
    );
  }, [data, personSearch]);

  const personsWithBalance = useMemo(
    () => filteredPersons.filter((person) => person.outstanding > 0.001),
    [filteredPersons]
  );

  const personsSettled = useMemo(
    () => filteredPersons.filter((person) => person.outstanding <= 0.001 && person.count > 0),
    [filteredPersons]
  );

  const filteredCredits = useMemo(() => {
    if (!data) return [];
    const query = historySearch.trim().toLowerCase();

    return data.credits.filter((credit) => {
      if (selectedPersonId && credit.personId !== selectedPersonId) return false;
      if (!query) return true;

      const haystack = [
        credit.person.name,
        credit.description,
        credit.notes,
        formatRmb(credit.amount),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [data, historySearch, selectedPersonId]);

  const selectedPerson = useMemo(
    () => data?.persons.find((person) => person.id === selectedPersonId) ?? null,
    [data, selectedPersonId]
  );

  function resetPersonForm() {
    setEditingPersonId(null);
    setPersonName("");
    setPersonPhone("");
    setPersonNotes("");
  }

  function openPersonForm(person?: PersonSummary) {
    resetPersonForm();
    if (person) {
      setEditingPersonId(person.id);
      setPersonName(person.name);
      setPersonPhone(person.phone ?? "");
      setPersonNotes(person.notes ?? "");
    }
    setShowPersonForm(true);
  }

  function closePersonForm() {
    setShowPersonForm(false);
    resetPersonForm();
  }

  function resetCreditForm() {
    setEditingCreditId(null);
    setCreditPersonId(selectedPersonId || "");
    setCreditAmount("");
    setCreditDescription("");
    setCreditNotes("");
    setCreditDate(toDatetimeLocalValue());
  }

  function openCreditForm(credit?: CreditRecord) {
    resetCreditForm();
    if (credit) {
      setEditingCreditId(credit.id);
      setCreditPersonId(credit.personId);
      setCreditAmount(String(parseRmbAmount(credit.amount)));
      setCreditDescription(credit.description ?? "");
      setCreditNotes(credit.notes ?? "");
      setCreditDate(toDatetimeLocalValue(new Date(credit.creditDate)));
    } else if (selectedPersonId) {
      setCreditPersonId(selectedPersonId);
    }
    setShowCreditForm(true);
  }

  function closeCreditForm() {
    setShowCreditForm(false);
    resetCreditForm();
  }

  function openPayModal(credit: CreditRecord) {
    const outstanding = creditOutstanding(
      parseRmbAmount(credit.amount),
      parseRmbAmount(credit.paidAmount)
    );
    setPayCredit(credit);
    setPayAmount(String(outstanding));
  }

  function closePayModal() {
    setPayCredit(null);
    setPayAmount("");
  }

  async function handlePersonSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPersonFormLoading(true);
    try {
      const body = { name: personName, phone: personPhone || undefined, notes: personNotes || undefined };
      const res = await fetch(
        editingPersonId ? `/api/china-rmb/persons/${editingPersonId}` : "/api/china-rmb/persons",
        {
          method: editingPersonId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save person");
      closePersonForm();
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save person");
    } finally {
      setPersonFormLoading(false);
    }
  }

  async function handleCreditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreditFormLoading(true);
    try {
      const body = {
        personId: creditPersonId,
        amount: parseFloat(creditAmount),
        description: creditDescription || undefined,
        notes: creditNotes || undefined,
        creditDate,
      };

      const existing = editingCreditId
        ? data?.credits.find((credit) => credit.id === editingCreditId)
        : null;

      const res = await fetch(
        editingCreditId ? `/api/china-rmb/credits/${editingCreditId}` : "/api/china-rmb/credits",
        {
          method: editingCreditId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingCreditId && existing
              ? { ...body, paidAmount: parseRmbAmount(existing.paidAmount) }
              : body
          ),
        }
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save credit");
      closeCreditForm();
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save credit");
    } finally {
      setCreditFormLoading(false);
    }
  }

  async function handlePaySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payCredit) return;

    setPayLoading(true);
    try {
      const amount = parseFloat(payAmount);
      const res = await fetch(`/api/china-rmb/credits/${payCredit.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to record payment");
      closePayModal();
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setPayLoading(false);
    }
  }

  async function handleDeleteCredit(credit: CreditRecord) {
    if (
      !confirm(
        `Delete this credit record?\n\n${credit.person.name} — ${formatRmb(credit.amount)}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setActionLoadingId(credit.id);
    try {
      const res = await fetch(`/api/china-rmb/credits/${credit.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to delete credit");
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete credit");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDeactivatePerson(person: PersonSummary) {
    if (
      !confirm(
        person.count > 0
          ? `Hide ${person.name}? Their credit history will stay, but they won't appear in active lists.`
          : `Remove ${person.name}?`
      )
    ) {
      return;
    }

    setActionLoadingId(person.id);
    try {
      const res = await fetch(`/api/china-rmb/persons/${person.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to remove person");
      if (selectedPersonId === person.id) setSelectedPersonId("");
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove person");
    } finally {
      setActionLoadingId(null);
    }
  }

  const personForm = (
    <form onSubmit={handlePersonSubmit} className="grid gap-4">
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          placeholder="Friend or contact name"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Phone</Label>
        <Input value={personPhone} onChange={(e) => setPersonPhone(e.target.value)} placeholder="Optional" />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Input value={personNotes} onChange={(e) => setPersonNotes(e.target.value)} placeholder="Optional" />
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={closePersonForm} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" loading={personFormLoading} className="flex-1">
          {editingPersonId ? "Save Changes" : "Add Person"}
        </Button>
      </div>
    </form>
  );

  const creditForm = (
    <form onSubmit={handleCreditSubmit} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label>Person *</Label>
        <Select
          value={creditPersonId}
          onChange={(e) => setCreditPersonId(e.target.value)}
          required
          disabled={!!editingCreditId}
        >
          <option value="">Select person...</option>
          {(data?.persons ?? []).map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Credit amount (RMB) *</Label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={creditAmount}
          onChange={(e) => setCreditAmount(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Date *</Label>
        <Input
          type="datetime-local"
          value={creditDate}
          onChange={(e) => setCreditDate(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Description</Label>
        <Input
          value={creditDescription}
          onChange={(e) => setCreditDescription(e.target.value)}
          placeholder="What this credit was for"
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Notes</Label>
        <Input value={creditNotes} onChange={(e) => setCreditNotes(e.target.value)} placeholder="Optional" />
      </div>
      <div className="md:col-span-2 flex gap-3">
        <Button type="button" variant="outline" onClick={closeCreditForm} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" loading={creditFormLoading} className="flex-1">
          {editingCreditId ? "Save Changes" : "Add Credit"}
        </Button>
      </div>
    </form>
  );

  const payForm = payCredit ? (
    <form onSubmit={handlePaySubmit} className="grid gap-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
        <p className="font-medium">{payCredit.person.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Credit {formatRmb(payCredit.amount)} · Paid back {formatRmb(payCredit.paidAmount)}
        </p>
      </div>
      <div className="space-y-2">
        <Label>Payment amount (RMB) *</Label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={payAmount}
          onChange={(e) => setPayAmount(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Remaining after payment:{" "}
          {formatRmb(
            Math.max(
              0,
              creditOutstanding(parseRmbAmount(payCredit.amount), parseRmbAmount(payCredit.paidAmount)) -
                parseFloat(payAmount || "0")
            )
          )}
        </p>
      </div>
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() =>
            setPayAmount(
              String(
                creditOutstanding(parseRmbAmount(payCredit.amount), parseRmbAmount(payCredit.paidAmount))
              )
            )
          }
        >
          Full balance
        </Button>
        <Button type="button" variant="outline" onClick={closePayModal} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" loading={payLoading} className="flex-1">
          Record payment
        </Button>
      </div>
    </form>
  ) : null;

  return (
    <DashboardLayout
      user={user}
      title="China RMB"
      description="Track RMB credit from China friends — money you received that will be paid back"
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openPersonForm()}>
            <UserPlus className="h-4 w-4" /> Add Person
          </Button>
          <Button onClick={() => openCreditForm()} disabled={!data?.persons.length}>
            <Plus className="h-4 w-4" /> Add Credit
          </Button>
        </div>
      }
    >
      <Modal
        open={showPersonForm}
        onClose={closePersonForm}
        title={editingPersonId ? "Edit Person" : "Add Person"}
        description="A China friend or contact who gave you RMB credit"
        className="max-w-md"
      >
        <div className="px-6 py-4">{personForm}</div>
      </Modal>

      <Modal
        open={showCreditForm}
        onClose={closeCreditForm}
        title={editingCreditId ? "Edit Credit" : "Add Credit"}
        description="Record RMB received from someone on credit"
        className="max-w-2xl"
      >
        <div className="px-6 py-4">{creditForm}</div>
      </Modal>

      <Modal
        open={!!payCredit}
        onClose={closePayModal}
        title="Record payment"
        description="Money paid back on this credit"
        className="max-w-md"
      >
        <div className="px-6 py-4">{payForm}</div>
      </Modal>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard compact title="Total Credit" value={formatRmb(data?.summary.totalCredit ?? 0)} icon={<Coins className="h-4 w-4" />} delay={0} />
            <StatCard compact title="Paid Back" value={formatRmb(data?.summary.totalPaid ?? 0)} icon={<CheckCircle2 className="h-4 w-4" />} delay={0.05} />
            <StatCard compact title="Outstanding" value={formatRmb(data?.summary.outstanding ?? 0)} icon={<Clock className="h-4 w-4" />} delay={0.1} />
            <StatCard compact title="Friends with balance" value={String(data?.summary.friendsWithBalance ?? 0)} icon={<Users className="h-4 w-4" />} delay={0.15} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">People</CardTitle>
                  <span className="text-xs text-muted-foreground">{filteredPersons.length} contacts</span>
                </div>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    placeholder="Search people..."
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredPersons.length === 0 ? (
                  <div className="px-6 py-10">
                    <EmptyState
                      icon={<Users className="h-8 w-8" />}
                      title="No people yet"
                      description="Add China friends who gave you RMB on credit"
                    />
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {personsWithBalance.length > 0 && (
                      <div className="px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:px-6">
                        With outstanding balance
                      </div>
                    )}
                    {personsWithBalance.map((person, index) => (
                      <PersonRow
                        key={person.id}
                        person={person}
                        index={index}
                        selected={selectedPersonId === person.id}
                        loading={actionLoadingId === person.id}
                        onSelect={() => setSelectedPersonId((current) => (current === person.id ? "" : person.id))}
                        onEdit={() => openPersonForm(person)}
                        onRemove={() => handleDeactivatePerson(person)}
                      />
                    ))}
                    {personsSettled.length > 0 && (
                      <div className="px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:px-6">
                        Settled
                      </div>
                    )}
                    {personsSettled.map((person, index) => (
                      <PersonRow
                        key={person.id}
                        person={person}
                        index={index}
                        selected={selectedPersonId === person.id}
                        loading={actionLoadingId === person.id}
                        onSelect={() => setSelectedPersonId((current) => (current === person.id ? "" : person.id))}
                        onEdit={() => openPersonForm(person)}
                        onRemove={() => handleDeactivatePerson(person)}
                        settled
                      />
                    ))}
                    {filteredPersons.filter((person) => person.count === 0).map((person, index) => (
                      <PersonRow
                        key={person.id}
                        person={person}
                        index={index}
                        selected={selectedPersonId === person.id}
                        loading={actionLoadingId === person.id}
                        onSelect={() => setSelectedPersonId((current) => (current === person.id ? "" : person.id))}
                        onEdit={() => openPersonForm(person)}
                        onRemove={() => handleDeactivatePerson(person)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Credit history</CardTitle>
                    {selectedPerson && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Showing {selectedPerson.name} · {formatRmb(selectedPerson.outstanding)} outstanding
                      </p>
                    )}
                  </div>
                  {selectedPersonId && (
                    <Button variant="ghost" size="sm" onClick={() => setSelectedPersonId("")}>
                      Clear filter
                    </Button>
                  )}
                </div>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search history..."
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredCredits.length === 0 ? (
                  <div className="px-6 py-10">
                    <EmptyState
                      icon={<Coins className="h-8 w-8" />}
                      title="No credit records"
                      description={
                        selectedPerson
                          ? `No credit history for ${selectedPerson.name}`
                          : "Add credit when someone gives you RMB"
                      }
                    />
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {filteredCredits.map((credit, index) => {
                      const amount = parseRmbAmount(credit.amount);
                      const paid = parseRmbAmount(credit.paidAmount);
                      const outstanding = creditOutstanding(amount, paid);
                      const status = getCreditStatus(amount, paid);
                      const isLoading = actionLoadingId === credit.id;

                      return (
                        <motion.div
                          key={credit.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02 }}
                          className="group px-4 py-3.5 transition-colors hover:bg-muted/20 sm:px-6"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium">{credit.person.name}</p>
                                <span className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                                  status === "SETTLED" && "bg-primary/10 text-primary",
                                  status === "PARTIAL" && "bg-warning/10 text-warning",
                                  status === "OPEN" && "bg-muted text-muted-foreground"
                                )}>
                                  {statusLabel(status)}
                                </span>
                              </div>
                              {credit.description && (
                                <p className="mt-1 text-sm text-foreground/90">{credit.description}</p>
                              )}
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(credit.creditDate)}
                                {credit.notes && ` · ${credit.notes}`}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                                Paid back {formatRmb(paid)} of {formatRmb(amount)}
                                {outstanding > 0 && ` · ${formatRmb(outstanding)} left`}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 sm:shrink-0">
                              <div className="text-right">
                                <p className="text-sm font-semibold tabular-nums">{formatRmb(amount)}</p>
                                {outstanding > 0 && (
                                  <p className="text-xs text-muted-foreground tabular-nums">{formatRmb(outstanding)} due</p>
                                )}
                              </div>
                              {status !== "SETTLED" && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isLoading}
                                  onClick={() => openPayModal(credit)}
                                >
                                  <Wallet className="h-3.5 w-3.5" />
                                  Pay
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isLoading}
                                onClick={() => openCreditForm(credit)}
                                aria-label="Edit credit"
                                className="h-8 w-8 p-0"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isLoading}
                                onClick={() => handleDeleteCredit(credit)}
                                aria-label="Delete credit"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

function PersonRow({
  person,
  index,
  selected,
  loading,
  settled,
  onSelect,
  onEdit,
  onRemove,
}: {
  person: PersonSummary;
  index: number;
  selected: boolean;
  loading: boolean;
  settled?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      onClick={onSelect}
      className={cn(
        "group flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors sm:px-6",
        selected ? "bg-primary/5" : "hover:bg-muted/20"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{person.name}</p>
        {person.phone && <p className="text-xs text-muted-foreground">{person.phone}</p>}
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {person.count} {person.count === 1 ? "credit" : "credits"}
          {person.totalCredit > 0 && ` · ${formatRmb(person.totalCredit)} total`}
        </p>
      </div>
      <div className="flex items-start gap-2">
        <div className="text-right">
          {person.outstanding > 0 ? (
            <>
              <p className="text-sm font-semibold tabular-nums">{formatRmb(person.outstanding)}</p>
              <p className="text-[11px] text-muted-foreground">outstanding</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{settled ? "Settled" : "No credit yet"}</p>
          )}
        </div>
        <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="h-8 w-8 p-0"
            aria-label="Edit person"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            aria-label="Remove person"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </motion.button>
  );
}
