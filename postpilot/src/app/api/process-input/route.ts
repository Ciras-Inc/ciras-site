import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { processFileInput, processUrlInput, extractKeyPoints } from '@/lib/data-input';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    // File upload
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await processFileInput(buffer, file.name, file.type);
    const keyPoints = await extractKeyPoints(text);

    const { data, error } = await supabase
      .from('content_inputs')
      .insert({
        user_id: user.id,
        input_type: 'file',
        content: keyPoints.join('\n'),
        original_content: text.slice(0, 5000),
        file_name: file.name,
        file_type: file.type,
        extracted_data: { key_points: keyPoints },
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ input: data });
  }

  // JSON body: keyword, topic, text, or URL
  const body = await request.json();
  const { type, content, url } = body;

  if (type === 'url' && url) {
    const text = await processUrlInput(url);
    const keyPoints = await extractKeyPoints(text);

    const { data, error } = await supabase
      .from('content_inputs')
      .insert({
        user_id: user.id,
        input_type: 'url',
        content: keyPoints.join('\n'),
        original_content: text.slice(0, 5000),
        source_url: url,
        extracted_data: { key_points: keyPoints },
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ input: data });
  }

  // keyword, topic, or text
  if (!content) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('content_inputs')
    .insert({
      user_id: user.id,
      input_type: type || 'keyword',
      content,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ input: data });
}
