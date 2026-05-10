"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Calendar,
  Plus,
  X,
  Loader2,
  Briefcase,
  CheckCircle2,
  XCircle,
  Clock,
  Trophy,
  Ban,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_CONFIG } from "@/lib/types";
import type { InterviewLogStatus } from "@/lib/types";

interface InterviewEntry {
  id: string;
  company: string;
  role: string;
  interview_date: string | null;
  status: InterviewLogStatus;
  topics: string[];
  notes: string | null;
  reflection: string | null;
  difficulty: string | null;
  result_rating: number | null;
  created_at: string;
}

const STATUS_CONFIG: Record<InterviewLogStatus, { label: string; icon: typeof Clock; color: string }> = {
  upcoming: { label: "Upcoming", icon: Clock, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  completed: { label: "Completed", icon: CheckCircle2, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  offer: { label: "Offer", icon: Trophy, color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  rejected: { label: "Rejected", icon: XCircle, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  cancelled: { label: "Cancelled", icon: Ban, color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
};

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<InterviewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [status, setStatus] = useState<InterviewLogStatus>("upcoming");
  const [topics, setTopics] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [reflection, setReflection] = useState("");

  useEffect(() => {
    loadInterviews();
  }, []);

  const loadInterviews = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? "00000000-0000-0000-0000-000000000000";

    const { data } = await supabase
      .from("interview_log")
      .select("*")
      .eq("user_id", userId)
      .order("interview_date", { ascending: false });

    setInterviews((data as InterviewEntry[]) || []);
    setLoading(false);
  };

  const resetForm = () => {
    setCompany("");
    setRole("");
    setInterviewDate("");
    setStatus("upcoming");
    setTopics([]);
    setNotes("");
    setReflection("");
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (interview: InterviewEntry) => {
    setCompany(interview.company);
    setRole(interview.role);
    setInterviewDate(interview.interview_date || "");
    setStatus(interview.status);
    setTopics(interview.topics);
    setNotes(interview.notes || "");
    setReflection(interview.reflection || "");
    setEditingId(interview.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!company.trim() || !role.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? "00000000-0000-0000-0000-000000000000";

    const payload = {
      user_id: userId,
      company: company.trim(),
      role: role.trim(),
      interview_date: interviewDate || null,
      status,
      topics,
      notes: notes.trim() || null,
      reflection: reflection.trim() || null,
    };

    if (editingId) {
      await supabase.from("interview_log").update(payload).eq("id", editingId);
    } else {
      await supabase.from("interview_log").insert(payload);
    }

    setSaving(false);
    resetForm();
    loadInterviews();
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    await supabase.from("interview_log").delete().eq("id", id);
    loadInterviews();
  };

  const toggleTopic = (topic: string) => {
    setTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const upcoming = interviews.filter((i) => i.status === "upcoming");
  const past = interviews.filter((i) => i.status !== "upcoming");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interviews</h1>
          <p className="text-muted-foreground">
            Track your upcoming and past interviews.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          {showForm ? "Cancel" : "Add Interview"}
        </Button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {editingId ? "Edit Interview" : "Log New Interview"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company *</label>
                <Input
                  placeholder="e.g. Google, Amazon..."
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Role *</label>
                <Input
                  placeholder="e.g. Senior SDE, Frontend Engineer..."
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Interview Date</label>
                <Input
                  type="date"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={status} onValueChange={(v) => setStatus((v ?? "upcoming") as InterviewLogStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Topics to Prep</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => toggleTopic(key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      topics.includes(key)
                        ? "bg-primary text-primary-foreground"
                        : "bg-accent text-accent-foreground hover:bg-accent/80"
                    }`}
                  >
                    {config.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                placeholder="Job description, prep notes, things to remember..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            {(status === "completed" || status === "offer" || status === "rejected") && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Post-Interview Reflection</label>
                <Textarea
                  placeholder="How did it go? What went well? What to improve?"
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving || !company.trim() || !role.trim()}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Update" : "Save"}
              </Button>
              <Button variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Interviews */}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg">Upcoming ({upcoming.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.map((interview) => (
              <InterviewCard
                key={interview.id}
                interview={interview}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Past Interviews */}
      {past.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Past Interviews ({past.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {past.map((interview) => (
              <InterviewCard
                key={interview.id}
                interview={interview}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {interviews.length === 0 && !showForm && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              No interviews logged yet. Click &quot;Add Interview&quot; to start tracking.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InterviewCard({
  interview,
  onEdit,
  onDelete,
}: {
  interview: InterviewEntry;
  onEdit: (i: InterviewEntry) => void;
  onDelete: (id: string) => void;
}) {
  const statusConfig = STATUS_CONFIG[interview.status];
  const daysUntil = interview.interview_date
    ? Math.ceil((new Date(interview.interview_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="p-4 rounded-lg border border-border hover:bg-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{interview.company}</h3>
            <Badge variant="secondary" className={statusConfig.color}>
              {statusConfig.label}
            </Badge>
            {daysUntil !== null && daysUntil >= 0 && interview.status === "upcoming" && (
              <Badge variant="outline" className="text-xs">
                {daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `${daysUntil} days`}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{interview.role}</p>
          {interview.interview_date && (
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(interview.interview_date).toLocaleDateString("en-US", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
          {interview.topics.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {interview.topics.map((topic) => (
                <Badge key={topic} variant="outline" className="text-xs">
                  {CATEGORY_CONFIG[topic as keyof typeof CATEGORY_CONFIG]?.label ?? topic}
                </Badge>
              ))}
            </div>
          )}
          {interview.notes && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {interview.notes}
            </p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => onEdit(interview)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-red-600 hover:text-red-700"
            onClick={() => onDelete(interview.id)}
          >
            Delete
          </Button>
        </div>
      </div>
      {interview.reflection && (
        <>
          <Separator className="my-3" />
          <div className="text-xs">
            <span className="font-medium">Reflection: </span>
            <span className="text-muted-foreground">{interview.reflection}</span>
          </div>
        </>
      )}
    </div>
  );
}
