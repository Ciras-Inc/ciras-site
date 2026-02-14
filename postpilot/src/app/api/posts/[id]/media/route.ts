import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const altText = formData.get('alt_text') as string | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop() || 'jpg';
  const filePath = `${user.id}/${id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('media')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabaseAdmin.storage
    .from('media')
    .getPublicUrl(filePath);

  const mediaUrl = urlData.publicUrl;

  await supabase
    .from('posts')
    .update({
      has_media: true,
      media_url: mediaUrl,
      media_alt_text: altText,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return NextResponse.json({ mediaUrl });
}
