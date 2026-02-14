"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import type { GenerationRules, RuleTemplate } from "@/types";

const EMOJI_OPTIONS = ["none", "minimal", "moderate", "heavy"] as const;

export default function RulesPage() {
  const [rules, setRules] = useState<GenerationRules | null>(null);
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newNgWord, setNewNgWord] = useState("");
  const [newNgTopic, setNewNgTopic] = useState("");
  const supabase = createClient();

  const loadData = useCallback(async () => {
    const [rulesRes, templatesRes] = await Promise.all([
      supabase.from("generation_rules").select("*").single(),
      supabase.from("rule_templates").select("*").order("id"),
    ]);
    setRules(rulesRes.data as GenerationRules);
    setTemplates((templatesRes.data as RuleTemplate[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!rules) return;
    setSaving(true);
    await supabase
      .from("generation_rules")
      .update({
        active_template: rules.active_template,
        x_min_chars: rules.x_min_chars,
        x_max_chars: rules.x_max_chars,
        threads_min_chars: rules.threads_min_chars,
        threads_max_chars: rules.threads_max_chars,
        custom_rules: rules.custom_rules,
        hashtag_min: rules.hashtag_min,
        hashtag_max: rules.hashtag_max,
        fixed_hashtags: rules.fixed_hashtags,
        emoji_usage: rules.emoji_usage,
        prohibited_words: rules.prohibited_words,
        prohibited_topics: rules.prohibited_topics,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rules.id);
    toast({ title: "Rules saved" });
    setSaving(false);
  };

  if (loading || !rules) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Generation Rules</h2>

      {/* Templates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                rules.active_template === t.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onClick={() => setRules({ ...rules, active_template: t.id })}
            >
              <p className="font-medium text-sm">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Character limits */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Character Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">
              X: {rules.x_min_chars} - {rules.x_max_chars} chars
            </label>
            <div className="flex gap-2 items-center">
              <Slider
                min={20}
                max={280}
                value={[rules.x_min_chars]}
                onValueChange={([v]) => setRules({ ...rules, x_min_chars: v })}
              />
              <Slider
                min={20}
                max={280}
                value={[rules.x_max_chars]}
                onValueChange={([v]) => setRules({ ...rules, x_max_chars: v })}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Threads: {rules.threads_min_chars} - {rules.threads_max_chars} chars
            </label>
            <div className="flex gap-2 items-center">
              <Slider
                min={20}
                max={500}
                value={[rules.threads_min_chars]}
                onValueChange={([v]) => setRules({ ...rules, threads_min_chars: v })}
              />
              <Slider
                min={20}
                max={500}
                value={[rules.threads_max_chars]}
                onValueChange={([v]) => setRules({ ...rules, threads_max_chars: v })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom Rules */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Custom Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Add custom rules for AI generation..."
            value={rules.custom_rules || ""}
            onChange={(e) => setRules({ ...rules, custom_rules: e.target.value })}
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Hashtags */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Hashtags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">
              Count: {rules.hashtag_min} - {rules.hashtag_max}
            </label>
            <div className="flex gap-2">
              <Slider
                min={0}
                max={10}
                value={[rules.hashtag_min]}
                onValueChange={([v]) => setRules({ ...rules, hashtag_min: v })}
              />
              <Slider
                min={0}
                max={10}
                value={[rules.hashtag_max]}
                onValueChange={([v]) => setRules({ ...rules, hashtag_max: v })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="#hashtag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={() => {
                if (newTag.trim()) {
                  setRules({
                    ...rules,
                    fixed_hashtags: [...(rules.fixed_hashtags || []), newTag.trim()],
                  });
                  setNewTag("");
                }
              }}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(rules.fixed_hashtags || []).map((tag, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="cursor-pointer"
                onClick={() =>
                  setRules({
                    ...rules,
                    fixed_hashtags: rules.fixed_hashtags?.filter((_, j) => j !== i) || [],
                  })
                }
              >
                {tag} x
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Emoji */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Emoji Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {EMOJI_OPTIONS.map((opt) => (
              <Button
                key={opt}
                size="sm"
                variant={rules.emoji_usage === opt ? "default" : "outline"}
                onClick={() => setRules({ ...rules, emoji_usage: opt })}
              >
                {opt}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* NG Words */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">NG Words / Topics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="NG word"
              value={newNgWord}
              onChange={(e) => setNewNgWord(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={() => {
                if (newNgWord.trim()) {
                  setRules({
                    ...rules,
                    prohibited_words: [...(rules.prohibited_words || []), newNgWord.trim()],
                  });
                  setNewNgWord("");
                }
              }}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(rules.prohibited_words || []).map((w, i) => (
              <Badge
                key={i}
                variant="destructive"
                className="cursor-pointer"
                onClick={() =>
                  setRules({
                    ...rules,
                    prohibited_words: rules.prohibited_words?.filter((_, j) => j !== i) || [],
                  })
                }
              >
                {w} x
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="NG topic"
              value={newNgTopic}
              onChange={(e) => setNewNgTopic(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={() => {
                if (newNgTopic.trim()) {
                  setRules({
                    ...rules,
                    prohibited_topics: [...(rules.prohibited_topics || []), newNgTopic.trim()],
                  });
                  setNewNgTopic("");
                }
              }}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(rules.prohibited_topics || []).map((t, i) => (
              <Badge
                key={i}
                variant="destructive"
                className="cursor-pointer"
                onClick={() =>
                  setRules({
                    ...rules,
                    prohibited_topics: rules.prohibited_topics?.filter((_, j) => j !== i) || [],
                  })
                }
              >
                {t} x
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Rules"}
      </Button>
    </div>
  );
}
