"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { useDropzone } from "react-dropzone";
import { Upload, Link as LinkIcon, Type, Loader2, Sparkles, Trash2 } from "lucide-react";
import type { ContentInput } from "@/types";

export default function InputPage() {
  const [inputs, setInputs] = useState<ContentInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [url, setUrl] = useState("");
  const [textContent, setTextContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedInputs, setSelectedInputs] = useState<string[]>([]);
  const supabase = createClient();

  const loadInputs = useCallback(async () => {
    const { data } = await supabase
      .from("content_inputs")
      .select("*")
      .order("created_at", { ascending: false });
    setInputs((data as ContentInput[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadInputs();
  }, [loadInputs]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      setSubmitting(true);
      const file = acceptedFiles[0];
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/process-input", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        toast({ title: "File processed" });
        loadInputs();
      } else {
        toast({ title: "File processing failed", variant: "destructive" });
      }
      setSubmitting(false);
    },
    [loadInputs]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "text/csv": [".csv"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
  });

  const handleSubmitKeyword = async () => {
    if (!keyword.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/process-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "keyword", content: keyword }),
    });
    if (res.ok) {
      toast({ title: "Keyword added" });
      setKeyword("");
      loadInputs();
    }
    setSubmitting(false);
  };

  const handleSubmitUrl = async () => {
    if (!url.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/process-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "url", url }),
    });
    if (res.ok) {
      toast({ title: "URL processed" });
      setUrl("");
      loadInputs();
    }
    setSubmitting(false);
  };

  const handleSubmitText = async () => {
    if (!textContent.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/process-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", content: textContent }),
    });
    if (res.ok) {
      toast({ title: "Text added" });
      setTextContent("");
      loadInputs();
    }
    setSubmitting(false);
  };

  const handleToggleActive = async (input: ContentInput) => {
    await supabase
      .from("content_inputs")
      .update({ is_active: !input.is_active })
      .eq("id", input.id);
    loadInputs();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("content_inputs").delete().eq("id", id);
    loadInputs();
  };

  const handleGenerate = async () => {
    if (selectedInputs.length === 0) {
      toast({ title: "Select at least one input", variant: "destructive" });
      return;
    }
    setGenerating(true);
    const input = inputs.find((i) => i.id === selectedInputs[0]);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: input?.content || "general",
        inputId: input?.id,
      }),
    });
    if (res.ok) {
      toast({ title: "Post generated!" });
      setSelectedInputs([]);
    } else {
      toast({ title: "Generation failed", variant: "destructive" });
    }
    setGenerating(false);
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Content Input</h2>

      {/* Keyword */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Type className="h-4 w-4" /> Keyword / Theme
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            placeholder="e.g., AI trends, productivity tips"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button size="sm" onClick={handleSubmitKeyword} disabled={submitting}>
            Add
          </Button>
        </CardContent>
      </Card>

      {/* Text */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Type className="h-4 w-4" /> Text Content
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            placeholder="Paste any text content..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={3}
          />
          <Button size="sm" onClick={handleSubmitText} disabled={submitting}>
            Add
          </Button>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4" /> File Upload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragActive ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop PDF, Excel, CSV, or TXT files here
            </p>
          </div>
        </CardContent>
      </Card>

      {/* URL */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <LinkIcon className="h-4 w-4" /> URL
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button size="sm" onClick={handleSubmitUrl} disabled={submitting}>
            Process
          </Button>
        </CardContent>
      </Card>

      {/* Generate button */}
      <Button
        className="w-full"
        onClick={handleGenerate}
        disabled={generating || selectedInputs.length === 0}
      >
        {generating ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-2" />
        )}
        Generate Post
      </Button>

      {/* Input list */}
      <h3 className="text-lg font-semibold">Registered Inputs</h3>
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {inputs.map((input) => (
            <Card
              key={input.id}
              className={`cursor-pointer transition-colors ${
                selectedInputs.includes(input.id) ? "ring-2 ring-primary" : ""
              }`}
              onClick={() =>
                setSelectedInputs((prev) =>
                  prev.includes(input.id)
                    ? prev.filter((id) => id !== input.id)
                    : [...prev, input.id]
                )
              }
            >
              <CardContent className="p-3 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">
                      {input.input_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      used: {input.used_count}
                    </span>
                  </div>
                  <p className="text-sm truncate">
                    {input.content || input.source_url || input.file_name}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant={input.is_active ? "default" : "outline"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleActive(input);
                    }}
                  >
                    {input.is_active ? "ON" : "OFF"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(input.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
