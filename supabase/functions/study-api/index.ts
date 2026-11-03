import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const METHODS = new Set(['ours', 'editsplat', 'gaussctrl', 'imix2mix', 'rl3d']);
const DIMENSIONS = ['instruction_following', 'multi_view_consistency', 'visual_quality'];
const CASES = ['bear/brown-bear', 'bear/polar-bear', 'bicycle/winter', 'face/old', 'face/sunglasses', 'face/watercolor', 'horse/crystal', 'horse/wood', 'person/bronze', 'person/suit-red-tie'];
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json; charset=utf-8',
};

type State = { version: number; id: string; username: string; index: number; completed: boolean; orders: Record<string, string[]>; answers: Record<string, Record<string, string>> };
const respond = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers: corsHeaders });
const sameJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(sameJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${sameJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

function validate(raw: unknown): State {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid state');
  const state = raw as State;
  if (state.version !== 2 || !/^[a-f0-9]{32}$/.test(state.id || '')) throw new Error('Invalid state');
  if (typeof state.username !== 'string' || state.username.trim().length < 1 || state.username.trim().length > 60) throw new Error('Invalid username');
  if (!Number.isInteger(state.index) || state.index < 0 || state.index >= CASES.length || typeof state.completed !== 'boolean') throw new Error('Invalid state');
  if (!state.orders || !state.answers || typeof state.orders !== 'object' || typeof state.answers !== 'object') throw new Error('Invalid state');
  if (Object.keys(state.orders).length !== CASES.length || Object.keys(state.answers).length !== CASES.length) throw new Error('Invalid cases');
  for (const studyCase of CASES) {
    const order = state.orders[studyCase], answers = state.answers[studyCase];
    if (!Array.isArray(order) || order.length !== 5 || new Set(order).size !== 5 || !order.every(method => METHODS.has(method))) throw new Error('Invalid order');
    if (!answers || typeof answers !== 'object' || Object.keys(answers).some(key => !DIMENSIONS.includes(key)) || Object.values(answers).some(method => !METHODS.has(method))) throw new Error('Invalid answers');
    if (state.completed && !DIMENSIONS.every(dimension => METHODS.has(answers[dimension]))) throw new Error('Incomplete submission');
  }
  return { version: state.version, id: state.id, username: state.username.trim(), index: state.index, completed: state.completed, orders: state.orders, answers: state.answers };
}

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { autoRefreshToken: false, persistSession: false } });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed' });
  try {
    const body = await request.json();
    if (body.action === 'resume') {
      if (!/^[a-f0-9]{32}$/.test(body.id || '')) return respond(400, { error: 'Invalid recovery code' });
      const { data, error } = await supabase.from('study_sessions').select('revision,state').eq('id', body.id).maybeSingle();
      if (error) throw error;
      return data ? respond(200, data) : respond(404, { error: 'Record not found' });
    }
    if (body.action !== 'save') return respond(404, { error: 'Not found' });
    const state = validate(body.state);
    const revision = Number.isInteger(body.revision) && body.revision >= 0 ? body.revision : 0;
    const { data: previous, error: readError } = await supabase.from('study_sessions').select('revision,state').eq('id', state.id).maybeSingle();
    if (readError) throw readError;
    if (previous) {
      const oldState = previous.state as State;
      if (oldState.username !== state.username || sameJson(oldState.orders) !== sameJson(state.orders)) return respond(409, { error: 'Participant identity or order mismatch' });
      if (sameJson(oldState) === sameJson(state)) return respond(200, { revision: previous.revision });
      if (revision !== previous.revision) return respond(409, { error: 'Newer progress exists on another page' });
      const { data: updated, error: updateError } = await supabase.from('study_sessions').update({ state, completed: state.completed, revision: revision + 1, updated_at: new Date().toISOString() }).eq('id', state.id).eq('revision', revision).select('revision').maybeSingle();
      if (updateError) throw updateError;
      return updated ? respond(200, updated) : respond(409, { error: 'Newer progress exists on another page' });
    }
    if (revision !== 0) return respond(409, { error: 'Newer progress exists on another page' });
    const { data: inserted, error: insertError } = await supabase.from('study_sessions').insert({ id: state.id, username: state.username, state, completed: state.completed, revision: 1 }).select('revision').single();
    if (insertError?.code === '23505') return respond(409, { error: 'Newer progress exists on another page' });
    if (insertError) throw insertError;
    return respond(200, inserted);
  } catch (error) {
    console.error(error);
    return respond(500, { error: 'Could not save study progress' });
  }
});
