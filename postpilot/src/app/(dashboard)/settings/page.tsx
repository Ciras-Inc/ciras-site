"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { Loader2, LinkIcon, CheckCircle2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SocialAccount, ScheduleSettings, StyleAnalysis, PostPerformance } from "@/types";

const SCHEDULE_MODES = ["manual", "best_time", "fixed", "hybrid"] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [schedule, setSchedule] = useState<ScheduleSettings | null>(null);
  const [styleAnalysis, setStyleAnalysis] = useState<StyleAnalysis | null>(null);
  const [sampleText, setSampleText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [fetchingThreads, setFetchingThreads] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [performance, setPerformance] = useState<PostPerformance[]>([]);
  const [fixedTimeInput, setFixedTimeInput] = useState("");
  const supabase = createClient();

  const loadData = useCallback(async () => {
    const [accountsRes, scheduleRes, profileRes, perfRes] = await Promise.all([
      supabase.from("social_accounts").select("*"),
      supabase.from("schedule_settings").select("*").single(),
      supabase.from("style_profiles").select("analysis").order("updated_at", { ascending: false }).limit(1),
      supabase.from("post_performance").select("*").order("recorded_at", { ascending: false }).limit(100),
    ]);
    setAccounts((accountsRes.data as SocialAccount[]) || []);
    setSchedule(scheduleRes.data as ScheduleSettings);
    if (profileRes.data && Array.isArray(profileRes.data) && profileRes.data.length > 0) {
      setStyleAnalysis((profileRes.data[0] as { analysis: StyleAnalysis }).analysis);
    }
    setPerformance((perfRes.data as PostPerformance[]) || []);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const xAccount = accounts.find((a) => a.platform === "x");
  const threadsAccount = accounts.find((a) => a.platform === "threads");

  const handleAnalyze = async () => {
    const posts = sampleText.split("\n\n").filter((p) => p.trim().length > 0);
    if (posts.length < 5) {
      toast({ title: "At least 5 posts required (separated by blank lines)", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    const res = await fetch("/api/analyze-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ samplePosts: posts, profileName: "default", sampleSource: "manual" }),
    });
    if (res.ok) {
      const data = await res.json();
      setStyleAnalysis(data.profile.analysis);
      toast({ title: "Style analyzed!" });
    } else {
      toast({ title: "Analysis failed", variant: "destructive" });
    }
    setAnalyzing(false);
  };

  const handleFetchThreadsPosts = async () => {
    setFetchingThreads(true);
    toast({ title: "Fetching Threads posts (API call required in production)" });
    setFetchingThreads(false);
  };

  const handleSaveSchedule = async () => {
    if (!schedule) return;
    setSavingSchedule(true);
    await supabase
      .from("schedule_settings")
      .update({
        scheduling_mode: schedule.scheduling_mode,
        day_posts: schedule.day_posts,
        fixed_times: schedule.fixed_times,
        min_interval_hours: schedule.min_interval_hours,
        blackout_hours: schedule.blackout_hours,
        best_time_source: schedule.best_time_source,
        updated_at: new Date().toISOString(),
      })
      .eq("id", schedule.id);
    toast({ title: "Schedule saved" });
    setSavingSchedule(false);
  };

  // Prepare performance chart data
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const hourPerf = performance.filter((p) => p.hour_of_day === h);
    return {
      hour: `${h}:00`,
      engagement: hourPerf.length > 0
        ? hourPerf.reduce((sum, p) => sum + (p.engagement_score || 0), 0) / hourPerf.length
        : 0,
    };
  });

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Settings</h2>

      <Tabs defaultValue="style">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="style">Style</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="connect">Connect</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Style Tab */}
        <TabsContent value="style" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Style Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Paste 10-20 sample posts (separated by blank lines)..."
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                rows={8}
              />
              <div className="flex gap-2">
                <Button onClick={handleAnalyze} disabled={analyzing}>
                  {analyzing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Analyze
                </Button>
                {threadsAccount && (
                  <Button variant="outline" onClick={handleFetchThreadsPosts} disabled={fetchingThreads}>
                    {fetchingThreads && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Fetch Threads Posts
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {styleAnalysis && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Analysis Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Tone:</span> {styleAnalysis.tone}
                </div>
                <div>
                  <span className="text-muted-foreground">Summary:</span> {styleAnalysis.summary}
                </div>
                <div>
                  <span className="text-muted-foreground">Vocabulary:</span> {styleAnalysis.vocabulary_level}
                </div>
                <div>
                  <span className="text-muted-foreground">Hooks:</span>{" "}
                  {styleAnalysis.hooks?.join(", ")}
                </div>
                <div>
                  <span className="text-muted-foreground">Traits:</span>{" "}
                  {styleAnalysis.personality_traits?.join(", ")}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="space-y-4">
          {schedule && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Scheduling Mode</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {SCHEDULE_MODES.map((mode) => (
                      <Button
                        key={mode}
                        size="sm"
                        variant={schedule.scheduling_mode === mode ? "default" : "outline"}
                        onClick={() => setSchedule({ ...schedule, scheduling_mode: mode })}
                      >
                        {mode}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Posts per Day</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {DAY_KEYS.map((key, i) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-10 text-sm">{DAY_LABELS[i]}</span>
                      <Slider
                        min={0}
                        max={10}
                        value={[(schedule.day_posts as Record<string, number>)?.[key] || 0]}
                        onValueChange={([v]) =>
                          setSchedule({
                            ...schedule,
                            day_posts: { ...schedule.day_posts, [key]: v },
                          })
                        }
                        className="flex-1"
                      />
                      <span className="w-6 text-sm text-right">
                        {(schedule.day_posts as Record<string, number>)?.[key] || 0}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {(schedule.scheduling_mode === "fixed" || schedule.scheduling_mode === "hybrid") && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Fixed Times</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="time"
                        value={fixedTimeInput}
                        onChange={(e) => setFixedTimeInput(e.target.value)}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (fixedTimeInput) {
                            setSchedule({
                              ...schedule,
                              fixed_times: [...(schedule.fixed_times || []), fixedTimeInput],
                            });
                            setFixedTimeInput("");
                          }
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(schedule.fixed_times || []).map((t, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() =>
                            setSchedule({
                              ...schedule,
                              fixed_times: schedule.fixed_times?.filter((_, j) => j !== i) || [],
                            })
                          }
                        >
                          {t} x
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Blackout Hours</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-8 gap-1">
                    {Array.from({ length: 24 }, (_, h) => (
                      <Button
                        key={h}
                        size="sm"
                        variant={schedule.blackout_hours?.includes(h) ? "destructive" : "outline"}
                        className="h-8 w-full text-xs"
                        onClick={() => {
                          const current = schedule.blackout_hours || [];
                          setSchedule({
                            ...schedule,
                            blackout_hours: current.includes(h)
                              ? current.filter((x) => x !== h)
                              : [...current, h],
                          });
                        }}
                      >
                        {h}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Button className="w-full" onClick={handleSaveSchedule} disabled={savingSchedule}>
                {savingSchedule ? "Saving..." : "Save Schedule"}
              </Button>
            </>
          )}
        </TabsContent>

        {/* Connect Tab */}
        <TabsContent value="connect" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">X (Twitter)</CardTitle>
            </CardHeader>
            <CardContent>
              {xAccount ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm">{xAccount.account_handle}</span>
                </div>
              ) : (
                <a
                  href="/api/auth/x"
                  className="inline-flex items-center justify-center h-10 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Connect X
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Threads</CardTitle>
            </CardHeader>
            <CardContent>
              {threadsAccount ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm">{threadsAccount.account_handle}</span>
                </div>
              ) : (
                <a
                  href="/api/auth/threads"
                  className="inline-flex items-center justify-center h-10 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Connect Threads
                </a>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Engagement by Hour</CardTitle>
            </CardHeader>
            <CardContent>
              {performance.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="engagement" fill="hsl(126, 37%, 30%)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No performance data yet
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total Stats</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{performance.length}</p>
                <p className="text-xs text-muted-foreground">Total Posts</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {performance.reduce((sum, p) => sum + (p.likes || 0), 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total Likes</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {performance.reduce((sum, p) => sum + (p.impressions || 0), 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total Impressions</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {performance.reduce((sum, p) => sum + (p.reposts || 0), 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total Reposts</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
