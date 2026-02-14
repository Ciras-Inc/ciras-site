"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Check, X, Send, Loader2 } from "lucide-react";
import type { Post } from "@/types";

const STATUS_FILTERS = ["pending", "approved", "scheduled", "posted", "failed"] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  approved: "bg-blue-500/20 text-blue-400",
  scheduled: "bg-purple-500/20 text-purple-400",
  posted: "bg-green-500/20 text-green-400",
  posting: "bg-orange-500/20 text-orange-400",
  partial: "bg-orange-500/20 text-orange-400",
  failed: "bg-red-500/20 text-red-400",
  rejected: "bg-red-500/20 text-red-400",
};

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [postingId, setPostingId] = useState<string | null>(null);
  const [postingStep, setPostingStep] = useState("");
  const [platform, setPlatform] = useState<"x" | "threads">("x");

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/posts?status=${filter}`);
    const data = await res.json();
    setPosts(data.posts || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleApprove = async (id: string) => {
    await fetch(`/api/posts/${id}/approve`, { method: "POST" });
    toast({ title: "Approved and scheduled" });
    loadPosts();
  };

  const handleReject = async (id: string) => {
    await fetch(`/api/posts/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    });
    setFeedbackId(null);
    setFeedback("");
    toast({ title: "Rejected" });
    loadPosts();
  };

  const handlePostNow = async (post: Post) => {
    setPostingId(post.id);
    setPostingStep("X posting...");

    const res = await fetch(`/api/posts/${post.id}/post-now`, { method: "POST" });
    const result = await res.json();

    if (result.needsThreadsPublish) {
      setPostingStep("Threads preparing...");
      let countdown = 5;
      const interval = setInterval(() => {
        countdown--;
        setPostingStep(`Threads publishing in ${countdown}s...`);
        if (countdown <= 0) clearInterval(interval);
      }, 1000);

      await new Promise((r) => setTimeout(r, 5000));
      clearInterval(interval);

      setPostingStep("Publishing to Threads...");
      await fetch(`/api/posts/${post.id}/publish-threads`, { method: "POST" });
    }

    setPostingId(null);
    setPostingStep("");
    toast({ title: "Posted successfully!" });
    loadPosts();
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Posts</h2>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {STATUS_FILTERS.map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
            className="shrink-0"
          >
            {s}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 mb-2">
        <Button
          variant={platform === "x" ? "default" : "outline"}
          size="sm"
          onClick={() => setPlatform("x")}
        >
          X
        </Button>
        <Button
          variant={platform === "threads" ? "default" : "outline"}
          size="sm"
          onClick={() => setPlatform("threads")}
        >
          Threads
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No posts found</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge className={STATUS_COLORS[post.status] || ""}>
                    {post.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {(platform === "x" ? post.content_x : post.content_threads)?.length || 0} chars
                  </span>
                </div>

                <p className="text-sm whitespace-pre-wrap mb-3">
                  {platform === "x" ? post.content_x : post.content_threads}
                </p>

                {post.status === "pending" && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleApprove(post.id)}>
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          feedbackId === post.id
                            ? handleReject(post.id)
                            : setFeedbackId(post.id)
                        }
                      >
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                    {feedbackId === post.id && (
                      <Textarea
                        placeholder="Rejection feedback (optional)"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        rows={2}
                      />
                    )}
                  </div>
                )}

                {(post.status === "approved" || post.status === "scheduled") && (
                  <Button
                    size="sm"
                    onClick={() => handlePostNow(post)}
                    disabled={postingId === post.id}
                  >
                    {postingId === post.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        {postingStep}
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-1" /> Post Now
                      </>
                    )}
                  </Button>
                )}

                {post.scheduled_at && post.status === "scheduled" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Scheduled: {new Date(post.scheduled_at).toLocaleString("ja-JP")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
