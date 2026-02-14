"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Clock, BarChart3, DollarSign } from "lucide-react";
import { format } from "date-fns";

interface DashboardData {
  stockCount: number;
  nextPost: string | null;
  monthlyPosts: number;
  estimatedCost: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    stockCount: 0,
    nextPost: null,
    monthlyPosts: 0,
    estimatedCost: 0,
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [stockRes, nextRes, monthRes] = await Promise.all([
        supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .in("status", ["pending", "approved", "scheduled"]),
        supabase
          .from("posts")
          .select("scheduled_at")
          .eq("status", "scheduled")
          .order("scheduled_at", { ascending: true })
          .limit(1),
        supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("status", "posted")
          .gte("posted_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);

      setData({
        stockCount: stockRes.count || 0,
        nextPost: nextRes.data?.[0]?.scheduled_at || null,
        monthlyPosts: monthRes.count || 0,
        estimatedCost: (monthRes.count || 0) * 0.003,
      });
      setLoading(false);
    }

    loadData();
  }, [supabase]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Dashboard</h2>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Stock</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stockCount}</div>
            <p className="text-xs text-muted-foreground">pending / approved / scheduled</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Next Post</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {data.nextPost
                ? format(new Date(data.nextPost), "M/d HH:mm")
                : "--"}
            </div>
            <p className="text-xs text-muted-foreground">scheduled</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Monthly</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.monthlyPosts}</div>
            <p className="text-xs text-muted-foreground">posts this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Est. Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.estimatedCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">AI generation cost</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
